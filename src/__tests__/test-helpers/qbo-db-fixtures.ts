/** DB + provider fixtures for the QuickBooks V1 sync tests (real Postgres, fake Intuit). Not a test file. */
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { resolveQboConfig, type QboEnvironment, type QboProviderConfig } from "@/domain/quickbooks/qbo-config";
import { QboProviderError } from "@/domain/quickbooks/qbo-errors";
import type { QboReportName } from "@/domain/quickbooks/qbo-read-catalog";
import { beginQboAuthorization, consumeQboAuthorizationState, finalizeQboConnection } from "@/services/quickbooks/qbo-connection.service";
import type { QboTokenGrant } from "@/services/quickbooks/qbo-oauth.service";
import type { QboReadClient } from "@/services/quickbooks/qbo-client";
import { seedUser } from "@/__tests__/owner-outcome/outcome-db-fixtures";
import { trackQboWorkspace } from "@/__tests__/test-helpers/qbo-task-cleanup";

export const QBO_TEST_ENV: Record<string, string> = {
  QUICKBOOKS_CLIENT_ID: "cid", QUICKBOOKS_CLIENT_SECRET: "csecret-DO-NOT-LEAK", QUICKBOOKS_REDIRECT_URI: "https://app.example.com/cb",
  QUICKBOOKS_ENVIRONMENT: "production",
};
export const envFor = (environment: QboEnvironment): Record<string, string> => ({ ...QBO_TEST_ENV, QUICKBOOKS_ENVIRONMENT: environment });

export function cfg(environment: QboEnvironment = "production"): QboProviderConfig {
  const r = resolveQboConfig(envFor(environment));
  if (!r.available) throw new Error("config");
  return r.config;
}

export interface QboTenant { ws: string; actor: string; biz: string }

export async function seedQboTenant(o: { currency?: string; fixture?: boolean } = {}): Promise<QboTenant> {
  const ws = randomUUID();
  const actor = await seedUser();
  await db.clientAccount.create({ data: { id: ws, name: `QBO WS ${ws}`, status: "active", visibility: "internal", updatedAt: new Date() } });
  const biz = (
    await db.ownerBusiness.create({
      data: { id: randomUUID(), workspaceId: ws, name: "QBO Biz", businessType: "generic_local_service", currency: o.currency ?? "USD", createdBy: actor, isFixtureBusiness: o.fixture === true },
    })
  ).id;
  trackQboWorkspace(ws);
  return { ws, actor, biz };
}

export const grant = (over: Partial<QboTokenGrant> = {}): QboTokenGrant => ({
  accessToken: `ACCESS-${randomUUID()}`, refreshToken: `REFRESH-${randomUUID()}`, tokenType: "Bearer",
  accessTokenExpiresAt: new Date(Date.now() + 3_600_000), refreshTokenExpiresAt: new Date(Date.now() + 8_000_000_000),
  refreshTokenHardExpiresAt: null, issuedAt: new Date(), intuitTid: "tid-1", ...over,
});

let realmSeq = 0;
export const nextRealm = () => `7341${String(Date.now()).slice(-7)}${++realmSeq}`;

/** Real begin -> consume -> finalize, so the connection and encrypted tokens are exactly what production creates. */
export async function connectQbo(t: QboTenant, environment: QboEnvironment = "production", realm = nextRealm(), g = grant()) {
  const b = await beginQboAuthorization({ workspaceId: t.ws, actorId: t.actor, businessId: t.biz, environment }, cfg(environment));
  const state = new URL(b.authorizationUrl).searchParams.get("state") as string;
  const c = await consumeQboAuthorizationState({ workspaceId: t.ws, actorId: t.actor, environment, state });
  if (!c.ok) throw new Error(`consume ${c.reason}`);
  const fin = await finalizeQboConnection({ authorization: c.authorization, realmId: realm, grant: g });
  if (!fin.ok) throw new Error(`finalize ${fin.reason}`);
  return { connectionId: fin.connection.id, realmId: realm, grant: g };
}

// ─── fake Intuit books ───────────────────────────────────────────────────────

const money = (title: string, key: string) => ({ ColTitle: title, ColType: "Money", MetaData: [{ Name: "ColKey", Value: key }] });
const acct = { ColTitle: "", ColType: "Account", MetaData: [{ Name: "ColKey", Value: "account" }] };
const cd = (...v: string[]) => v.map((value) => ({ value }));
const fmt = (n: number) => n.toFixed(2);

export interface MonthBooks {
  income?: number | null; cogs?: number | null; bank?: number | null;
  arTotal?: number | null; arCurrent?: number | null; apTotal?: number | null; apCurrent?: number | null;
  currency?: string; basis?: string;
}

