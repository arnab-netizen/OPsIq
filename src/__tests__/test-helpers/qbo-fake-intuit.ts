/**
 * In-memory fake of the Intuit accounting API + OAuth token endpoint for tests. No network.
 *
 * It RECORDS every request. Tests assert that every accounting-API request is a GET (and that the only POSTs go to the
 * OAuth token endpoint), which is how "zero QuickBooks writes" is proven at runtime in addition to the source scans.
 */

export interface FakeRecord { Id: string; SyncToken?: string; MetaData: { LastUpdatedTime: string }; [k: string]: unknown }

export interface RecordedRequest { method: string; url: URL; path: string; authorization: string | null }

type Inject = { status: number; headers?: Record<string, string>; body?: unknown } | "NETWORK" | "TIMEOUT" | "MALFORMED_JSON";

export interface FakeIntuit {
  fetchImpl: (input: string, init?: RequestInit) => Promise<Response>;
  requests: RecordedRequest[];
  data: { Customer: FakeRecord[]; Invoice: FakeRecord[]; Bill: FakeRecord[] };
  realmId: string;
  companyId: string;
  /** Queue failures for the next N matching requests: key is a path suffix e.g. "query", "companyinfo", "reports/ProfitAndLoss", "token". */
  inject: (pathSuffix: string, ...failures: Inject[]) => void;
  /** Override report bodies by name. */
  reports: Record<string, (params: URLSearchParams) => unknown>;
  /** Access-token values the API currently accepts (401 otherwise). Defaults to accepting any non-empty bearer. */
  validAccessTokens: Set<string> | null;
  /** Next refresh responses (token endpoint). Default: issue a fresh pair. */
  tokenResponses: Array<{ status: number; body: unknown }>;
  tokenCalls: number;
  currency: string;
  /** Entities deleted at Intuit ("Customer:7"): a read by id answers HTTP 400 + fault code 610; the query omits them (caller removes them from `data`). */
  deleted: Set<string>;
  /** Objects the QUERY omits but a read by id still returns (e.g. inactive customers). */
  inactive: Map<string, FakeRecord>;
  /**
   * HOSTILE ordering: when set, rows sharing one LastUpdatedTime are re-shuffled (seeded PRNG) on EVERY query request, so two
   * consecutive pages of an equal-timestamp bucket are not slices of one stable order. The primary (timestamp) order is still honoured.
   */
  shuffleTies: { seed: number } | null;
  /** HOSTILE: the provider ignores STARTPOSITION (every page is the first page) - an endless-paging trap. */
  ignoreStartPosition: boolean;
  /** Number of `SELECT count(*)` requests answered. */
  countCalls: number;
  nonTokenPosts: () => RecordedRequest[];
  accountingRequests: () => RecordedRequest[];
}

const iso = (d: Date) => d.toISOString();
export const inst = (s: string) => new Date(s).toISOString();

export function customer(id: string, updated: string, extra: Record<string, unknown> = {}): FakeRecord {
  return { Id: id, SyncToken: "0", MetaData: { LastUpdatedTime: inst(updated) }, DisplayName: `Customer ${id}`, Balance: 0, Active: true, PrimaryEmailAddr: { Address: `pii-${id}@example.com` }, PrimaryPhone: { FreeFormNumber: "555-0100" }, CurrencyRef: { value: "USD" }, ...extra };
}
export function invoice(id: string, updated: string, extra: Record<string, unknown> = {}): FakeRecord {
  return { Id: id, SyncToken: "1", MetaData: { LastUpdatedTime: inst(updated) }, DocNumber: `INV-${id}`, TxnDate: "2026-09-01", DueDate: "2026-09-30", TotalAmt: 100, Balance: 40, CurrencyRef: { value: "USD" }, CustomerRef: { value: "1" }, ...extra };
}
export function bill(id: string, updated: string, extra: Record<string, unknown> = {}): FakeRecord {
  return { Id: id, SyncToken: "0", MetaData: { LastUpdatedTime: inst(updated) }, DocNumber: `B-${id}`, TxnDate: "2026-09-02", DueDate: "2026-10-02", TotalAmt: 250.5, Balance: 250.5, CurrencyRef: { value: "USD" }, VendorRef: { value: "9" }, ...extra };
}

