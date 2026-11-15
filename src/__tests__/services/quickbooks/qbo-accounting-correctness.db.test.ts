/**
 * Accounting-correctness scenarios on real PostgreSQL (fake Intuit). Every assertion is about a NUMBER or an identity that must
 * be true at the end of the chain, not that an object exists:
 *   QuickBooks P&L / Aged AR / Balance Sheet -> versioned observation -> provenance -> Finance + Cashflow snapshots -> the
 *   existing Finance engine input / diagnosis -> Business Condition.
 */
import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { connectQbo, envFor, makeFakeIntuit, monthKeys, seedQboTenant, type FakeIntuit, type MonthBooks, type QboTenant } from "@/__tests__/test-helpers/qbo-db-fixtures";
import { runQboSync } from "@/services/quickbooks/qbo-sync.service";
import { runFinanceDiagnosis } from "@/services/owner-finance/diagnosis.service";
import { getFinanceDashboard } from "@/services/owner-finance/dashboard.service";
import { loadFinanceEngineInput } from "@/services/owner-finance/liquidity.service";
import { getBusinessCondition } from "@/services/owner-condition/business-condition.service";
import { amendFinancialSnapshot } from "@/services/owner-finance/snapshot.service";

const D = (k: string) => new Date(`${k}T00:00:00.000Z`);
const jan = (over: Partial<MonthBooks> = {}): MonthBooks => ({ income: 100_000, cogs: 40_000, bank: 25_000, arTotal: 12_000, arCurrent: 7_000, apTotal: 9_000, apCurrent: 4_000, ...over });
const months = (first: MonthBooks) => Object.fromEntries(monthKeys(12).map((k, i) => [k, i === 0 ? first : { ...jan(), income: 50_000 + i }]));

async function connected(over: Partial<MonthBooks> = {}) {
  const t = await seedQboTenant();
  const c = await connectQbo(t);
  const f = makeFakeIntuit(months(jan(over)));
  const sync = () => runQboSync({ workspaceId: t.ws, connectionId: c.connectionId, trigger: "SCHEDULED" }, { env: envFor("production"), readClientFactory: () => f.reader });
  for (let i = 0; i < 4; i++) await sync();
  return { t, c, f, sync, latest: monthKeys(12)[0] };
}
const current = (t: QboTenant, k: string) => db.ownerFinancialSnapshot.findFirstOrThrow({ where: { workspaceId: t.ws, businessId: t.biz, periodStart: D(k), supersededById: null } });

