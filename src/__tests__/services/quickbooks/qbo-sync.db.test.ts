/**
 * QuickBooks V1 sync + versioned observations + provenance + source precedence — real PostgreSQL, fake Intuit.
 * Requires TEST_WITH_DB=true and a migrated PostgreSQL. Self-skips otherwise.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { connectQbo, envFor, grant, makeFakeIntuit, monthKeys, seedQboTenant, type FakeIntuit, type MonthBooks, type QboTenant } from "@/__tests__/test-helpers/qbo-db-fixtures";
import { runQboSync, type QboSyncDeps } from "@/services/quickbooks/qbo-sync.service";
import { amendFinancialSnapshot } from "@/services/owner-finance/snapshot.service";
import { amendCashflowSnapshot } from "@/services/owner-cashflow/snapshot.service";
import { QboProviderError } from "@/domain/quickbooks/qbo-errors";
import { cashPositionChangedSince } from "@/services/owner-finance/liquidity.service";
import { disconnectQboConnection } from "@/services/quickbooks/qbo-connection.service";

const books = (n: number): MonthBooks => ({ income: 10_000 + n, cogs: 4_000 + n, bank: 20_000 + n, arTotal: 7_000, arCurrent: 5_000, apTotal: 2_500, apCurrent: 2_500 });
const allMonths = (): Record<string, MonthBooks> => Object.fromEntries(monthKeys(12).map((k, i) => [k, books(i)]));
const depsFor = (f: FakeIntuit, env: "production" | "sandbox" = "production", extra: Partial<QboSyncDeps> = {}): QboSyncDeps => ({
  env: envFor(env), readClientFactory: () => f.reader, ...extra,
});
const run = (t: QboTenant, connectionId: string, f: FakeIntuit, extra: Partial<QboSyncDeps> = {}) =>
  runQboSync({ workspaceId: t.ws, connectionId, trigger: "SCHEDULED" }, depsFor(f, "production", extra));
const monthEnd = (k: string) => new Date(Date.UTC(Number(k.slice(0, 4)), Number(k.slice(5, 7)), 0));
const D = (k: string) => new Date(`${k}T00:00:00.000Z`);

async function fullBaseline(t: QboTenant, id: string, f: FakeIntuit) {
  const outcomes = [];
  for (let i = 0; i < 4; i++) outcomes.push(await run(t, id, f));
  return outcomes;
}

/**
 * A Sandbox connection sitting on a business that is no longer a test business (the flag changed after connecting, or a row was
 * written around the service). The service refuses to CREATE such a connection (see the persistence suite); this proves the
 * sync + materialization + database layers still keep Sandbox evidence out of a real business.
 */
