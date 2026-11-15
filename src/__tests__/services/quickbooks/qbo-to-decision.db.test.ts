/**
 * The Definition-of-Done chain on real PostgreSQL (fake Intuit):
 *   QuickBooks books -> observations -> provenance -> canonical snapshots -> (stale-analysis signal) -> the OWNER re-runs analysis
 *   -> the EXISTING Finance diagnosis reads the QuickBooks snapshot (+ QuickBooks bank balance via the liquidity contract)
 *   -> the cycle reaches Business Condition.
 * Nothing here is a second diagnosis engine: the only calls are the repository's own runFinanceDiagnosis / getFinanceDashboard /
 * getBusinessCondition.
 */
import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { connectQbo, envFor, makeFakeIntuit, monthKeys, seedQboTenant, type MonthBooks } from "@/__tests__/test-helpers/qbo-db-fixtures";
import { runQboSync } from "@/services/quickbooks/qbo-sync.service";
import { runFinanceDiagnosis } from "@/services/owner-finance/diagnosis.service";
import { getFinanceDashboard } from "@/services/owner-finance/dashboard.service";
import { loadFinanceEngineInput } from "@/services/owner-finance/liquidity.service";
import { getBusinessCondition } from "@/services/owner-condition/business-condition.service";

const books = (n: number): MonthBooks => ({ income: 20_000 + n, cogs: 9_000, bank: 15_000, arTotal: 8_000, arCurrent: 3_000, apTotal: 6_000, apCurrent: 1_000 });
const D = (k: string) => new Date(`${k}T00:00:00.000Z`);

describe.skipIf(!SHOULD_RUN_DB_TESTS)("QuickBooks -> owner re-runs analysis -> Finance diagnosis -> Business Condition", () => {
  it("proves the full decision chain and that sync alone never decides", async () => {
    const t = await seedQboTenant();
    const { connectionId } = await connectQbo(t);
    const f = makeFakeIntuit(Object.fromEntries(monthKeys(12).map((k, i) => [k, books(i)])));
    const sync = () => runQboSync({ workspaceId: t.ws, connectionId, trigger: "SCHEDULED" }, { env: envFor("production"), readClientFactory: () => f.reader });
    for (let i = 0; i < 4; i++) await sync();
    const latestKey = monthKeys(12)[0];

    // 1. Evidence arrived, but nothing was decided.
    expect(await db.ownerFinanceCycle.count({ where: { workspaceId: t.ws } })).toBe(0);
    let dash = await getFinanceDashboard(t.ws, t.biz);
    expect(dash.diagnosisTargetSnapshot).toMatchObject({ revenue: 20_000, evidenceQuality: "ACTUAL", costOfGoods: 9_000 });
    expect(dash.hasData).toBe(false);

    // 2. The OWNER runs the analysis (the same function the Money page's button calls).
    const snap = await db.ownerFinancialSnapshot.findFirstOrThrow({ where: { workspaceId: t.ws, businessId: t.biz, periodStart: D(latestKey), supersededById: null } });
    const cycle = await runFinanceDiagnosis(t.biz, snap.id, t.actor, t.ws);
    expect(cycle.snapshotId).toBe(snap.id);
    // The engine read the QuickBooks bank balance (Cashflow row) through the liquidity contract, and QuickBooks' AR/AP through the snapshot.
    const engineInput = await loadFinanceEngineInput(snap as never, t.ws);
    expect(engineInput).toMatchObject({ bankBalance: 15_000, receivables: 8_000, receivablesOverdue: 5_000, payables: 6_000, payablesOverdue: 5_000, revenue: 20_000 });
    expect(engineInput.cashOnHand).toBeUndefined(); // physical cash is the owner's to state — never inferred from QuickBooks

    dash = await getFinanceDashboard(t.ws, t.biz);
    expect(dash.hasData).toBe(true);
    expect(dash.latestSnapshotDiagnosis?.dependenciesChanged).toBe(false);

    // 3. Business Condition receives the resulting cycle (existing conversion, no QuickBooks-specific path).
    const bc = await getBusinessCondition(t.ws, t.biz);
    expect(bc.hasData).toBe(true);
    expect(bc.domainsWired).toContain("finance");
    expect(bc.profile).not.toBeNull();

    // 4. QuickBooks later changes the BANK balance: analysis is marked out of date (dependency moved); still nothing re-run.
    await new Promise((r) => setTimeout(r, 1100));
    f.books.set(latestKey, { ...books(0), bank: 3_000 });
    await sync();
    dash = await getFinanceDashboard(t.ws, t.biz);
    expect(dash.latestSnapshotDiagnosis?.dependenciesChanged).toBe(true);
    expect(await db.ownerFinanceCycle.count({ where: { workspaceId: t.ws } })).toBe(1);

    // 5. QuickBooks changes REVENUE of the same closed month: a new snapshot version exists and is the diagnosis target ("amended").
    f.books.set(latestKey, { ...books(0), bank: 3_000, income: 5_000 });
    await sync();
    dash = await getFinanceDashboard(t.ws, t.biz);
    expect(dash.diagnosisTargetReason).toBe("amended");
    expect(dash.diagnosisTargetSnapshot).toMatchObject({ revenue: 5_000, version: 2 });
    expect(await db.ownerFinanceCycle.count({ where: { workspaceId: t.ws } })).toBe(1);

    // 6. The owner re-runs: the NEW cycle is on the QuickBooks version 2 snapshot and uses the new bank balance.
    const v2 = await db.ownerFinancialSnapshot.findFirstOrThrow({ where: { workspaceId: t.ws, businessId: t.biz, periodStart: D(latestKey), supersededById: null } });
    const cycle2 = await runFinanceDiagnosis(t.biz, v2.id, t.actor, t.ws);
    expect(cycle2.snapshotId).toBe(v2.id);
    expect((await loadFinanceEngineInput(v2 as never, t.ws)).bankBalance).toBe(3_000);
    expect(await db.ownerFinanceCycle.count({ where: { workspaceId: t.ws } })).toBe(2);
    // and the superseded QuickBooks version is still on record with its provenance (why did the number change?)
    expect(await db.qboCanonicalProvenance.count({ where: { financialSnapshotId: snap.id } })).toBe(1);
    expect(await db.qboCanonicalProvenance.count({ where: { financialSnapshotId: v2.id } })).toBe(1);
  });
});