const cell = (value: string) => ({ value });
const section = (group: string, label: string, amount: string | null) => ({
  type: "Section", group, Summary: { ColData: [cell(label), ...(amount === null ? [] : [cell(amount)])] },
});

export function profitAndLossBody(p: URLSearchParams, currency: string, o: { income?: string | null; cogs?: string | null; gross?: string | null } = {}): unknown {
  const income = o.income === undefined ? "10000.00" : o.income;
  const cogs = o.cogs === undefined ? "4000.00" : o.cogs;
  const gross = o.gross === undefined ? "6000.00" : o.gross;
  const rows = [
    ...(income === null ? [] : [section("Income", "Total Income", income)]),
    ...(cogs === null ? [] : [section("COGS", "Total Cost of Goods Sold", cogs)]),
    ...(gross === null ? [] : [section("GrossProfit", "Gross Profit", gross)]),
    section("Expenses", "Total Expenses", "2500.00"),
    section("NetIncome", "Net Income", "3500.00"),
  ];
  return {
    Header: { Time: "2026-10-10T03:00:00-07:00", ReportName: "ProfitAndLoss", ReportBasis: p.get("accounting_method") ?? "Accrual", StartPeriod: p.get("start_date"), EndPeriod: p.get("end_date"), Currency: currency },
    Columns: { Column: [{ ColTitle: "", ColType: "Account" }, { ColTitle: "Total", ColType: "Money" }] },
    Rows: { Row: rows },
  };
}

export function balanceSheetBody(p: URLSearchParams, currency: string): unknown {
  return {
    Header: { Time: "2026-10-10T03:00:00-07:00", ReportName: "BalanceSheet", ReportBasis: p.get("accounting_method") ?? "Accrual", StartPeriod: p.get("start_date"), EndPeriod: p.get("end_date"), Currency: currency },
    Columns: { Column: [{ ColTitle: "", ColType: "Account" }, { ColTitle: "Total", ColType: "Money" }] },
    Rows: {
      Row: [
        { type: "Section", group: "TotalAssets", Header: { ColData: [cell("ASSETS"), cell("")] }, Rows: { Row: [
          { type: "Section", group: "CurrentAssets", Rows: { Row: [
            { type: "Section", group: "BankAccounts", Summary: { ColData: [cell("Total Bank Accounts"), cell("8200.50")] } },
            { type: "Section", group: "AR", Summary: { ColData: [cell("Total Accounts Receivable"), cell("1500.00")] } },
          ] }, Summary: { ColData: [cell("Total Current Assets"), cell("9700.50")] } },
        ] }, Summary: { ColData: [cell("TOTAL ASSETS"), cell("9700.50")] } },
        { type: "Section", group: "Liabilities", Rows: { Row: [
          { type: "Section", group: "CurrentLiabilities", Rows: { Row: [{ type: "Section", group: "AP", Summary: { ColData: [cell("Total Accounts Payable"), cell("640.00")] } }] }, Summary: { ColData: [cell("Total Current Liabilities"), cell("640.00")] } },
        ] }, Summary: { ColData: [cell("Total Liabilities"), cell("640.00")] } },
        section("Equity", "Total Equity", "9060.50"),
      ],
    },
  };
}

export function agedBody(p: URLSearchParams, currency: string, name: string, o: { current?: string; buckets?: [string, string, string, string]; total?: string; empty?: boolean } = {}): unknown {
  const current = o.current ?? "300.00";
  const buckets = o.buckets ?? ["100.00", "50.00", "", "25.00"];
  const total = o.total ?? "475.00";
  const header = {
    Time: "2026-10-10T03:00:00-07:00", ReportName: name, ReportBasis: "Accrual", StartPeriod: p.get("report_date"), EndPeriod: p.get("report_date"), Currency: currency,
  };
  const Columns = { Column: ["", "Current", "1 - 30", "31 - 60", "61 - 90", "91 and over", "Total"].map((t) => ({ ColTitle: t, ColType: t === "" ? "Customer" : "Money" })) };
  if (o.empty) return { Header: header, Columns, Rows: {} };
  return {
    Header: header, Columns,
    Rows: { Row: [
      { type: "Data", ColData: [cell("Acme"), cell(current), ...buckets.map(cell), cell(total)] },
      { type: "Section", group: "GrandTotal", Summary: { ColData: [cell("TOTAL"), cell(current), ...buckets.map(cell), cell(total)] } },
    ] },
  };
}