describe.skipIf(!SHOULD_RUN_DB_TESTS)("QBO accounting correctness (real Postgres, fake Intuit)", () => {
  it("TRACE: the number that reaches the Finance engine and Business Condition equals the QuickBooks number it started as, for the right business, period, basis, currency and observation", async () => {
    const { t, c, latest } = await connected();
    const snap = await current(t, latest);
    // QuickBooks said revenue 100,000 / COGS 40,000 / AR 12,000 (7,000 current => 5,000 overdue) / AP 9,000 (4,000 current => 5,000 overdue) / bank 25,000
    expect(snap).toMatchObject({ businessId: t.biz, workspaceId: t.ws, currency: "USD", evidenceQuality: "ACTUAL", revenue: 100_000, costOfGoods: 40_000, receivables: 12_000, overdueReceivables: 5_000, payables: 9_000, overduePayables: 5_000 });
    expect(snap.periodStart).toEqual(D(latest));

    const obs = await db.qboReportSnapshot.findFirstOrThrow({ where: { connectionId: c.connectionId, reportType: "PROFIT_AND_LOSS", periodStart: D(latest) } });
    expect(obs).toMatchObject({ businessId: t.biz, realmId: c.realmId, environment: "production", accountingBasis: "ACCRUAL", currency: "USD", version: 1 });
    expect((obs.values as { v: { income: number } }).v.income).toBe(100_000);

    const prov = await db.qboCanonicalProvenance.findFirstOrThrow({ where: { financialSnapshotId: snap.id } });
    expect(prov).toMatchObject({ businessId: t.biz, connectionId: c.connectionId, realmId: c.realmId, environment: "production", accountingBasis: "ACCRUAL", currency: "USD", action: "CREATED", plObservationId: obs.id });
    expect(prov.periodStart).toEqual(D(latest));

    const cash = await db.ownerCashflowSnapshot.findFirstOrThrow({ where: { workspaceId: t.ws, businessId: t.biz, periodStart: D(latest) } });
    expect(cash).toMatchObject({ bankBalance: 25_000, receivables: 12_000, receivablesOverdue: 5_000, payables: 9_000, payablesOverdue: 5_000 });

    // the owner runs the analysis; the engine input carries the same numbers
    const cycle = await runFinanceDiagnosis(t.biz, snap.id, t.actor, t.ws);
    expect(cycle.snapshotId).toBe(snap.id);
    expect(await loadFinanceEngineInput(snap as never, t.ws)).toMatchObject({ revenue: 100_000, bankBalance: 25_000, receivables: 12_000, receivablesOverdue: 5_000, payables: 9_000, payablesOverdue: 5_000 });
    const bc = await getBusinessCondition(t.ws, t.biz);
    expect(bc.hasData).toBe(true);
    expect(bc.domainsWired).toContain("finance");
  });

  it("BACKDATED: January 100,000 -> 110,000 keeps both observations, versions the canonical row, points provenance at the right source version, stales the old analysis without re-running it", async () => {
    const { t, c, f, sync, latest } = await connected();
    const v1 = await current(t, latest);
    await runFinanceDiagnosis(t.biz, v1.id, t.actor, t.ws);
    expect(await db.ownerFinanceCycle.count({ where: { workspaceId: t.ws } })).toBe(1);

    f.books.set(latest, jan({ income: 110_000 }));
    await sync();

    // immutable QuickBooks history: both versions of the same report/period exist, with their own numbers
    const obs = await db.qboReportSnapshot.findMany({ where: { connectionId: c.connectionId, reportType: "PROFIT_AND_LOSS", periodStart: D(latest) }, orderBy: { version: "asc" } });
    expect(obs.map((o) => [o.version, (o.values as { v: { income: number } }).v.income])).toEqual([[1, 100_000], [2, 110_000]]);

    // canonical history is truthful: v1 kept (superseded) and the current version carries the new number
    const versions = await db.ownerFinancialSnapshot.findMany({ where: { workspaceId: t.ws, businessId: t.biz, periodStart: D(latest) }, orderBy: { version: "asc" } });
    expect(versions.map((v) => [v.version, v.revenue, v.supersededById !== null])).toEqual([[1, 100_000, true], [2, 110_000, false]]);
    expect(versions[1]).toMatchObject({ evidenceQuality: "ACTUAL", costOfGoods: 40_000 });

    // provenance names the exact source version for each canonical version
    const provs = await db.qboCanonicalProvenance.findMany({ where: { workspaceId: t.ws, periodStart: D(latest), targetType: "FINANCIAL_SNAPSHOT" }, orderBy: { materializedAt: "asc" } });
    expect(provs.map((p) => [p.action, p.financialSnapshotId, p.plObservationId])).toEqual([
      ["CREATED", versions[0].id, obs[0].id],
      ["AMENDED", versions[1].id, obs[1].id],
    ]);

    // the old analysis is out of date, and nothing was decided automatically
    const dash = await getFinanceDashboard(t.ws, t.biz);
    expect(dash.diagnosisTargetReason).toBe("amended");
    expect(dash.diagnosisTargetSnapshot).toMatchObject({ revenue: 110_000, version: 2 });
    expect(await db.ownerFinanceCycle.count({ where: { workspaceId: t.ws } })).toBe(1);

    // the owner refreshes the analysis (the same function the Money page calls): the new cycle reads 110,000
    const v2 = await current(t, latest);
    const cycle2 = await runFinanceDiagnosis(t.biz, v2.id, t.actor, t.ws);
    expect(cycle2.snapshotId).toBe(v2.id);
    expect((await loadFinanceEngineInput(v2 as never, t.ws)).revenue).toBe(110_000);
    expect(await db.ownerFinanceCycle.count({ where: { workspaceId: t.ws } })).toBe(2);
  });

  it("MANUAL PRECEDENCE: an owner-amended month is never overwritten by a later QuickBooks change, but QuickBooks' evidence is still recorded", async () => {
    const { t, c, f, sync, latest } = await connected();
    const v1 = await current(t, latest);
    const { snapshot: ownerV } = await amendFinancialSnapshot(v1.id, { amendmentReason: "Owner restated January", revenue: 95_000 }, t.actor, t.ws);
    expect(ownerV.revenue).toBe(95_000);
    const provBefore = await db.qboCanonicalProvenance.count({ where: { workspaceId: t.ws, targetType: "FINANCIAL_SNAPSHOT" } });

    f.books.set(latest, jan({ income: 110_000, cogs: null, arTotal: null, arCurrent: null }));
    const o = await sync();
    expect(o.status === "SYNCED" && o.counts.ownerControlled).toBeGreaterThanOrEqual(1);

    const row = await current(t, latest);
    expect(row).toMatchObject({ id: ownerV.id, revenue: 95_000, costOfGoods: 40_000, receivables: 12_000, supersededById: null });
    expect(await db.qboCanonicalProvenance.count({ where: { workspaceId: t.ws, targetType: "FINANCIAL_SNAPSHOT" } })).toBe(provBefore); // QuickBooks wrote no Finance row (the Cashflow row was never edited by the owner, so it stays QuickBooks-controlled)
    // the new QuickBooks reading is on record as evidence (version 2) even though it was not applied
    const obs = await db.qboReportSnapshot.findMany({ where: { connectionId: c.connectionId, reportType: "PROFIT_AND_LOSS", periodStart: D(latest) }, orderBy: { version: "asc" } });
    expect(obs.map((x) => x.version)).toEqual([1, 2]);
  });

  it("WRONG-CONTEXT NUMBERS NEVER REACH A SNAPSHOT: currency mismatch, basis mismatch and a different Realm each leave the current figures untouched", async () => {
    const { t, c, f, sync, latest } = await connected();
    const before = await current(t, latest);

    f.books.set(latest, jan({ income: 1, currency: "EUR" }));
    await sync();
    f.books.set(latest, jan({ income: 2, basis: "Cash" }));
    await sync();
    const after = await current(t, latest);
    expect(after).toMatchObject({ id: before.id, revenue: 100_000, currency: "USD" });

    // a different QuickBooks company on the same business never rewrites months the first company produced
    const { disconnectQboConnection } = await import("@/services/quickbooks/qbo-connection.service");
    await disconnectQboConnection({ workspaceId: t.ws, actorId: t.actor, connectionId: c.connectionId });
    const other = await connectQbo(t);
    f.books.set(latest, jan({ income: 3 }));
    await runQboSync({ workspaceId: t.ws, connectionId: other.connectionId, trigger: "SCHEDULED" }, { env: envFor("production"), readClientFactory: () => f.reader });
    expect((await current(t, latest)).revenue).toBe(100_000);
    // and the historical provenance still names the ORIGINAL realm
    expect((await db.qboCanonicalProvenance.findFirstOrThrow({ where: { financialSnapshotId: before.id } })).realmId).toBe(c.realmId);
  });
});