async function sandboxConnectionOnDemotedBusiness() {
  const t = await seedQboTenant({ fixture: true });
  const c = await connectQbo(t, "sandbox");
  await db.ownerBusiness.update({ where: { id: t.biz }, data: { isFixtureBusiness: false } });
  return { t, c };
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("QBO V1 sync (real Postgres, fake Intuit)", () => {
  beforeAll(() => { /* each test seeds its own tenant */ });

  it("baseline: 12 closed months over 4 bounded runs, newest first, resumable cursor, canonical snapshots + provenance, no diagnosis", async () => {
    const t = await seedQboTenant();
    const { connectionId } = await connectQbo(t);
    const f = makeFakeIntuit(allMonths(), "Acme Books LLC");
    const keys = monthKeys(12);

    const o1 = await run(t, connectionId, f);
    expect(o1).toMatchObject({ status: "SYNCED", kind: "BASELINE", moreWork: true });
    let st = await db.qboSyncState.findUniqueOrThrow({ where: { connectionId } });
    expect(st.lifecycle).toBe("BASELINING");
    expect(st.baselineCursor?.toISOString().slice(0, 10)).toBe(keys[3]);
    expect(st.companyName).toBe("Acme Books LLC");
    // the most recent closed month is usable after the FIRST run
    expect(await db.ownerFinancialSnapshot.count({ where: { workspaceId: t.ws, businessId: t.biz } })).toBe(3);

    for (let i = 0; i < 3; i++) await run(t, connectionId, f);
    st = await db.qboSyncState.findUniqueOrThrow({ where: { connectionId } });
    expect(st.lifecycle).toBe("SYNCED");
    expect(st.baselineCompletedAt).not.toBeNull();
    expect(st.baselineCursor).toBeNull();
    expect(st.consecutiveFailures).toBe(0);
    expect(st.lastSuccessAt).not.toBeNull();

    expect(await db.qboReportSnapshot.count({ where: { connectionId } })).toBe(48);
    const snaps = await db.ownerFinancialSnapshot.findMany({ where: { workspaceId: t.ws, businessId: t.biz }, orderBy: { periodStart: "desc" } });
    expect(snaps).toHaveLength(12);
    const latest = snaps[0];
    expect(latest.periodStart).toEqual(D(keys[0]));
    expect(latest.periodEnd).toEqual(monthEnd(keys[0]));
    expect(latest).toMatchObject({ revenue: 10_000, costOfGoods: 4_000, receivables: 7_000, overdueReceivables: 2_000, payables: 2_500, overduePayables: 0, evidenceQuality: "ACTUAL", currency: "USD" });
    // not derived => unknown, never 0
    expect(latest.cashOnHand).toBeNull();
    expect(latest.payroll).toBeNull();
    expect(latest.fixedCosts).toBeNull();
    const cash = await db.ownerCashflowSnapshot.findFirstOrThrow({ where: { workspaceId: t.ws, businessId: t.biz, periodStart: D(keys[0]) } });
    expect(cash).toMatchObject({ bankBalance: 20_000, receivables: 7_000, receivablesOverdue: 2_000, cashInHand: null });
    // provenance for every canonical row, read back through the FKs
    expect(await db.qboCanonicalProvenance.count({ where: { workspaceId: t.ws } })).toBe(24);
    const prov = await db.qboCanonicalProvenance.findFirstOrThrow({ where: { financialSnapshotId: latest.id }, include: { plObservation: true, arObservation: true } });
    expect(prov).toMatchObject({ action: "CREATED", environment: "production", accountingBasis: "ACCRUAL" });
    expect(prov.plObservation?.reportType).toBe("PROFIT_AND_LOSS");
    // no automatic diagnosis
    expect(await db.ownerFinanceCycle.count({ where: { workspaceId: t.ws } })).toBe(0);
    expect(await db.ownerCashflowCycle.count({ where: { workspaceId: t.ws } })).toBe(0);
    // the in-progress month is never materialized
    const thisMonth = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
    expect(await db.ownerFinancialSnapshot.count({ where: { workspaceId: t.ws, periodStart: thisMonth } })).toBe(0);
    // read-only: only GETs of the four reports + companyInfo
    expect(new Set(f.calls.map((c) => c.name))).toEqual(new Set(["ProfitAndLoss", "BalanceSheet", "AgedReceivables", "AgedPayables"]));
  });

  it("repeat sync is idempotent: observations confirmed, no new canonical version, no new provenance", async () => {
    const t = await seedQboTenant();
    const { connectionId } = await connectQbo(t);
    const f = makeFakeIntuit(allMonths());
    await fullBaseline(t, connectionId, f);
    const before = { obs: await db.qboReportSnapshot.count({ where: { connectionId } }), fin: await db.ownerFinancialSnapshot.count({ where: { workspaceId: t.ws } }), prov: await db.qboCanonicalProvenance.count({ where: { workspaceId: t.ws } }) };
    const o = await run(t, connectionId, f);
    expect(o.status).toBe("SYNCED");
    if (o.status === "SYNCED") {
      expect(o.counts.observationsCreated).toBe(0);
      expect(o.counts.observationsConfirmed).toBe(12);
      expect(o.counts.canonicalCreated + o.counts.canonicalAmended + o.counts.canonicalUpdated).toBe(0);
    }
    expect({ obs: await db.qboReportSnapshot.count({ where: { connectionId } }), fin: await db.ownerFinancialSnapshot.count({ where: { workspaceId: t.ws } }), prov: await db.qboCanonicalProvenance.count({ where: { workspaceId: t.ws } }) }).toEqual(before);
    const confirmed = await db.qboReportSnapshot.findFirstOrThrow({ where: { connectionId }, orderBy: { confirmCount: "desc" } });
    expect(confirmed.confirmCount).toBeGreaterThan(0);
  });

  it("a backdated QuickBooks change is versioned (v1 kept) and amends the canonical snapshot through normal supersession", async () => {
    const t = await seedQboTenant();
    const { connectionId } = await connectQbo(t);
    const f = makeFakeIntuit(allMonths());
    await fullBaseline(t, connectionId, f);
    const k = monthKeys(12)[1]; // two months ago — inside the refresh window
    f.books.set(k, { ...books(1), income: 12_345.67 });
    const o = await run(t, connectionId, f);
    expect(o.status === "SYNCED" && o.counts.canonicalAmended).toBe(1);

    const obs = await db.qboReportSnapshot.findMany({ where: { connectionId, reportType: "PROFIT_AND_LOSS", periodStart: D(k) }, orderBy: { version: "asc" } });
    expect(obs.map((x) => x.version)).toEqual([1, 2]);
    expect((obs[0].values as { v: { income: number } }).v.income).toBe(10_001);
    expect((obs[1].values as { v: { income: number } }).v.income).toBe(12_345.67);

    const versions = await db.ownerFinancialSnapshot.findMany({ where: { workspaceId: t.ws, businessId: t.biz, periodStart: D(k) }, orderBy: { version: "asc" } });
    expect(versions.map((v) => [v.version, v.revenue, v.supersededById !== null])).toEqual([[1, 10_001, true], [2, 12_345.67, false]]);
    expect(versions[1].evidenceQuality).toBe("ACTUAL");
    const provs = await db.qboCanonicalProvenance.findMany({ where: { workspaceId: t.ws, periodStart: D(k), targetType: "FINANCIAL_SNAPSHOT" }, orderBy: { materializedAt: "asc" } });
    expect(provs.map((p) => p.action)).toEqual(["CREATED", "AMENDED"]);
    expect(provs[1].financialSnapshotId).toBe(versions[1].id);
    expect(provs[1].plObservationId).toBe(obs[1].id);
    expect(provs[0].plObservationId).toBe(obs[0].id); // the original number is still explainable
  });

  it("manual owner data wins: an owner-authored period is never touched; it is counted, not overwritten", async () => {
    const t = await seedQboTenant();
    const { connectionId } = await connectQbo(t);
    const f = makeFakeIntuit(allMonths());
    const k = monthKeys(12)[0];
    const manual = await db.ownerFinancialSnapshot.create({
      data: { id: randomUUID(), workspaceId: t.ws, businessId: t.biz, periodStart: D(k), periodEnd: monthEnd(k), currency: "USD", revenue: 777, dataConfidenceScore: 50, missingCriticalData: [] },
    });
    const o = await run(t, connectionId, f);
    expect(o.status === "SYNCED" && o.counts.ownerControlled).toBeGreaterThanOrEqual(1);
    const rows = await db.ownerFinancialSnapshot.findMany({ where: { workspaceId: t.ws, businessId: t.biz, periodStart: D(k) } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: manual.id, revenue: 777, supersededById: null, version: 1 });
    expect(await db.qboCanonicalProvenance.count({ where: { financialSnapshotId: manual.id } })).toBe(0);
    // QuickBooks can still populate other (empty) periods
    expect(await db.ownerFinancialSnapshot.count({ where: { workspaceId: t.ws, businessId: t.biz } })).toBe(3);
  });

  it("an owner amendment of a QuickBooks-derived Finance period takes control permanently", async () => {
    const t = await seedQboTenant();
    const { connectionId } = await connectQbo(t);
    const f = makeFakeIntuit(allMonths());
    await fullBaseline(t, connectionId, f);
    const k = monthKeys(12)[0];
    const qbo = await db.ownerFinancialSnapshot.findFirstOrThrow({ where: { workspaceId: t.ws, businessId: t.biz, periodStart: D(k), supersededById: null } });
    const { snapshot: ownerV } = await amendFinancialSnapshot(qbo.id, { amendmentReason: "I know better", revenue: 9_999 }, t.actor, t.ws);
    expect(ownerV?.version).toBe(2);
    f.books.set(k, { ...books(0), income: 55_555 });
    await run(t, connectionId, f);
    const current = await db.ownerFinancialSnapshot.findMany({ where: { workspaceId: t.ws, businessId: t.biz, periodStart: D(k), supersededById: null } });
    expect(current).toHaveLength(1);
    expect(current[0]).toMatchObject({ id: ownerV?.id, revenue: 9_999, version: 2 });
    // the new QuickBooks reading is still recorded as evidence, just not applied
    const v = await db.qboReportSnapshot.count({ where: { connectionId, reportType: "PROFIT_AND_LOSS", periodStart: D(k) } });
    expect(v).toBe(2);
  });

  it("Cashflow row: QuickBooks updates it in place until the owner edits it; then it is the owner's", async () => {
    const t = await seedQboTenant();
    const { connectionId } = await connectQbo(t);
    const f = makeFakeIntuit(allMonths());
    await fullBaseline(t, connectionId, f);
    const k = monthKeys(12)[0];
    f.books.set(k, { ...books(0), bank: 21_000 });
    const o = await run(t, connectionId, f);
    expect(o.status === "SYNCED" && o.counts.canonicalUpdated).toBe(1);
    const row = await db.ownerCashflowSnapshot.findFirstOrThrow({ where: { workspaceId: t.ws, businessId: t.biz, periodStart: D(k) } });
    expect(row.bankBalance).toBe(21_000);
    const provs = await db.qboCanonicalProvenance.findMany({ where: { cashflowSnapshotId: row.id }, orderBy: { materializedAt: "asc" } });
    expect(provs.map((p) => p.action)).toEqual(["CREATED", "UPDATED"]);

    await amendCashflowSnapshot(row.id, { expectedUpdatedAt: row.updatedAt.toISOString(), confirmReplace: true, cashInHand: 100 }, t.actor, t.ws);
    f.books.set(k, { ...books(0), bank: 30_000 });
    await run(t, connectionId, f);
    const after = await db.ownerCashflowSnapshot.findFirstOrThrow({ where: { id: row.id } });
    expect(after).toMatchObject({ bankBalance: 21_000, cashInHand: 100 });
  });

  it("a QuickBooks change marks the previous analysis out of date via the existing cash-position detection; no diagnosis is run", async () => {
    const t = await seedQboTenant();
    const { connectionId } = await connectQbo(t);
    const f = makeFakeIntuit(allMonths());
    await fullBaseline(t, connectionId, f);
    const k = monthKeys(12)[0];
    const row = await db.ownerCashflowSnapshot.findFirstOrThrow({ where: { workspaceId: t.ws, businessId: t.biz, periodStart: D(k) } });
    const diagnosedAt = new Date(row.updatedAt.getTime() + 1000);
    expect(await cashPositionChangedSince(t.ws, t.biz, monthEnd(k), diagnosedAt)).toBe(false);
    await new Promise((r) => setTimeout(r, 1100));
    f.books.set(k, { ...books(0), bank: 22_222 });
    await run(t, connectionId, f);
    expect(await cashPositionChangedSince(t.ws, t.biz, monthEnd(k), diagnosedAt)).toBe(true);
    expect(await db.ownerFinanceCycle.count({ where: { workspaceId: t.ws } })).toBe(0);
  });

  it("currency mismatch: observations are preserved, canonical materialization refused, nothing converted", async () => {
    const t = await seedQboTenant({ currency: "USD" });
    const { connectionId } = await connectQbo(t);
    const f = makeFakeIntuit(Object.fromEntries(monthKeys(12).map((k) => [k, { ...books(0), currency: "EUR" }])));
    const o = await run(t, connectionId, f);
    expect(o.status === "SYNCED" && o.counts.refused).toBe(6);
    expect(await db.qboReportSnapshot.count({ where: { connectionId, currency: "EUR" } })).toBe(12);
    expect(await db.ownerFinancialSnapshot.count({ where: { workspaceId: t.ws } })).toBe(0);
    expect(await db.ownerCashflowSnapshot.count({ where: { workspaceId: t.ws } })).toBe(0);
    // the reason is persisted (bounded code) so the owner is told why nothing was imported
    const st = await db.qboSyncState.findUniqueOrThrow({ where: { connectionId } });
    expect((st.lastRunSummary as { refusals?: Record<string, number> }).refusals).toEqual({ CURRENCY_MISMATCH: 6 });
    const { getQboOwnerStatus } = await import("@/services/quickbooks/qbo-status.service");
    const status = await getQboOwnerStatus({ workspaceId: t.ws, businessId: t.biz }, { env: envFor("production") });
    expect(status.notices).toEqual([expect.stringMatching(/different currency/i)]);
  });

  it("an owner-entered multi-month period that overlaps a month keeps that month owner-controlled", async () => {
    const t = await seedQboTenant();
    const { connectionId } = await connectQbo(t);
    const f = makeFakeIntuit(allMonths());
    const keys = monthKeys(12);
    // an owner quarter ending at the newest closed month's end
    const quarterStart = D(keys[2]);
    const quarter = await db.ownerFinancialSnapshot.create({
      data: { id: randomUUID(), workspaceId: t.ws, businessId: t.biz, periodStart: quarterStart, periodEnd: monthEnd(keys[0]), currency: "USD", revenue: 90_000, dataConfidenceScore: 50, missingCriticalData: [] },
    });
    const o = await run(t, connectionId, f);
    expect(o.status === "SYNCED" && o.counts.ownerControlled).toBeGreaterThanOrEqual(3);
    for (const k of keys.slice(0, 3)) {
      expect(await db.ownerFinancialSnapshot.count({ where: { workspaceId: t.ws, businessId: t.biz, periodStart: D(k), periodEnd: monthEnd(k) } })).toBe(0);
    }
    expect(await db.ownerFinancialSnapshot.findUniqueOrThrow({ where: { id: quarter.id } })).toMatchObject({ revenue: 90_000, supersededById: null });
  });

  describe("withdrawn figures are never carried forward (missing != zero)", () => {
    const refreshed = async (next: Partial<MonthBooks>) => {
      const t = await seedQboTenant();
      const { connectionId } = await connectQbo(t);
      const f = makeFakeIntuit(allMonths());
      await fullBaseline(t, connectionId, f);
      const k = monthKeys(12)[1]; // inside the daily refresh window
      f.books.set(k, { ...books(1), ...next });
      const o = await run(t, connectionId, f);
      const snaps = await db.ownerFinancialSnapshot.findMany({ where: { workspaceId: t.ws, businessId: t.biz, periodStart: D(k) }, orderBy: { version: "asc" } });
      const cash = await db.ownerCashflowSnapshot.findFirstOrThrow({ where: { workspaceId: t.ws, businessId: t.biz, periodStart: D(k) } });
      return { t, o, snaps, current: snaps[snaps.length - 1], cash, k, connectionId };
    };

    it("receivables, overdue receivables and cost of goods that the newest read no longer supplies return to UNKNOWN while a changed figure is amended", async () => {
      const r = await refreshed({ income: 20_000, cogs: null, arTotal: null, arCurrent: null });
      expect(r.snaps.map((x) => x.version)).toEqual([1, 2]);
      expect(r.current).toMatchObject({ revenue: 20_000, costOfGoods: null, receivables: null, overdueReceivables: null, payables: 2_500, supersededById: null });
      expect(r.snaps[0]).toMatchObject({ costOfGoods: 4_001, receivables: 7_000 }); // history keeps what was true then
      expect(r.cash).toMatchObject({ receivables: null, receivablesOverdue: null, bankBalance: 20_001 });
    });

    it("a withdrawal alone (nothing else changed) still creates a version that clears the figure", async () => {
      const r = await refreshed({ cogs: null });
      expect(r.snaps.map((x) => x.version)).toEqual([1, 2]);
      expect(r.current).toMatchObject({ revenue: 10_001, costOfGoods: null });
      const prov = await db.qboCanonicalProvenance.findMany({ where: { workspaceId: r.t.ws, periodStart: D(r.k), targetType: "FINANCIAL_SNAPSHOT" }, orderBy: { materializedAt: "asc" } });
      expect(prov.map((p) => p.action)).toEqual(["CREATED", "AMENDED"]);
    });

    it("a vanished bank account clears the Cashflow bank balance rather than keeping the old balance", async () => {
      const r = await refreshed({ bank: null });
      expect(r.cash.bankBalance).toBeNull();
      expect(r.cash).toMatchObject({ receivables: 7_000 });
    });

    it("a STATED zero is a number, not a missing figure: it replaces a non-zero value and stays 0", async () => {
      const r = await refreshed({ cogs: 0, arTotal: 0, arCurrent: 0, bank: 0 });
      expect(r.current).toMatchObject({ costOfGoods: 0, receivables: 0, overdueReceivables: 0 });
      expect(r.cash).toMatchObject({ bankBalance: 0, receivables: 0, receivablesOverdue: 0 });
    });

    it("an unchanged re-read after the withdrawal creates nothing further (no churn between unknown and unknown)", async () => {
      const r = await refreshed({ cogs: null });
      const f2 = makeFakeIntuit({ ...allMonths(), [r.k]: { ...books(1), cogs: null } });
      const o = await run(r.t, r.connectionId, f2);
      expect(o.status === "SYNCED" && o.counts.canonicalAmended).toBe(0);
      expect(await db.ownerFinancialSnapshot.count({ where: { workspaceId: r.t.ws, businessId: r.t.biz, periodStart: D(r.k) } })).toBe(2);
    });

    it("a manual owner amendment of the same month is never cleared or overwritten by a withdrawal", async () => {
      const t = await seedQboTenant();
      const { connectionId } = await connectQbo(t);
      const f = makeFakeIntuit(allMonths());
      await fullBaseline(t, connectionId, f);
      const k = monthKeys(12)[1];
      const current = await db.ownerFinancialSnapshot.findFirstOrThrow({ where: { workspaceId: t.ws, businessId: t.biz, periodStart: D(k), supersededById: null } });
      await amendFinancialSnapshot(current.id, { amendmentReason: "Owner corrected cost of goods", costOfGoodsOrServices: 3_333 }, t.actor, t.ws);
      f.books.set(k, { ...books(1), cogs: null, arTotal: null, arCurrent: null });
      await run(t, connectionId, f);
      const after = await db.ownerFinancialSnapshot.findMany({ where: { workspaceId: t.ws, businessId: t.biz, periodStart: D(k) }, orderBy: { version: "asc" } });
      expect(after).toHaveLength(2);
      expect(after[1]).toMatchObject({ costOfGoods: 3_333, receivables: 7_000, supersededById: null });
    });
  });

  it("basis mismatch: a Cash report among Accrual requests is preserved with its basis but never materialized", async () => {
    const t = await seedQboTenant();
    const { connectionId } = await connectQbo(t);
    const f = makeFakeIntuit(Object.fromEntries(monthKeys(12).map((k) => [k, { ...books(0), basis: "Cash" }])));
    await run(t, connectionId, f);
    expect(await db.qboReportSnapshot.count({ where: { connectionId, accountingBasis: "CASH" } })).toBe(12);
    expect(await db.ownerFinancialSnapshot.count({ where: { workspaceId: t.ws } })).toBe(0);
  });

  it("sandbox isolation: a sandbox connection to a REAL business keeps evidence but never materializes; to a fixture business it does", async () => {
    const { t: real, c: rc } = await sandboxConnectionOnDemotedBusiness();
    const f = makeFakeIntuit(allMonths());
    const o = await runQboSync({ workspaceId: real.ws, connectionId: rc.connectionId, trigger: "SCHEDULED" }, depsFor(f, "sandbox"));
    expect(o.status === "SYNCED" && o.counts.refused).toBe(6);
    expect(await db.qboReportSnapshot.count({ where: { connectionId: rc.connectionId } })).toBe(12);
    expect(await db.ownerFinancialSnapshot.count({ where: { workspaceId: real.ws } })).toBe(0);

    const fx = await seedQboTenant({ fixture: true });
    const fc = await connectQbo(fx, "sandbox");
    const o2 = await runQboSync({ workspaceId: fx.ws, connectionId: fc.connectionId, trigger: "SCHEDULED" }, depsFor(makeFakeIntuit(allMonths()), "sandbox"));
    expect(o2.status === "SYNCED" && o2.counts.canonicalCreated).toBe(6);
    expect(await db.ownerFinancialSnapshot.count({ where: { workspaceId: fx.ws } })).toBe(3);
  });

  it("DB backstop: provenance for sandbox->real (or production->fixture) is rejected even if a service forgot", async () => {
    const { t: real, c: rc } = await sandboxConnectionOnDemotedBusiness();
    const snap = await db.ownerFinancialSnapshot.create({ data: { id: randomUUID(), workspaceId: real.ws, businessId: real.biz, periodStart: D("2026-01-01"), periodEnd: D("2026-01-31"), currency: "USD", dataConfidenceScore: 1, missingCriticalData: [] } });
    const obs = await db.qboReportSnapshot.create({ data: { id: randomUUID(), workspaceId: real.ws, businessId: real.biz, connectionId: rc.connectionId, environment: "sandbox", realmId: rc.realmId, reportType: "PROFIT_AND_LOSS", periodStart: D("2026-01-01"), periodEnd: D("2026-01-31"), accountingBasis: "ACCRUAL", basisSource: "REQUESTED", currency: "USD", version: 1, contentHash: "a".repeat(64), parserVersion: 1, noReportData: false, values: { v: {} }, acquiredAt: new Date(), lastConfirmedAt: new Date() } });
    await expect(db.qboCanonicalProvenance.create({ data: { id: randomUUID(), workspaceId: real.ws, businessId: real.biz, connectionId: rc.connectionId, environment: "sandbox", realmId: rc.realmId, targetType: "FINANCIAL_SNAPSHOT", financialSnapshotId: snap.id, periodStart: D("2026-01-01"), periodEnd: D("2026-01-31"), action: "CREATED", accountingBasis: "ACCRUAL", currency: "USD", plObservationId: obs.id, derivedValues: {}, materializedAt: new Date() } })).rejects.toThrow(/QBO_ENVIRONMENT_ISOLATION/);
  });

  it("a different QuickBooks company never overwrites months another company produced (REALM_MISMATCH)", async () => {
    const t = await seedQboTenant();
    const a = await connectQbo(t);
    const f = makeFakeIntuit(allMonths());
    await run(t, a.connectionId, f);
    await disconnectQboConnection({ workspaceId: t.ws, actorId: t.actor, connectionId: a.connectionId });
    const b = await connectQbo(t); // a different realm
    expect(b.connectionId).not.toBe(a.connectionId);
    const f2 = makeFakeIntuit(Object.fromEntries(monthKeys(12).map((k, i) => [k, { ...books(i), income: 1 }])));
    const o = await run(t, b.connectionId, f2);
    expect(o.status === "SYNCED" && o.counts.refused).toBeGreaterThanOrEqual(2);
    const k = monthKeys(12)[0];
    const row = await db.ownerFinancialSnapshot.findFirstOrThrow({ where: { workspaceId: t.ws, businessId: t.biz, periodStart: D(k), supersededById: null } });
    expect(row.revenue).toBe(10_000);
    // history stays tied to the realm that produced it
    expect(await db.qboReportSnapshot.count({ where: { connectionId: a.connectionId } })).toBeGreaterThan(0);
  });

  describe("failure and recovery", () => {
    it("transient provider failure: recorded, rethrown for scheduler retry; progress survives; recovery clears and audits", async () => {
      const t = await seedQboTenant();
      const { connectionId } = await connectQbo(t);
      const f = makeFakeIntuit(allMonths());
      // fail on the 2nd month's first report: month 1 = 4 calls ok, then 429s
      let n = 0;
      const orig = f.reader.reportWithMeta.bind(f.reader);
      f.reader.reportWithMeta = async (...a) => { if (++n === 5) throw new QboProviderError({ kind: "RATE_LIMITED", httpStatus: 429 }); return orig(...a); };
      await expect(run(t, connectionId, f)).rejects.toMatchObject({ kind: "RATE_LIMITED" });
      let st = await db.qboSyncState.findUniqueOrThrow({ where: { connectionId } });
      expect(st).toMatchObject({ lifecycle: "FAILING", lastErrorCode: "RATE_LIMITED", consecutiveFailures: 1 });
      expect(st.baselineCursor?.toISOString().slice(0, 10)).toBe(monthKeys(12)[1]); // month 0 done, resume at month 1
      expect(await db.ownerFinancialSnapshot.count({ where: { workspaceId: t.ws } })).toBe(1);
      const o = await run(t, connectionId, f);
      expect(o.status).toBe("SYNCED");
      st = await db.qboSyncState.findUniqueOrThrow({ where: { connectionId } });
      expect(st).toMatchObject({ consecutiveFailures: 0, lastErrorCode: null });
      const events = await db.auditEvent.findMany({ where: { workspaceId: t.ws, eventName: { in: ["qbo.sync_failed", "qbo.sync_recovered"] } }, select: { eventName: true } });
      expect(events.map((e) => e.eventName).sort()).toEqual(["qbo.sync_failed", "qbo.sync_recovered"]);
    });

    it("5xx is retryable; 4xx BAD_REQUEST is terminal (FAILED, no throw)", async () => {
      const t = await seedQboTenant();
      const { connectionId } = await connectQbo(t);
      const f = makeFakeIntuit(allMonths());
      f.failNext.push(new QboProviderError({ kind: "TRANSIENT_PROVIDER_FAILURE", httpStatus: 503 }));
      await expect(run(t, connectionId, f)).rejects.toMatchObject({ kind: "TRANSIENT_PROVIDER_FAILURE" });
      f.failNext.push(new QboProviderError({ kind: "BAD_REQUEST", httpStatus: 400 }));
      expect(await run(t, connectionId, f)).toMatchObject({ status: "FAILED", code: "BAD_REQUEST" });
      expect((await db.qboSyncState.findUniqueOrThrow({ where: { connectionId } })).consecutiveFailures).toBe(2);
    });

    it("malformed report: nothing partial is persisted for the month; terminal bounded code", async () => {
      const t = await seedQboTenant();
      const { connectionId } = await connectQbo(t);
      const f = makeFakeIntuit(allMonths());
      const orig = f.reader.reportWithMeta.bind(f.reader);
      f.reader.reportWithMeta = async (name, params) => (name === "BalanceSheet" ? { body: { not: "a report" }, intuitTid: null } : orig(name, params));
      const o = await run(t, connectionId, f);
      expect(o).toMatchObject({ status: "FAILED", code: "REPORT_NOT_A_REPORT" });
      expect(await db.qboReportSnapshot.count({ where: { connectionId } })).toBe(0);
      expect(await db.ownerFinancialSnapshot.count({ where: { workspaceId: t.ws } })).toBe(0);
    });

    it("a fresh token still rejected (401 after refresh) or a 403 => REAUTH_REQUIRED on the connection", async () => {
      const t = await seedQboTenant();
      const { connectionId } = await connectQbo(t);
      const f = makeFakeIntuit(allMonths());
      f.failNext.push(new QboProviderError({ kind: "FORBIDDEN", httpStatus: 403 }));
      expect(await run(t, connectionId, f)).toEqual({ status: "REAUTH_REQUIRED" });
      expect((await db.qboConnection.findUniqueOrThrow({ where: { id: connectionId } })).status).toBe("REAUTH_REQUIRED");
      // a connection needing re-authorization is not synced
      expect(await run(t, connectionId, f)).toEqual({ status: "SKIPPED", reason: "NOT_ACTIVE" });
    });

    it("lease loss (abort) stops cleanly: progress already committed is kept, nothing after it is written", async () => {
      const t = await seedQboTenant();
      const { connectionId } = await connectQbo(t);
      const f = makeFakeIntuit(allMonths());
      const ac = new AbortController();
      let n = 0;
      const orig = f.reader.reportWithMeta.bind(f.reader);
      f.reader.reportWithMeta = async (...a) => { if (++n === 5) { ac.abort(); throw new QboProviderError({ kind: "CANCELLED" }); } return orig(...a); };
      const o = await run(t, connectionId, f, { signal: ac.signal });
      expect(o.status).toBe("CANCELLED");
      expect(await db.ownerFinancialSnapshot.count({ where: { workspaceId: t.ws } })).toBe(1);
    });

    it("overlapping syncs of one connection: exactly one runs, the other is SKIPPED/LOCKED; another connection is not blocked", async () => {
      const t = await seedQboTenant();
      const { connectionId } = await connectQbo(t);
      const t2 = await seedQboTenant();
      const c2 = await connectQbo(t2);
      const slow = makeFakeIntuit(allMonths());
      const orig = slow.reader.reportWithMeta.bind(slow.reader);
      slow.reader.reportWithMeta = async (...a) => { await new Promise((r) => setTimeout(r, 40)); return orig(...a); };
      const [r1, r2, other] = await Promise.all([run(t, connectionId, slow), run(t, connectionId, slow), run(t2, c2.connectionId, makeFakeIntuit(allMonths()))]);
      expect([r1.status, r2.status].sort()).toEqual(["SKIPPED", "SYNCED"]);
      expect(other.status).toBe("SYNCED");
    });

    it("connection A failing does not block connection B", async () => {
      const a = await seedQboTenant(); const b = await seedQboTenant();
      const ca = await connectQbo(a); const cb = await connectQbo(b);
      const fa = makeFakeIntuit(allMonths()); fa.failNext.push(new QboProviderError({ kind: "TRANSIENT_PROVIDER_FAILURE" }));
      await expect(run(a, ca.connectionId, fa)).rejects.toBeDefined();
      expect((await run(b, cb.connectionId, makeFakeIntuit(allMonths()))).status).toBe("SYNCED");
    });
  });

  describe("tenancy and evidence integrity (database)", () => {
    it("observations/provenance/sync-state cannot attach to another workspace, business, realm or connection", async () => {
      const a = await seedQboTenant(); const b = await seedQboTenant();
      const ca = await connectQbo(a);
      const base = { id: randomUUID(), connectionId: ca.connectionId, environment: "production", realmId: ca.realmId, reportType: "PROFIT_AND_LOSS", periodStart: D("2026-01-01"), periodEnd: D("2026-01-31"), accountingBasis: "ACCRUAL", basisSource: "REQUESTED", currency: "USD", version: 1, contentHash: "b".repeat(64), parserVersion: 1, noReportData: false, values: { v: {} }, acquiredAt: new Date(), lastConfirmedAt: new Date() };
      await expect(db.qboReportSnapshot.create({ data: { ...base, workspaceId: b.ws, businessId: a.biz } })).rejects.toThrow(); // foreign workspace
      await expect(db.qboReportSnapshot.create({ data: { ...base, workspaceId: a.ws, businessId: randomUUID() } })).rejects.toThrow(); // wrong business
      await expect(db.qboReportSnapshot.create({ data: { ...base, workspaceId: a.ws, businessId: a.biz, realmId: "999" } })).rejects.toThrow(); // wrong realm
      await expect(db.qboReportSnapshot.create({ data: { ...base, workspaceId: a.ws, businessId: a.biz, environment: "sandbox" } })).rejects.toThrow(); // wrong environment
      await expect(db.qboReportSnapshot.create({ data: { ...base, id: randomUUID(), workspaceId: a.ws, businessId: a.biz, connectionId: randomUUID() } })).rejects.toThrow(); // unknown connection
      await expect(db.qboSyncState.create({ data: { connectionId: ca.connectionId, workspaceId: b.ws, businessId: a.biz, lifecycle: "NEVER_SYNCED" } })).rejects.toThrow();
      // one sync state per connection
      await db.qboSyncState.create({ data: { connectionId: ca.connectionId, workspaceId: a.ws, businessId: a.biz, lifecycle: "NEVER_SYNCED" } });
      await expect(db.qboSyncState.create({ data: { connectionId: ca.connectionId, workspaceId: a.ws, businessId: a.biz, lifecycle: "SYNCED" } })).rejects.toThrow();
    });

    it("provenance cannot borrow another connection's observation or another workspace's snapshot", async () => {
      const a = await seedQboTenant(); const b = await seedQboTenant();
      const ca = await connectQbo(a); const cb = await connectQbo(b);
      const f = makeFakeIntuit(allMonths());
      await run(a, ca.connectionId, f);
      await run(b, cb.connectionId, makeFakeIntuit(allMonths()));
      const bObs = await db.qboReportSnapshot.findFirstOrThrow({ where: { connectionId: cb.connectionId } });
      const aSnap = await db.ownerFinancialSnapshot.findFirstOrThrow({ where: { workspaceId: a.ws } });
      const mk = (over: Record<string, unknown>) => db.qboCanonicalProvenance.create({ data: { id: randomUUID(), workspaceId: a.ws, businessId: a.biz, connectionId: ca.connectionId, environment: "production", realmId: ca.realmId, targetType: "FINANCIAL_SNAPSHOT", financialSnapshotId: aSnap.id, periodStart: D("2026-01-01"), periodEnd: D("2026-01-31"), action: "CREATED", accountingBasis: "ACCRUAL", currency: "USD", derivedValues: {}, materializedAt: new Date(), ...over } as never });
      await expect(mk({ plObservationId: bObs.id })).rejects.toThrow(); // cross-connection observation
      const bSnap = await db.ownerFinancialSnapshot.findFirstOrThrow({ where: { workspaceId: b.ws } });
      await expect(mk({ financialSnapshotId: bSnap.id, plObservationId: (await db.qboReportSnapshot.findFirstOrThrow({ where: { connectionId: ca.connectionId } })).id })).rejects.toThrow(); // cross-workspace snapshot
    });

    it("observations are immutable evidence (only confirmation counters change); provenance is append-only; nothing is deletable", async () => {
      const t = await seedQboTenant();
      const { connectionId } = await connectQbo(t);
      await run(t, connectionId, makeFakeIntuit(allMonths()));
      const o = await db.qboReportSnapshot.findFirstOrThrow({ where: { connectionId } });
      await expect(db.qboReportSnapshot.update({ where: { id: o.id }, data: { values: { v: { income: 1 } } } })).rejects.toThrow(/immutable/);
      await expect(db.qboReportSnapshot.update({ where: { id: o.id }, data: { contentHash: "c".repeat(64) } })).rejects.toThrow(/immutable/);
      await expect(db.qboReportSnapshot.delete({ where: { id: o.id } })).rejects.toThrow(/cannot be deleted/);
      await db.qboReportSnapshot.update({ where: { id: o.id }, data: { confirmCount: { increment: 1 } } });
      const p = await db.qboCanonicalProvenance.findFirstOrThrow({ where: { workspaceId: t.ws } });
      await expect(db.qboCanonicalProvenance.update({ where: { id: p.id }, data: { action: "AMENDED" } })).rejects.toThrow(/append-only/);
      await expect(db.qboCanonicalProvenance.delete({ where: { id: p.id } })).rejects.toThrow(/append-only/);
      // governed canonical rows cannot be deleted while provenance points at them
      await expect(db.ownerFinancialSnapshot.delete({ where: { id: p.financialSnapshotId ?? "00000000-0000-0000-0000-000000000000" } })).rejects.toThrow();
    });

    it("stored observations hold only allowlisted totals — no provider body, no customer rows, no token material", async () => {
      const t = await seedQboTenant();
      const g = grant();
      const { connectionId } = await connectQbo(t, "production", undefined, g);
      await run(t, connectionId, makeFakeIntuit(allMonths()));
      const rows = await db.qboReportSnapshot.findMany({ where: { connectionId } });
      const dump = JSON.stringify(rows);
      expect(dump).not.toContain("Some Customer");
      expect(dump).not.toContain(g.accessToken);
      expect(dump).not.toContain(g.refreshToken);
      expect(dump).not.toContain("csecret");
      for (const r of rows) expect(Object.keys((r.values as { v: object }).v).length).toBeLessThanOrEqual(4);
    });
  });

  it("audit: lifecycle events only (no per-row spam) — baseline completed once, materialization events per canonical write", async () => {
    const t = await seedQboTenant();
    const { connectionId } = await connectQbo(t);
    await fullBaseline(t, connectionId, makeFakeIntuit(allMonths()));
    const ev = await db.auditEvent.groupBy({ by: ["eventName"], where: { workspaceId: t.ws, eventName: { startsWith: "qbo." } }, _count: true });
    const m = Object.fromEntries(ev.map((e) => [e.eventName, e._count]));
    expect(m["qbo.baseline_completed"]).toBe(1);
    expect(m["qbo.canonical_materialized"]).toBe(24);
    expect(m["qbo.sync_failed"]).toBeUndefined();
  });
});

describe.skipIf(!SHOULD_RUN_DB_TESTS)("QBO canonical writes after a disconnect", () => {
  it("a sync already running when the owner disconnects cannot add canonical evidence afterwards", async () => {
    const t = await seedQboTenant();
    const { connectionId } = await connectQbo(t);
    const f = makeFakeIntuit(allMonths());
    const orig = f.reader.reportWithMeta.bind(f.reader);
    let n = 0;
    // disconnect in the middle of the first month's reads (after report #2)
    f.reader.reportWithMeta = async (...a) => {
      if (++n === 3) await disconnectQboConnection({ workspaceId: t.ws, actorId: t.actor, connectionId });
      return orig(...a);
    };
    const o = await run(t, connectionId, f);
    expect(o.status === "SYNCED" && o.counts.refused).toBeGreaterThan(0);
    expect(await db.ownerFinancialSnapshot.count({ where: { workspaceId: t.ws } })).toBe(0);
    expect(await db.ownerCashflowSnapshot.count({ where: { workspaceId: t.ws } })).toBe(0);
    expect(await db.qboCanonicalProvenance.count({ where: { workspaceId: t.ws } })).toBe(0);
  });
});