export function createFakeIntuit(opts: { realmId: string; currency?: string; companyId?: string }): FakeIntuit {
  const currency = opts.currency ?? "USD";
  const queues = new Map<string, Inject[]>();
  const fake: FakeIntuit = {
    requests: [],
    data: { Customer: [], Invoice: [], Bill: [] },
    realmId: opts.realmId,
    companyId: opts.companyId ?? opts.realmId,
    currency,
    deleted: new Set<string>(),
    inactive: new Map<string, FakeRecord>(),
    reports: {},
    shuffleTies: null,
    ignoreStartPosition: false,
    countCalls: 0,
    validAccessTokens: null,
    tokenResponses: [],
    tokenCalls: 0,
    inject: (suffix, ...f) => { queues.set(suffix, [...(queues.get(suffix) ?? []), ...f]); },
    nonTokenPosts: () => fake.requests.filter((r) => r.method !== "GET" && !r.path.endsWith("/tokens/bearer")),
    accountingRequests: () => fake.requests.filter((r) => r.url.hostname.endsWith("quickbooks.api.intuit.com")),
    fetchImpl: async (input, init) => {
      const url = new URL(input);
      const method = (init?.method ?? "GET").toUpperCase();
      const headers = new Headers(init?.headers);
      const path = url.pathname;
      fake.requests.push({ method, url, path, authorization: headers.get("authorization") });
      const take = (): Inject | undefined => {
        for (const [suffix, q] of queues) {
          if (path.endsWith(suffix) && q.length > 0) return q.shift();
        }
        return undefined;
      };
      const json = (status: number, body: unknown, h: Record<string, string> = {}) =>
        new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", intuit_tid: "tid-fake", ...h } });

      const failure = take();
      if (failure === "NETWORK") throw new TypeError("network down");
      if (failure === "TIMEOUT") return new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
      if (failure === "MALFORMED_JSON") return new Response("<html>not json", { status: 200, headers: { "content-type": "text/html" } });
      if (failure) return json(failure.status, failure.body ?? { Fault: { Error: [{ code: "9999" }] } }, failure.headers);

      if (path.endsWith("/tokens/bearer")) {
        fake.tokenCalls++;
        const next = fake.tokenResponses.shift();
        if (next) return json(next.status, next.body);
        const n = fake.tokenCalls;
        return json(200, { access_token: `fresh-access-${n}-${Math.random().toString(36).slice(2)}`, refresh_token: `fresh-refresh-${n}-${Math.random().toString(36).slice(2)}`, token_type: "bearer", expires_in: 3600, x_refresh_token_expires_in: 8_640_000 });
      }

      if (method !== "GET") return json(405, { error: "write attempted" });
      const bearer = (headers.get("authorization") ?? "").replace(/^Bearer /, "");
      if (!bearer || (fake.validAccessTokens && !fake.validAccessTokens.has(bearer))) return json(401, { Fault: { Error: [{ code: "3200" }] } });
      if (!path.startsWith(`/v3/company/${opts.realmId}/`)) return json(403, { Fault: { Error: [{ code: "403" }] } });

      const rest = path.slice(`/v3/company/${opts.realmId}/`.length);
      if (rest === `companyinfo/${opts.realmId}`) return json(200, { CompanyInfo: { Id: fake.companyId, CompanyName: "Sandbox Company", Country: "US", FiscalYearStartMonth: "January", SyncToken: "3", MetaData: { LastUpdatedTime: iso(new Date("2026-01-01T00:00:00Z")) } } });
      if (rest.startsWith("reports/")) {
        const name = decodeURIComponent(rest.slice("reports/".length));
        const custom = fake.reports[name];
        if (custom) return json(200, custom(url.searchParams));
        if (name === "ProfitAndLoss") return json(200, profitAndLossBody(url.searchParams, currency));
        if (name === "BalanceSheet") return json(200, balanceSheetBody(url.searchParams, currency));
        if (name === "AgedReceivables" || name === "AgedPayables") return json(200, agedBody(url.searchParams, currency, name));
        return json(404, { Fault: { Error: [{ code: "404" }] } });
      }
      const byId = /^(customer|invoice|bill)\/([^/]+)$/.exec(rest);
      if (byId) {
        const entity = (byId[1][0].toUpperCase() + byId[1].slice(1)) as keyof FakeIntuit["data"];
        const id = decodeURIComponent(byId[2]);
        if (fake.deleted.has(`${entity}:${id}`)) return json(400, { Fault: { Error: [{ code: "610", Message: "Object Not Found" }], type: "ValidationFault" } });
        const found = fake.inactive.get(`${entity}:${id}`) ?? fake.data[entity].find((r) => r.Id === id);
        if (!found) return json(400, { Fault: { Error: [{ code: "610", Message: "Object Not Found" }], type: "ValidationFault" } });
        return json(200, { [entity]: found, time: iso(new Date()) });
      }
      if (rest === "query") {
        const q = url.searchParams.get("query") ?? "";
        const applyWhere = (rows: FakeRecord[], where: string | undefined): FakeRecord[] | null => {
          let filtered = [...rows];
          for (const c of (where ?? "").split(" AND ").filter(Boolean)) {
            const cm = /^MetaData\.LastUpdatedTime (>=|<=|>|<) '([^']+)'$/.exec(c);
            if (!cm) return null;
            const bound = Date.parse(cm[2]);
            filtered = filtered.filter((r) => {
              const t = Date.parse(r.MetaData.LastUpdatedTime);
              return cm[1] === ">=" ? t >= bound : cm[1] === "<=" ? t <= bound : cm[1] === ">" ? t > bound : t < bound;
            });
          }
          return filtered;
        };
        const cnt = /^SELECT count\(\*\) FROM (\w+)(?: WHERE (.*))?$/.exec(q);
        if (cnt) {
          const rows = fake.data[cnt[1] as keyof FakeIntuit["data"]];
          if (!rows) return json(400, { Fault: { Error: [{ code: "4001" }] } });
          const filtered = applyWhere(rows, cnt[2]);
          if (!filtered) return json(400, { Fault: { Error: [{ code: "4002" }] } });
          fake.countCalls++;
          return json(200, { QueryResponse: { totalCount: filtered.length }, time: iso(new Date()) });
        }
        const m = /^SELECT \* FROM (\w+)(?: WHERE (.*?))?(?: ORDERBY ([\w.]+)( DESC)?)? STARTPOSITION (\d+) MAXRESULTS (\d+)$/.exec(q);
        if (!m) return json(400, { Fault: { Error: [{ code: "4000" }] } });
        const entity = m[1] as keyof FakeIntuit["data"];
        const rows = fake.data[entity];
        if (!rows) return json(400, { Fault: { Error: [{ code: "4001" }] } });
        const filtered = applyWhere(rows, m[2]);
        if (!filtered) return json(400, { Fault: { Error: [{ code: "4002" }] } });
        if (fake.shuffleTies) {
          // Seeded per request (request count) so a run is reproducible but every page sees a different tie order.
          let x = (fake.shuffleTies.seed + fake.requests.length * 2654435761) >>> 0;
          const rnd = () => { x = (Math.imul(x ^ (x >>> 15), 2246822507) + 0x9e3779b9) >>> 0; return x / 4294967296; };
          const key = new Map(filtered.map((r) => [r, rnd()]));
          filtered.sort((a, b) => Date.parse(a.MetaData.LastUpdatedTime) - Date.parse(b.MetaData.LastUpdatedTime) || (key.get(a) as number) - (key.get(b) as number));
        } else {
          filtered.sort((a, b) => Date.parse(a.MetaData.LastUpdatedTime) - Date.parse(b.MetaData.LastUpdatedTime) || a.Id.localeCompare(b.Id));
        }
        const start = fake.ignoreStartPosition ? 1 : Number(m[5]);
        const page = filtered.slice(start - 1, start - 1 + Number(m[6]));
        return json(200, { QueryResponse: page.length ? { [entity]: page, startPosition: start, maxResults: page.length } : {}, time: iso(new Date()) });
      }
      return json(404, { Fault: { Error: [{ code: "404" }] } });
    },
  };
  return fake;
}
