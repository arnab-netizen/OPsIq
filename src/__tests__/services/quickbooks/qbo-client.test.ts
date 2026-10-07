import { describe, it, expect, vi, afterEach } from "vitest";
import { resolveQboConfig, QBO_MINOR_VERSION, type QboProviderConfig } from "@/domain/quickbooks/qbo-config";
import { QboProviderError } from "@/domain/quickbooks/qbo-errors";
import { createQboReadClient, type QboClientOptions } from "@/services/quickbooks/qbo-client";
import { QboRealmRateLimiter } from "@/services/quickbooks/qbo-rate-limiter";

const REALM = "9130357000000001";
const TOKEN = "access-token-SENSITIVE-xyz";

function config(env: "sandbox" | "production" = "sandbox"): QboProviderConfig {
  const r = resolveQboConfig({
    QUICKBOOKS_CLIENT_ID: "cid",
    QUICKBOOKS_CLIENT_SECRET: "csecret-SENSITIVE",
    QUICKBOOKS_REDIRECT_URI: "https://app.opsiq.example/cb",
    QUICKBOOKS_ENVIRONMENT: env,
  });
  if (!r.available) throw new Error("bad test config");
  return r.config;
}

interface Call {
  url: URL;
  method: string;
  headers: Record<string, string>;
}
function harness(responses: Array<Response | Error | ((call: Call) => Response | Promise<Response>)>, over: Partial<QboClientOptions> = {}) {
  const calls: Call[] = [];
  const sleeps: number[] = [];
  let i = 0;
  const fetchImpl = async (url: string, init?: RequestInit) => {
    const call: Call = { url: new URL(url), method: String(init?.method), headers: Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>)) };
    calls.push(call);
    const r = responses[Math.min(i++, responses.length - 1)];
    if (r instanceof Error) throw r;
    return typeof r === "function" ? r(call) : r.clone();
  };
  const client = createQboReadClient({
    config: config(),
    realmId: REALM,
    getAccessToken: async () => TOKEN,
    fetchImpl,
    limiter: new QboRealmRateLimiter({ perSecond: 1000, perMinute: 100000, maxConcurrent: 100 }),
    sleep: async (ms) => void sleeps.push(ms),
    random: () => 0.5,
    ...over,
  });
  return { client, calls, sleeps };
}
const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const queryBody = (entity: string, rows: unknown[]) => ({ QueryResponse: rows.length ? { [entity]: rows, startPosition: 1, maxResults: rows.length } : { startPosition: 1, maxResults: 0 }, time: "t" });

afterEach(() => vi.restoreAllMocks());

describe("only configs produced by resolveQboConfig are accepted", () => {
  it("a forged config pointing at another host is refused at construction", () => {
    const forged = { ...config(), apiBaseUrl: "https://evil.example" } as QboProviderConfig;
    const e = (() => {
      try {
        createQboReadClient({ config: forged, realmId: REALM, getAccessToken: async () => TOKEN });
      } catch (x) {
        return x as QboProviderError;
      }
      return null;
    })();
    expect(e?.kind).toBe("CONFIGURATION_ERROR");
    expect(e?.localReason).toBe("UNRESOLVED_CONFIG");
  });
});

