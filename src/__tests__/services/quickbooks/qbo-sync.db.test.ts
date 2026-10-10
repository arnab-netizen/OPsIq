/**
 * QuickBooks READ-ONLY sync — core behaviour against real PostgreSQL with a fake Intuit (no network).
 * Requires TEST_WITH_DB=true and a migrated PostgreSQL. Self-skips otherwise.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { runQboReadSync, type RunQboSyncInput } from "@/services/quickbooks/qbo-sync.service";
import { seedConnected, testDeps, scopeOf, countRows, nextRealm, type ConnectedTenant } from "@/__tests__/test-helpers/qbo-db-fixtures";
import { customer, invoice, bill, inst } from "@/__tests__/test-helpers/qbo-fake-intuit";
import { QBO_SYNC_QUERY_ENTITIES, QBO_SYNC_REPORT_MONTHS } from "@/domain/quickbooks/qbo-sync-model";

const NOW = new Date("2026-10-10T03:00:00Z");
const manual = (c: ConnectedTenant, o: Partial<RunQboSyncInput> = {}): RunQboSyncInput => ({ ...scopeOf(c), trigger: "MANUAL", actorId: c.t.actor, requestId: randomUUID(), ...o });
const run = (c: ConnectedTenant, o: Partial<RunQboSyncInput> = {}, extra = {}) => runQboReadSync(manual(c, o), testDeps(c, { now: () => NOW, ...extra }));
const reportCount = QBO_SYNC_REPORT_MONTHS * 2 + 2;

function seedData(c: ConnectedTenant, n = { customers: 3, invoices: 4, bills: 2 }) {
  for (let i = 1; i <= n.customers; i++) c.fake.data.Customer.push(customer(String(i), `2026-09-0${Math.min(i, 9)}T10:00:00Z`));
  for (let i = 1; i <= n.invoices; i++) c.fake.data.Invoice.push(invoice(String(i), `2026-09-1${i}T10:00:00Z`));
  for (let i = 1; i <= n.bills; i++) c.fake.data.Bill.push(bill(String(i), `2026-09-2${i}T10:00:00Z`));
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("QBO read-only sync (real Postgres)", () => {
  describe("first run, idempotency, GET-only", () => {
    let c: ConnectedTenant;
    beforeAll(async () => { c = await seedConnected(); seedData(c); });

    it("FULL first run stores records + reports, records provenance and state, and issues ONLY GET requests", async () => {
      const out = await run(c);
      expect(out.status).toBe("SUCCEEDED");
      if (out.status !== "SUCCEEDED") return;
      expect(out.mode).toBe("FULL");
      expect(out.counts.inserted).toBe(1 + 3 + 4 + 2); // CompanyInfo + customers + invoices + bills
      expect(out.counts.reportsStored).toBe(reportCount);
      expect(out.changed).toBe(true);

      // Provider traffic: every accounting request is a GET; the only possible POST is the OAuth token endpoint (none needed here).
      expect(c.fake.requests.length).toBeGreaterThan(5);
      expect(c.fake.accountingRequests().every((r) => r.method === "GET")).toBe(true);
      expect(c.fake.nonTokenPosts()).toEqual([]);
      expect(c.fake.tokenCalls).toBe(0);
      // The exact sandbox realm only.
      expect(c.fake.accountingRequests().every((r) => r.path.startsWith(`/v3/company/${c.realmId}/`))).toBe(true);

      const rows = await countRows(c);
      expect(rows.records).toBe(10);
      expect(rows.observations).toBe(reportCount);
      const rec = await db.qboSyncedRecord.findFirstOrThrow({ where: { connectionId: c.connectionId, entityType: "Invoice", providerEntityId: "1" } });
      expect(rec).toMatchObject({ workspaceId: c.t.ws, businessId: c.t.biz, recordState: "ACTIVE", revision: 1, firstSeenRunId: out.runId, lastSeenRunId: out.runId });
      expect(rec.providerSyncToken).toBe("1");
      expect(rec.providerUpdatedAt?.toISOString()).toBe(inst("2026-09-11T10:00:00Z"));

      const state = await db.qboSyncState.findUniqueOrThrow({ where: { connectionId: c.connectionId } });
      expect(state).toMatchObject({ lastOutcome: "SUCCEEDED", lastErrorCode: null, consecutiveFailures: 0, leaseToken: null, leaseExpiresAt: null, nextAttemptNotBefore: null });
      expect(state.lastSucceededAt?.toISOString()).toBe(NOW.toISOString());
      expect(state.lastFullSyncAt).not.toBeNull();
      expect(Object.keys(state.watermarks as object).sort()).toEqual([...QBO_SYNC_QUERY_ENTITIES].sort());
      const runRow = await db.qboSyncRun.findUniqueOrThrow({ where: { id: out.runId } });
      expect(runRow).toMatchObject({ status: "SUCCEEDED", trigger: "MANUAL", mode: "FULL", changed: true, requestedById: c.t.actor });
      expect(runRow.finishedAt).not.toBeNull();
    });

    it("no token material, PII or provider secrets reach the sync tables", async () => {
      const dump = JSON.stringify([
        await db.qboSyncedRecord.findMany({ where: { connectionId: c.connectionId } }),
        await db.qboReportObservation.findMany({ where: { connectionId: c.connectionId } }),
        await db.qboSyncRun.findMany({ where: { connectionId: c.connectionId } }),
        await db.qboSyncState.findMany({ where: { connectionId: c.connectionId } }),
      ]);
      expect(dump).not.toMatch(/ACCESS-|REFRESH-|v1gcm|csecret|pii-\d+@example|555-0100/);
      const audits = JSON.stringify(await db.auditEvent.findMany({ where: { workspaceId: c.t.ws, eventName: { startsWith: "qbo.sync" } } }));
      expect(audits).not.toMatch(/ACCESS-|REFRESH-|v1gcm|csecret/);
    });

    it("emits sanitized start + completion audit events carrying counts and the re-evaluation marker", async () => {
      const ev = await db.auditEvent.findMany({ where: { workspaceId: c.t.ws, eventName: { in: ["qbo.sync_started", "qbo.sync_completed"] } }, orderBy: { occurredAt: "asc" } });
      expect(ev.map((e: { eventName: string }) => e.eventName)).toEqual(["qbo.sync_started", "qbo.sync_completed"]);
      const done = ev[1].payload as Record<string, unknown>;
      expect(done).toMatchObject({ businessId: c.t.biz, connectionId: c.connectionId, mode: "FULL", changed: true, inserted: 10, reevaluationCandidate: true });
      expect(Object.keys(done).join()).not.toMatch(/token|realm|secret/i);
    });

    it("an immediate second run is INCREMENTAL, changes nothing and reports changed=false (idempotent)", async () => {
      const before = await countRows(c);
      const recBefore = await db.qboSyncedRecord.findMany({ where: { connectionId: c.connectionId }, orderBy: { providerEntityId: "asc" } });
      const out = await run(c, {}, { now: () => new Date(NOW.getTime() + 60_000) });
      expect(out.status).toBe("SUCCEEDED");
      if (out.status !== "SUCCEEDED") return;
      expect(out.mode).toBe("INCREMENTAL");
      // The 10-minute overlap re-reads rows near the watermark: they are recognised as unchanged, not rewritten.
      expect(out.counts.inserted).toBe(0);
      expect(out.counts.updated).toBe(0);
      expect(out.counts.reportsChanged).toBe(0);
      expect(out.changed).toBe(false);
      const after = await countRows(c);
      expect({ ...after, runs: 0 }).toEqual({ ...before, runs: 0 });
      expect(after.runs).toBe(before.runs + 1);
      const recAfter = await db.qboSyncedRecord.findMany({ where: { connectionId: c.connectionId }, orderBy: { providerEntityId: "asc" } });
      expect(recAfter.map((r: { revision: number; contentHash: string }) => [r.revision, r.contentHash])).toEqual(recBefore.map((r: { revision: number; contentHash: string }) => [r.revision, r.contentHash]));
    });

    it("a repeated FULL sync is idempotent too and never flags live records missing", async () => {
      const out = await run(c, { modeOverride: "FULL" }, { now: () => new Date(NOW.getTime() + 120_000) });
      expect(out.status === "SUCCEEDED" && out.mode).toBe("FULL");
      expect(out.status === "SUCCEEDED" && out.counts.inserted).toBe(0);
      expect(out.status === "SUCCEEDED" && out.counts.updated).toBe(0);
      expect(out.status === "SUCCEEDED" && out.counts.unchanged).toBe(10);
      expect(await db.qboSyncedRecord.count({ where: { connectionId: c.connectionId, recordState: "MISSING" } })).toBe(0);
      expect((await countRows(c)).records).toBe(10);
    });
  });

  describe("incremental changes, ordering and deletions", () => {
    let c: ConnectedTenant;
    beforeAll(async () => { c = await seedConnected(); seedData(c); await run(c); });

    it("picks up a changed and a new invoice, bumps the revision, and never rolls back to an older provider copy", async () => {
      // Changes land after the previous watermark (NOW) and before this run's cutoff.
      c.fake.data.Invoice[0] = invoice("1", "2026-10-10T03:20:00Z", { Balance: 0 });
      c.fake.data.Invoice.push(invoice("99", "2026-10-10T03:30:00Z"));
      const out = await run(c, {}, { now: () => new Date(NOW.getTime() + 3_600_000) });
      expect(out.status === "SUCCEEDED" && out.mode).toBe("INCREMENTAL");
      expect(out.status === "SUCCEEDED" && [out.counts.inserted, out.counts.updated]).toEqual([1, 1]);
      const updated = await db.qboSyncedRecord.findFirstOrThrow({ where: { connectionId: c.connectionId, entityType: "Invoice", providerEntityId: "1" } });
      expect(updated.revision).toBe(2);
      expect((updated.normalized as { balance: string }).balance).toBe("0");

      // An out-of-order (older) copy of the same invoice appears: it must be skipped, not applied.
      c.fake.data.Invoice[0] = invoice("1", "2026-09-01T00:00:00Z", { Balance: 777 });
      const again = await run(c, { modeOverride: "FULL" }, { now: () => new Date(NOW.getTime() + 7_200_000) });
      expect(again.status === "SUCCEEDED" && again.counts.skipped).toBeGreaterThanOrEqual(1);
      const kept = await db.qboSyncedRecord.findFirstOrThrow({ where: { connectionId: c.connectionId, entityType: "Invoice", providerEntityId: "1" } });
      expect((kept.normalized as { balance: string }).balance).toBe("0");
      expect(kept.revision).toBe(2);
    });

    it("a record Intuit stops returning is flagged MISSING by a FULL sync (never deleted) and returns when it reappears", async () => {
      const removed = c.fake.data.Customer.splice(0, 1)[0];
      const out = await run(c, { modeOverride: "FULL" }, { now: () => new Date(NOW.getTime() + 10_800_000) });
      expect(out.status === "SUCCEEDED" && out.changed).toBe(true);
      const row = await db.qboSyncedRecord.findFirstOrThrow({ where: { connectionId: c.connectionId, entityType: "Customer", providerEntityId: removed.Id } });
      expect(row.recordState).toBe("MISSING");
      // An INCREMENTAL run cannot see deletions and must not flag anything.
      const inc = await run(c, { modeOverride: "INCREMENTAL" }, { now: () => new Date(NOW.getTime() + 11_000_000) });
      expect(inc.status).toBe("SUCCEEDED");
      c.fake.data.Customer.push(removed);
      await run(c, { modeOverride: "FULL" }, { now: () => new Date(NOW.getTime() + 12_000_000) });
      const back = await db.qboSyncedRecord.findFirstOrThrow({ where: { connectionId: c.connectionId, entityType: "Customer", providerEntityId: removed.Id } });
      expect(back.recordState).toBe("ACTIVE");
    });

    it("inactive customers are stored INACTIVE; records with missing optional fields are kept with nulls; malformed ones are skipped and counted", async () => {
      const at = "2026-10-10T06:30:00Z"; // after every earlier watermark (≈06:20), before this run's cutoff (NOW + 13,000s ≈ 06:36)
      c.fake.data.Customer.push(customer("500", at, { Active: false }));
      c.fake.data.Bill.push(bill("501", at, { DueDate: undefined, CurrencyRef: undefined, DocNumber: undefined }));
      c.fake.data.Invoice.push({ Id: "502/evil", MetaData: { LastUpdatedTime: inst(at) }, TotalAmt: 1 } as never);
      c.fake.data.Invoice.push({ Id: "503", MetaData: { LastUpdatedTime: inst(at) } } as never);
      const out = await run(c, {}, { now: () => new Date(NOW.getTime() + 13_000_000) });
      expect(out.status === "SUCCEEDED" && out.counts.skipped).toBe(2);
      expect((await db.qboSyncedRecord.findFirstOrThrow({ where: { connectionId: c.connectionId, providerEntityId: "500" } })).recordState).toBe("INACTIVE");
      const partial = await db.qboSyncedRecord.findFirstOrThrow({ where: { connectionId: c.connectionId, providerEntityId: "501" } });
      expect(partial.normalized).toMatchObject({ dueDate: null, currency: null, docNumber: null, totalAmt: "250.5" });
      expect(await db.qboSyncedRecord.count({ where: { connectionId: c.connectionId, providerEntityId: { in: ["502/evil", "503"] } } })).toBe(0);
    });
  });

  describe("pagination and high volume", () => {
    it("pages 2,500 records as 1000/1000/500 with a final short page, no duplicates, and survives a provider duplicate", async () => {
      const c = await seedConnected();
      for (let i = 1; i <= 2500; i++) c.fake.data.Customer.push(customer(String(i), new Date(Date.UTC(2026, 8, 1) + i * 1000).toISOString()));
      c.fake.data.Customer.push(c.fake.data.Customer[10]); // provider returns the same record twice
      const out = await run(c);
      expect(out.status === "SUCCEEDED" && out.counts.fetched.Customer).toBe(2501);
      expect(await db.qboSyncedRecord.count({ where: { connectionId: c.connectionId, entityType: "Customer" } })).toBe(2500);
      const queries = c.fake.requests.filter((r) => r.path.endsWith("/query") && /FROM Customer/.test(r.url.searchParams.get("query") ?? ""));
      expect(queries.map((r) => /STARTPOSITION (\d+)/.exec(r.url.searchParams.get("query") ?? "")?.[1])).toEqual(["1", "1001", "2001"]);
    });

    it("an exact multiple of the page size ends with one empty page", async () => {
      const c = await seedConnected();
      for (let i = 1; i <= 1000; i++) c.fake.data.Invoice.push(invoice(String(i), new Date(Date.UTC(2026, 8, 1) + i * 1000).toISOString()));
      const out = await run(c);
      expect(out.status === "SUCCEEDED" && out.counts.fetched.Invoice).toBe(1000);
      const q = c.fake.requests.filter((r) => /FROM Invoice/.test(r.url.searchParams.get("query") ?? ""));
      expect(q).toHaveLength(2);
    });

    it("a provider failure on page 2 fails the run without advancing the watermark; the retry resumes cleanly with no duplicates", async () => {
      const c = await seedConnected();
      for (let i = 1; i <= 1500; i++) c.fake.data.Customer.push(customer(String(i), new Date(Date.UTC(2026, 8, 1) + i * 1000).toISOString()));
      // Customer page 1 succeeds; page 2 (STARTPOSITION 1001) fails on all 4 attempts (1 try + 3 retries) of the first run only.
      const failures = [{ status: 500 }, { status: 500 }, { status: 500 }, { status: 500 }];
      const realFetch = c.fake.fetchImpl;
      let customerQueries = 0;
      const flaky = async (input: string, init?: RequestInit) => {
        const u = new URL(input);
        if (u.pathname.endsWith("/query") && /FROM Customer/.test(u.searchParams.get("query") ?? "") && /STARTPOSITION 1001/.test(u.searchParams.get("query") ?? "")) {
          customerQueries++;
          if (customerQueries <= failures.length) return new Response("{}", { status: 500 });
        }
        return realFetch(input, init);
      };
      const first = await runQboReadSync(manual(c), testDeps(c, { now: () => NOW, fetchImpl: flaky }));
      expect(first).toMatchObject({ status: "FAILED", code: "PROVIDER_UNAVAILABLE", terminal: false });
      const state = await db.qboSyncState.findUniqueOrThrow({ where: { connectionId: c.connectionId } });
      expect(state.watermarks).toEqual({});
      expect(state).toMatchObject({ lastOutcome: "FAILED", lastErrorCode: "PROVIDER_UNAVAILABLE", consecutiveFailures: 1, leaseToken: null });
      expect(state.nextAttemptNotBefore).not.toBeNull();
      const partial = await db.qboSyncedRecord.count({ where: { connectionId: c.connectionId, entityType: "Customer" } });
      expect(partial).toBe(1000); // page 1 was durably stored before the failure
      // Retry (manual ignores back-off): resumes, completes, and the first 1000 are recognised as already stored.
      const second = await runQboReadSync(manual(c), testDeps(c, { now: () => new Date(NOW.getTime() + 60_000), fetchImpl: flaky }));
      expect(second.status).toBe("SUCCEEDED");
      expect(await db.qboSyncedRecord.count({ where: { connectionId: c.connectionId, entityType: "Customer" } })).toBe(1500);
      expect(second.status === "SUCCEEDED" && second.counts.unchanged).toBeGreaterThanOrEqual(1000);
      expect(await db.qboSyncState.findUniqueOrThrow({ where: { connectionId: c.connectionId } })).toMatchObject({ consecutiveFailures: 0, lastOutcome: "SUCCEEDED", nextAttemptNotBefore: null });
    });
  });

  describe("reports", () => {
    it("stores period observations idempotently with currency, basis and decimal-string metrics", async () => {
      const c = await seedConnected();
      await run(c);
      const pl = await db.qboReportObservation.findMany({ where: { connectionId: c.connectionId, reportName: "ProfitAndLoss" }, orderBy: { periodStart: "asc" } });
      expect(pl.map((o: { periodStart: Date; periodEnd: Date }) => [o.periodStart.toISOString().slice(0, 10), o.periodEnd.toISOString().slice(0, 10)])).toEqual([
        ["2026-07-01", "2026-07-31"], ["2026-08-01", "2026-08-31"], ["2026-09-01", "2026-09-30"],
      ]);
      expect(pl[0]).toMatchObject({ currency: "USD", basis: "Accrual", revision: 1 });
      expect(pl[0].metrics).toMatchObject({ Income: "10000", COGS: "4000" });
      const ar = await db.qboReportObservation.findFirstOrThrow({ where: { connectionId: c.connectionId, reportName: "AgedReceivables" } });
      expect(ar.metrics).toEqual({ current: "300", total: "475", overdue: "175" });
      expect(ar.periodStart.toISOString().slice(0, 10)).toBe("2026-10-10");

      // Provider revises a closed period: the observation is updated in place with a new revision, not duplicated.
      c.fake.reports.ProfitAndLoss = (p) => ({
        Header: { Time: "2026-10-11T00:00:00Z", ReportBasis: "Accrual", StartPeriod: p.get("start_date"), EndPeriod: p.get("end_date"), Currency: "USD" },
        Columns: { Column: [{ ColTitle: "" }, { ColTitle: "Total" }] },
        Rows: { Row: [{ type: "Section", group: "Income", Summary: { ColData: [{ value: "Total Income" }, { value: "12345.67" }] } }] },
      });
      const out = await run(c);
      expect(out.status === "SUCCEEDED" && out.counts.reportsChanged).toBe(3);
      const revised = await db.qboReportObservation.findMany({ where: { connectionId: c.connectionId, reportName: "ProfitAndLoss" } });
      expect(revised).toHaveLength(3);
      expect(revised.every((o: { revision: number; metrics: unknown }) => o.revision === 2 && (o.metrics as { Income: string }).Income === "12345.67")).toBe(true);
    });

    it("a report for the wrong period or a malformed report fails the run as PROVIDER_MALFORMED and stores nothing", async () => {
      const c = await seedConnected();
      c.fake.reports.ProfitAndLoss = (p) => ({ Header: { StartPeriod: p.get("start_date"), EndPeriod: "2001-01-31", Currency: "USD" }, Columns: { Column: [] }, Rows: {} });
      const out = await run(c);
      expect(out).toMatchObject({ status: "FAILED", code: "PROVIDER_MALFORMED" });
      expect((await countRows(c)).observations).toBe(0);
    });

    it("keeps the provider currency even when it differs from the business currency (conversion/adoption is the policy's job)", async () => {
      const c = await seedConnected({ currency: "USD" }); // seeded business currency is INR
      await run(c);
      const biz = await db.ownerBusiness.findUniqueOrThrow({ where: { id: c.t.biz } });
      const obs = await db.qboReportObservation.findFirstOrThrow({ where: { connectionId: c.connectionId, reportName: "BalanceSheet" } });
      expect(biz.currency).toBe("INR");
      expect(obs.currency).toBe("USD");
    });
  });

  describe("tenancy", () => {
    it("a foreign workspace, a foreign business and an unknown connection all read as CONNECTION_NOT_FOUND with no provider traffic and no rows", async () => {
      const a = await seedConnected();
      const b = await seedConnected();
      seedData(a);
      const cases: Array<RunQboSyncInput> = [
        { ...scopeOf(a), workspaceId: b.t.ws, trigger: "MANUAL", actorId: b.t.actor },
        { ...scopeOf(a), businessId: a.t.bizB, trigger: "MANUAL", actorId: a.t.actor },
        { ...scopeOf(a), businessId: b.t.biz, trigger: "MANUAL", actorId: a.t.actor },
        { ...scopeOf(a), connectionId: randomUUID(), trigger: "MANUAL", actorId: a.t.actor },
        { ...scopeOf(b), connectionId: a.connectionId, trigger: "MANUAL", actorId: b.t.actor },
      ];
      for (const input of cases) {
        const out = await runQboReadSync(input, testDeps(a, { now: () => NOW }));
        expect(out).toMatchObject({ status: "FAILED", code: "CONNECTION_NOT_FOUND", runId: null });
      }
      expect(a.fake.requests).toHaveLength(0);
      expect(b.fake.requests).toHaveLength(0);
      expect((await countRows(a)).runs + (await countRows(b)).runs).toBe(0);
      expect(await db.qboSyncState.count({ where: { workspaceId: { in: [a.t.ws, b.t.ws] } } })).toBe(0);
    });

    it("two tenants with identical provider ids and company ids never collide", async () => {
      const a = await seedConnected();
      const b = await seedConnected();
      seedData(a);
      seedData(b, { customers: 1, invoices: 1, bills: 0 });
      await run(a);
      await run(b);
      expect((await countRows(a)).records).toBe(10);
      expect((await countRows(b)).records).toBe(3);
      expect(await db.qboSyncedRecord.count({ where: { providerEntityId: "1", entityType: "Invoice", workspaceId: a.t.ws } })).toBe(1);
      expect(await db.qboSyncedRecord.count({ where: { providerEntityId: "1", entityType: "Invoice", workspaceId: b.t.ws } })).toBe(1);
    });

    it("a company that is not the connection's realm stops the run (COMPANY_MISMATCH) before any record is written", async () => {
      const c = await seedConnected();
      seedData(c);
      c.fake.companyId = nextRealm(); // Intuit answers for another company
      const out = await run(c);
      expect(out).toMatchObject({ status: "FAILED", code: "COMPANY_MISMATCH", terminal: true, nextAttemptNotBefore: null });
      expect((await countRows(c)).records).toBe(0);
    });

    it("a foreign realm path is refused by the provider (403) and surfaces as a closed failure", async () => {
      const c = await seedConnected();
      const other = await seedConnected();
      // Point c's connection at other's fake: the fake only serves other's realm, so every request is a 403.
      const out = await runQboReadSync(manual(c), testDeps(c, { now: () => NOW, fetchImpl: other.fake.fetchImpl }));
      expect(out).toMatchObject({ status: "FAILED", code: "PROVIDER_FORBIDDEN" });
      expect((await countRows(c)).records).toBe(0);
    });

    it("an archived business, a REAUTH_REQUIRED connection and an environment mismatch never reach the provider", async () => {
      const arch = await seedConnected();
      await db.ownerBusiness.update({ where: { id: arch.t.biz }, data: { isActive: false } });
      expect(await run(arch)).toMatchObject({ status: "FAILED", code: "CONNECTION_NOT_ACTIVE" });
      const reauth = await seedConnected();
      await db.qboConnection.update({ where: { id: reauth.connectionId }, data: { status: "REAUTH_REQUIRED", reauthRequiredAt: new Date() } });
      expect(await run(reauth)).toMatchObject({ status: "FAILED", code: "REAUTH_REQUIRED", terminal: true });
      const prod = await seedConnected({ environment: "production" });
      expect(await run(prod)).toMatchObject({ status: "FAILED", code: "ENVIRONMENT_MISMATCH" });
      for (const x of [arch, reauth, prod]) expect(x.fake.requests).toHaveLength(0);
    });

    it("unconfigured QuickBooks fails closed", async () => {
      const c = await seedConnected();
      const out = await runQboReadSync(manual(c), testDeps(c, { env: {} }));
      expect(out).toMatchObject({ status: "FAILED", code: "CONFIGURATION_UNAVAILABLE", runId: null });
    });
  });
});