function plBody(start: string, end: string, b: MonthBooks) {
  const rows: unknown[] = [];
  if (b.income != null) rows.push({ type: "Section", group: "Income", Header: { ColData: cd("Income", "") }, Rows: { Row: [] }, Summary: { ColData: cd("Total Income", fmt(b.income)) } });
  if (b.cogs != null) rows.push({ type: "Section", group: "COGS", Rows: { Row: [] }, Summary: { ColData: cd("Total Cost of Goods Sold", fmt(b.cogs)) } });
  return { Header: { ReportName: "ProfitAndLoss", ReportBasis: b.basis ?? "Accrual", StartPeriod: start, EndPeriod: end, Currency: b.currency ?? "USD", Option: [{ Name: "NoReportData", Value: "false" }] }, Columns: { Column: [acct, money("Total", "total")] }, Rows: { Row: rows } };
}
function bsBody(end: string, b: MonthBooks) {
  const rows: unknown[] = [];
  if (b.bank != null) rows.push({ type: "Section", group: "BankAccounts", Header: { ColData: cd("Bank Accounts", "") }, Rows: { Row: [] }, Summary: { ColData: cd("Total Bank Accounts", fmt(b.bank)) } });
  return { Header: { ReportName: "BalanceSheet", ReportBasis: b.basis ?? "Accrual", EndPeriod: end, Currency: b.currency ?? "USD", Option: [{ Name: "NoReportData", Value: "false" }] }, Columns: { Column: [acct, money("Total", "total")] }, Rows: { Row: rows } };
}
function agedBody(name: string, end: string, total: number | null | undefined, current: number | null | undefined, b: MonthBooks) {
  const rows: unknown[] = [{ type: "Data", ColData: cd("Some Customer", "1.00", "1.00") }];
  if (total != null) rows.push({ type: "Section", group: "GrandTotal", Summary: { ColData: cd("TOTAL", current != null ? fmt(current) : "", fmt(total)) } });
  return { Header: { ReportName: name, ReportBasis: b.basis ?? "Accrual", EndPeriod: end, Currency: b.currency ?? "USD", Option: [{ Name: "NoReportData", Value: "false" }] }, Columns: { Column: [acct, money("Current", "current"), money("Total", "total")] }, Rows: { Row: rows } };
}

export interface FakeIntuit {
  reader: QboReadClient;
  calls: Array<{ name: string; params: Record<string, unknown> }>;
  /** Mutate the books between runs ("QuickBooks changed January"). */
  books: Map<string, MonthBooks>;
  failNext: Array<unknown>;
}

/** A read-only fake Intuit: reports are built from `books` keyed by month START (YYYY-MM-01). Any month absent => empty report. */
export function makeFakeIntuit(books: Record<string, MonthBooks> = {}, company = "Fake Co"): FakeIntuit {
  const f: FakeIntuit = { calls: [], books: new Map(Object.entries(books)), failNext: [], reader: undefined as unknown as QboReadClient };
  const monthStart = (d: string) => `${d.slice(0, 7)}-01`;
  const meta = async (name: QboReportName, params: Record<string, unknown> = {}) => {
    f.calls.push({ name, params });
    if (f.failNext.length > 0) throw f.failNext.shift();
    const end = String(params.end_date ?? params.report_date);
    const b = f.books.get(monthStart(end)) ?? {};
    let body: Record<string, unknown>;
    if (name === "ProfitAndLoss") body = plBody(String(params.start_date), end, b);
    else if (name === "BalanceSheet") body = bsBody(end, b);
    else if (name === "AgedReceivables") body = agedBody(name, end, b.arTotal, b.arCurrent, b);
    else if (name === "AgedPayables") body = agedBody(name, end, b.apTotal, b.apCurrent, b);
    else throw new QboProviderError({ kind: "BAD_REQUEST" });
    return { body, intuitTid: `tid-${f.calls.length}` };
  };
  f.reader = {
    realmId: "fake",
    async companyInfo() { return { CompanyName: company }; },
    async readEntity() { throw new Error("not used"); },
    async query() { throw new Error("not used"); },
    async *paginate() { throw new Error("not used"); },
    async report(name, params) { return (await meta(name, params as Record<string, unknown>)).body; },
    reportWithMeta: (name, params) => meta(name, params as Record<string, unknown>),
  } as QboReadClient;
  return f;
}

export const monthKeys = (n = 12, now = new Date()): string[] => {
  const out: string[] = [];
  for (let i = 1; i <= n; i++) out.push(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)).toISOString().slice(0, 10));
  return out;
};