describe("URL, host and headers", () => {
  it("uses the sandbox host, the realm path, the pinned minorversion, GET and a bearer token", async () => {
    const { client, calls } = harness([json(200, { CompanyInfo: { CompanyName: "Acme" } }, { intuit_tid: "tid-1" })]);
    const info = await client.companyInfo();
    expect(info).toEqual({ CompanyName: "Acme" });
    const c = calls[0];
    expect(c.url.origin).toBe("https://sandbox-quickbooks.api.intuit.com");
    expect(c.url.pathname).toBe(`/v3/company/${REALM}/companyinfo/${REALM}`);
    expect(c.url.searchParams.get("minorversion")).toBe(String(QBO_MINOR_VERSION));
    expect(c.method).toBe("GET");
    expect(c.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(c.headers.Accept).toBe("application/json");
  });

  it("uses the production host in production", async () => {
    const calls: string[] = [];
    const client = createQboReadClient({
      config: config("production"),
      realmId: REALM,
      getAccessToken: async () => TOKEN,
      fetchImpl: async (u) => (calls.push(u), json(200, { CompanyInfo: {} })),
      limiter: new QboRealmRateLimiter(),
    });
    await client.companyInfo();
    expect(new URL(calls[0]).origin).toBe("https://quickbooks.api.intuit.com");
  });

  it("validates the realm id before any URL exists", () => {
    for (const bad of ["", "abc", "123/../1", "123?x", "evil.com", "1".repeat(21), "12 3"]) {
      expect(() => createQboReadClient({ config: config(), realmId: bad, getAccessToken: async () => TOKEN })).toThrow(QboProviderError);
    }
  });

  it("refuses an access token that is not header-safe (no header injection)", async () => {
    const { client, calls } = harness([json(200, {})], { getAccessToken: async () => "tok\r\nX-Evil: 1" });
    const e = await client.companyInfo().catch((x) => x);
    expect(e.kind).toBe("AUTH_EXPIRED");
    expect(calls).toHaveLength(0);
  });
});

describe("read operations", () => {
  it("query builds a validated statement and returns typed records plus the trace id", async () => {
    const { client, calls } = harness([json(200, queryBody("Invoice", [{ Id: "1" }, { Id: "2" }]), { intuit_tid: "tid-q" })]);
    const page = await client.query({ entity: "Invoice", where: [{ field: "Balance", op: ">", value: 0 }], orderBy: { field: "Id" }, maxResults: 100 });
    expect(calls[0].url.pathname).toBe(`/v3/company/${REALM}/query`);
    expect(calls[0].url.searchParams.get("query")).toBe("SELECT * FROM Invoice WHERE Balance > 0 ORDERBY Id STARTPOSITION 1 MAXRESULTS 100");
    expect(page.records).toEqual([{ Id: "1" }, { Id: "2" }]);
    expect(page.intuitTid).toBe("tid-q");
  });

  it("an empty page (entity key omitted by Intuit) is an empty list, not an error", async () => {
    const { client } = harness([json(200, queryBody("Invoice", []))]);
    expect((await client.query({ entity: "Invoice" })).records).toEqual([]);
  });

  it("paginates in pages of 1000 by STARTPOSITION until a short page", async () => {
    const full = Array.from({ length: 1000 }, (_, i) => ({ Id: String(i) }));
    const { client, calls } = harness([json(200, queryBody("Customer", full)), json(200, queryBody("Customer", full)), json(200, queryBody("Customer", [{ Id: "x" }]))]);
    const sizes: number[] = [];
    for await (const page of client.paginate({ entity: "Customer", orderBy: { field: "Id" } })) sizes.push(page.records.length);
    expect(sizes).toEqual([1000, 1000, 1]);
    expect(calls.map((c) => c.url.searchParams.get("query"))).toEqual([
      "SELECT * FROM Customer ORDERBY Id STARTPOSITION 1 MAXRESULTS 1000",
      "SELECT * FROM Customer ORDERBY Id STARTPOSITION 1001 MAXRESULTS 1000",
      "SELECT * FROM Customer ORDERBY Id STARTPOSITION 2001 MAXRESULTS 1000",
    ]);
  });

  it("pagination fails loudly at its page bound instead of silently truncating", async () => {
    const full = Array.from({ length: 2 }, (_, i) => ({ Id: String(i) }));
    const { client } = harness([json(200, queryBody("Customer", full))]);
    const run = async () => {
      for await (const _page of client.paginate({ entity: "Customer", maxResults: 2 }, { maxPages: 3 })) void _page;
    };
    const e = await run().catch((x) => x);
    expect(e.kind).toBe("BAD_REQUEST");
    expect(e.localReason).toBe("PAGINATION_LIMIT_REACHED");
  });

  it("invalid query specs never reach the network", async () => {
    const { client, calls } = harness([json(200, {})]);
    // @ts-expect-error deliberately invalid
    const e = await client.query({ entity: "Employee" }).catch((x) => x);
    expect(e.kind).toBe("BAD_REQUEST");
    expect(calls).toHaveLength(0);
  });

  it("readEntity validates the id and entity, and returns the record", async () => {
    const { client, calls } = harness([json(200, { Invoice: { Id: "7" } })]);
    expect(await client.readEntity("Invoice", "7")).toEqual({ Id: "7" });
    expect(calls[0].url.pathname).toBe(`/v3/company/${REALM}/invoice/7`);
    for (const bad of ["../x", "7/../8", "7?x=1", "abc", ""]) {
      expect((await client.readEntity("Invoice", bad).catch((x) => x)).kind).toBe("BAD_REQUEST");
    }
    expect(calls).toHaveLength(1);
  });

  it("reports: allowlisted name and parameters only", async () => {
    const { client, calls } = harness([json(200, { Header: {}, Rows: {} })]);
    await client.report("ProfitAndLoss", { start_date: "2026-01-01", end_date: "2026-01-31", accounting_method: "Accrual" });
    expect(calls[0].url.pathname).toBe(`/v3/company/${REALM}/reports/ProfitAndLoss`);
    expect(calls[0].url.searchParams.get("start_date")).toBe("2026-01-01");
    // @ts-expect-error deliberately invalid
    expect((await client.report("../../company", {}).catch((x) => x)).kind).toBe("BAD_REQUEST");
    // @ts-expect-error deliberately invalid
    expect((await client.report("BalanceSheet", { evil: "1" }).catch((x) => x)).kind).toBe("BAD_REQUEST");
    expect(calls).toHaveLength(1);
  });

  it("rejects malformed 2xx bodies as MALFORMED_RESPONSE", async () => {
    for (const bad of [new Response("<html/>", { status: 200 }), new Response("", { status: 200 }), json(200, [1]), json(200, { QueryResponse: "x" }), json(200, { QueryResponse: { Invoice: "nope" } })]) {
      const { client } = harness([bad]);
      expect((await client.query({ entity: "Invoice" }).catch((x) => x)).kind).toBe("MALFORMED_RESPONSE");
    }
    const { client } = harness([json(200, { NotCompanyInfo: 1 })]);
    expect((await client.companyInfo().catch((x) => x)).kind).toBe("MALFORMED_RESPONSE");
  });
});

describe("error classification (no retry for non-retryable kinds)", () => {
  it.each([
    [403, "FORBIDDEN"],
    [404, "NOT_FOUND"],
    [400, "BAD_REQUEST"],
  ])("HTTP %i -> %s, one attempt, trace id kept, body never leaked", async (status, kind) => {
    const { client, calls } = harness([json(status, { Fault: { Error: [{ Message: `secret detail ${TOKEN}`, Detail: "internal-detail-xyz", code: "6240" }], type: "x" } }, { intuit_tid: "tid-err" })]);
    const e = (await client.companyInfo().catch((x) => x)) as QboProviderError;
    expect(e.kind).toBe(kind);
    expect(e.intuitTid).toBe("tid-err");
    expect(e.providerCode).toBe("6240");
    expect(calls).toHaveLength(1);
    expect(JSON.stringify([e.message, e.stack])).not.toMatch(/secret detail|internal-detail-xyz|SENSITIVE/);
  });

  it("a hostile fault code is dropped, never echoed", async () => {
    const { client } = harness([json(400, { Fault: { Error: [{ code: `<script>${TOKEN}</script>` }] } })]);
    const e = (await client.companyInfo().catch((x) => x)) as QboProviderError;
    expect(e.providerCode).toBeNull();
  });
});

describe("401 handling: one refresh, never a loop", () => {
  it("calls onAuthExpired once, retries with the new token, and succeeds", async () => {
    const onAuthExpired = vi.fn(async () => "fresh-token-2");
    const { client, calls } = harness([json(401, {}), json(200, { CompanyInfo: { a: 1 } })], { onAuthExpired });
    expect(await client.companyInfo()).toEqual({ a: 1 });
    expect(onAuthExpired).toHaveBeenCalledTimes(1);
    expect(calls[0].headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(calls[1].headers.Authorization).toBe("Bearer fresh-token-2");
  });

  it("a second 401 after refresh is terminal AUTH_EXPIRED (no loop)", async () => {
    const onAuthExpired = vi.fn(async () => "fresh-token-2");
    const { client, calls } = harness([json(401, {})], { onAuthExpired });
    const e = await client.companyInfo().catch((x) => x);
    expect(e.kind).toBe("AUTH_EXPIRED");
    expect(onAuthExpired).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(2);
  });

  it("without a refresher, or when it gives up, 401 is terminal after one attempt", async () => {
    const a = harness([json(401, {})]);
    expect((await a.client.companyInfo().catch((x) => x)).kind).toBe("AUTH_EXPIRED");
    expect(a.calls).toHaveLength(1);
    const b = harness([json(401, {})], { onAuthExpired: async () => null });
    expect((await b.client.companyInfo().catch((x) => x)).kind).toBe("AUTH_EXPIRED");
    expect(b.calls).toHaveLength(1);
  });
});

describe("the access token is read on every attempt", () => {
  it("a token persisted elsewhere between retries is used by the next attempt", async () => {
    let current = "token-v1-aaaa";
    const reads: string[] = [];
    const { client, calls } = harness([json(503, {}), json(200, { CompanyInfo: {} })], {
      getAccessToken: async () => (reads.push(current), current),
      sleep: async () => {
        current = "token-v2-bbbb";
      },
    });
    await client.companyInfo();
    expect(reads).toEqual(["token-v1-aaaa", "token-v2-bbbb"]);
    expect(calls.map((c) => c.headers.Authorization)).toEqual(["Bearer token-v1-aaaa", "Bearer token-v2-bbbb"]);
  });
});

describe("429 / 5xx / timeout: bounded retries with back-off", () => {
  it("429 honors Retry-After, penalizes the realm, and retries a bounded number of times", async () => {
    const limiter = new QboRealmRateLimiter();
    const penalize = vi.spyOn(limiter, "penalize").mockImplementation(() => {}); // the real hold-off is covered in the limiter tests
    const { client, calls, sleeps } = harness([json(429, {}, { "retry-after": "7" })], { limiter, maxRetries: 3, random: () => 0 });
    const e = (await client.companyInfo().catch((x) => x)) as QboProviderError;
    expect(e.kind).toBe("RATE_LIMITED");
    expect(calls).toHaveLength(4); // 1 + 3 retries, never more: no retry storm
    expect(sleeps).toHaveLength(3);
    expect(sleeps.every((s) => s >= 7000)).toBe(true);
    expect(penalize).toHaveBeenCalledWith(REALM, 7000, 60_000);
  });

  it("back-off waits are capped, whatever Retry-After says", async () => {
    const limiter = new QboRealmRateLimiter();
    const penalize = vi.spyOn(limiter, "penalize").mockImplementation(() => {});
    const { client, sleeps } = harness([json(429, {}, { "retry-after": "999999" })], { limiter, maxRetries: 2, maxBackoffMs: 5000 });
    await client.companyInfo().catch(() => {});
    expect(sleeps.length).toBe(2);
    expect(sleeps.every((s) => s <= 5000)).toBe(true);
    expect(penalize.mock.calls.every((c) => c[1] <= 5000 && c[2] === 5000)).toBe(true);
  });

  it("5xx retries with exponential back-off then succeeds", async () => {
    const { client, calls, sleeps } = harness([json(503, {}), json(500, {}), json(200, { CompanyInfo: { ok: true } })], { random: () => 1 });
    expect(await client.companyInfo()).toEqual({ ok: true });
    expect(calls).toHaveLength(3);
    expect(sleeps[1]).toBeGreaterThan(sleeps[0]);
  });

  it("persistent 5xx stops after the retry budget with TRANSIENT_PROVIDER_FAILURE", async () => {
    const { client, calls } = harness([json(502, {})], { maxRetries: 2 });
    const e = await client.companyInfo().catch((x) => x);
    expect(e.kind).toBe("TRANSIENT_PROVIDER_FAILURE");
    expect(calls).toHaveLength(3);
  });

  it("a network failure is a transient provider failure and retried within budget", async () => {
    const { client, calls } = harness([new Error("ECONNRESET"), json(200, { CompanyInfo: {} })]);
    await client.companyInfo();
    expect(calls).toHaveLength(2);
  });

  it("a stalled request times out as TIMEOUT and is retried within budget", async () => {
    const hang = async (_u: string, init?: RequestInit) =>
      new Promise<Response>((_r, rej) => init?.signal?.addEventListener("abort", () => rej(new Error("aborted"))));
    const client = createQboReadClient({
      config: config(),
      realmId: REALM,
      getAccessToken: async () => TOKEN,
      fetchImpl: hang as never,
      limiter: new QboRealmRateLimiter(),
      timeoutMs: 15,
      maxRetries: 1,
      sleep: async () => {},
    });
    const e = await client.companyInfo().catch((x) => x);
    expect(e.kind).toBe("TIMEOUT");
  });
});

describe("cancellation", () => {
  it("a pre-aborted signal makes no request", async () => {
    const ac = new AbortController();
    ac.abort();
    const { client, calls } = harness([json(200, { CompanyInfo: {} })]);
    const e = await client.companyInfo({ signal: ac.signal }).catch((x) => x);
    expect(e.kind).toBe("CANCELLED");
    expect(calls).toHaveLength(0);
  });

  it("aborting during back-off stops the retry loop", async () => {
    const ac = new AbortController();
    const calls: number[] = [];
    const client = createQboReadClient({
      config: config(),
      realmId: REALM,
      getAccessToken: async () => TOKEN,
      fetchImpl: async () => (calls.push(1), json(503, {})),
      limiter: new QboRealmRateLimiter(),
      sleep: async () => {
        ac.abort();
        throw new QboProviderError({ kind: "CANCELLED" });
      },
    });
    const e = await client.companyInfo({ signal: ac.signal }).catch((x) => x);
    expect(e.kind).toBe("CANCELLED");
    expect(calls).toHaveLength(1);
  });

  it("the default client signal (e.g. a scheduler TaskContext.signal) cancels in-flight work", async () => {
    const ac = new AbortController();
    const hang = async (_u: string, init?: RequestInit) =>
      new Promise<Response>((_r, rej) => init?.signal?.addEventListener("abort", () => rej(new Error("aborted"))));
    const client = createQboReadClient({ config: config(), realmId: REALM, getAccessToken: async () => TOKEN, fetchImpl: hang as never, limiter: new QboRealmRateLimiter(), signal: ac.signal, timeoutMs: 60_000 });
    const p = client.companyInfo().catch((x) => x);
    await Promise.resolve();
    ac.abort();
    expect((await p).kind).toBe("CANCELLED");
  });
});

describe("rate limiting is applied to every request", () => {
  it("each attempt acquires and releases a per-realm permit", async () => {
    const limiter = new QboRealmRateLimiter();
    const acquire = vi.spyOn(limiter, "acquire");
    const { client } = harness([json(503, {}), json(200, { CompanyInfo: {} })], { limiter });
    await client.companyInfo();
    expect(acquire).toHaveBeenCalledTimes(2);
    expect(acquire.mock.calls.every((c) => c[0] === REALM)).toBe(true);
    expect(limiter.stats(REALM)?.inFlight ?? 0).toBe(0);
  });

  it("a saturated local queue surfaces as a non-retried RATE_LIMITED error", async () => {
    const limiter = new QboRealmRateLimiter({ maxConcurrent: 1, maxQueuePerRealm: 1, perSecond: 1000, perMinute: 100000 });
    const held = await limiter.acquire(REALM);
    const queued = limiter.acquire(REALM);
    const { client, calls } = harness([json(200, { CompanyInfo: {} })], { limiter });
    const e = await client.companyInfo().catch((x) => x);
    expect(e.kind).toBe("RATE_LIMITED");
    expect(e.localReason).toBe("LOCAL_QUEUE_FULL");
    expect(calls).toHaveLength(0);
    held.release();
    (await queued).release();
  });
});

describe("no secret/token leakage", () => {
  it("tokens and the client secret never appear in logs, errors or returned diagnostics", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    const { client } = harness([json(403, { Fault: { Error: [{ Message: TOKEN }] } })]);
    const e = await client.companyInfo().catch((x) => x);
    const out = JSON.stringify([e.message, e.stack, { ...e }, ...spies.flatMap((s) => s.mock.calls)]);
    expect(out).not.toContain(TOKEN);
    expect(out).not.toContain("csecret-SENSITIVE");
  });
});
