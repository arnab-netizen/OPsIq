/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma `db` proxy returns untyped rows */
/**
 * P2 (controlled-beta acceptance): an unknown bank balance on a healthy-profit business must never surface as a
 * survival crisis. Real service path, throwaway local Postgres only:
 *   Finance snapshot → correction (fixed costs 70000 → 40000) → Finance diagnosis → getOwnerNowView
 *   (cashProfitProtection, derivedBusinessCondition) → getOwnerRecoveryStatus.
 *
 * Run: OPSIQ_DB_TARGET=local TEST_WITH_DB=true DATABASE_URL=<loopback throwaway> npx vitest run src/__tests__/owner-guidance/false-survival-triage-unknown-bank.db.test.ts
 */
import { describe, it, expect } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { teardownOwnerBusiness } from "../test-helpers/owner-business-teardown";
import { seedKnownBank } from "../test-helpers/seed-known-bank";
import { createFirstBusiness, getFirstMoneyRead } from "@/services/owner-first-run/first-run.service";
import { correctFirstResultEvidence } from "@/services/owner-first-run/first-run-actions.service";
import { createFinancialSnapshot } from "@/services/owner-finance/snapshot.service";
import { runFinanceDiagnosis } from "@/services/owner-finance/diagnosis.service";
import { getOwnerNowView } from "@/services/owner-guidance/owner-now-view.service";
import { highestConditionRisk } from "@/domain/business-condition/condition-risk";
import { getOwnerRecoveryStatus } from "@/services/owner-mode/owner-recovery-status.service";

const lastMonth = () => {
  const end = new Date();
  end.setUTCDate(0);
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  return { periodStart: start.toISOString().slice(0, 10), periodEnd: end.toISOString().slice(0, 10) };
};

async function tenant() {
  const workspaceId = randomUUID();
  const userId = randomUUID();
  await db.user.create({
    data: { id: userId, email: `${userId}@false-triage.test`, emailVerifiedAt: new Date(Date.now() - 120_000), requiresEmailVerification: true, updatedAt: new Date() },
  });
  await db.workspace.create({ data: { id: workspaceId, name: "False Triage", slug: `ws-${workspaceId.slice(0, 8)}`, createdBy: userId } });
  const { business } = await createFirstBusiness(workspaceId, userId, { businessType: "laundry_local_service", currency: "gbp" });
  return { workspaceId, userId, businessId: business.id };
}

const codesOf = (cycle: { findings: Array<{ code: string }> }) => cycle.findings.map((f) => f.code);
const LEVELS = ["CRITICAL", "HIGH"];

async function project(workspaceId: string, businessId: string) {
  const nv: any = await getOwnerNowView(workspaceId, businessId);
  const recovery: any = await getOwnerRecoveryStatus(workspaceId, businessId);
  return { nv, recovery };
}

describe("[db] P2: unknown bank balance is a data gap, never a survival crisis", () => {
  it("[db] production journey: revenue 100000, fixed 70000 → corrected to 40000, cash 20000, bank unknown", async () => {
    const t = await tenant();
    const snap: any = await createFinancialSnapshot(
      t.businessId,
      { ...lastMonth(), currency: "GBP", revenue: 100000, fixedCosts: 70000, cashOnHand: 20000, evidenceQuality: "GOOD_ESTIMATE" } as any,
      t.userId, t.workspaceId,
    );
    const before: any = await runFinanceDiagnosis(t.businessId, snap.id, t.userId, t.workspaceId);
    expect(codesOf(before)).toContain("FIN_HIGH_FIXED_COST_BURDEN");

    const corrected = await correctFirstResultEvidence(t.workspaceId, t.userId, t.businessId, snap.id, { amendmentReason: "fix", fixedCosts: 40000 } as any);
    const read = await getFirstMoneyRead(t.workspaceId, t.businessId);
    // CORRECTION_REPLACES_CURRENT_SEMANTICS: the current read is the CORRECTED snapshot's, not the 70000-cost one.
    expect(read.snapshotId).toBe(corrected.newSnapshotId);
    expect(read.snapshotId).not.toBe(snap.id);

    const cycles: any[] = await db.ownerFinanceCycle.findMany({ where: { businessId: t.businessId }, orderBy: { sequenceNumber: "asc" }, include: { findings: true } });
    const current = cycles[cycles.length - 1];
    expect(current.snapshotId).toBe(corrected.newSnapshotId);
    const codes = codesOf(current);
    expect(codes).not.toContain("FIN_HIGH_FIXED_COST_BURDEN");
    expect(codes).not.toContain("FIN_LOW_ABSOLUTE_CASH");
    expect(codes).toContain("FIN_LIQUIDITY_UNCONFIRMED");

    const { nv, recovery } = await project(t.workspaceId, t.businessId);

    // MISSING_BANK_BALANCE_IS_DATA_GAP_NOT_CRISIS: recovery is not in crisis, and carries no stop-loss wording.
    expect(recovery.ok).toBe(true);
    expect(recovery.status.recoveryStatus).not.toBe("SURVIVAL_TRIAGE_ACTIVE");
    expect(recovery.status.recoveryStatus).toBe("NONE");
    expect(JSON.stringify(recovery.status)).not.toMatch(/Stop-loss in force|loss-making\/non-essential spend paused/i);

    // The bank-balance request stays, and nothing was made "safe": growth readiness is not cleared.
    expect(JSON.stringify(nv.view?.missingDataRequests)).toMatch(/bank balance/i);
    expect(nv.derivedBusinessCondition.growthReadinessLevel).not.toBe("HIGH");

    // The Cash/Profit signals contain only the data gap — no cash or margin danger for a healthy-profit business.
    const signals: any[] = nv.cashProfitProtection?.signals ?? [];
    expect(signals.every((s) => s.category === "DATA")).toBe(true);

    // UNCONFIRMED_LIQUIDITY_NEVER_IMPLIES_MARGIN_HIGH + Business condition consistency (Cockpit "highest risk").
    const cond = nv.derivedBusinessCondition;
    expect(cond.marginPressureLevel).toBe("unknown");
    expect(LEVELS).not.toContain(highestConditionRisk(cond));
    await teardownOwnerBusiness(t.businessId);
  }, 120000);

  it("[db] TRUE_CASH_RISK_STILL_TRIGGERS_RECOVERY: measured cash danger with a known bank still drives cash recovery", async () => {
    const t = await tenant();
    const per = lastMonth();
    await seedKnownBank(t.workspaceId, t.businessId, 0, { start: per.periodStart, end: per.periodEnd });
    const snap: any = await createFinancialSnapshot(t.businessId, { ...per, currency: "GBP", revenue: 180000, fixedCosts: 110000, variableCosts: 60000, cashOnHand: 40000 } as any, t.userId, t.workspaceId);
    const cycle: any = await runFinanceDiagnosis(t.businessId, snap.id, t.userId, t.workspaceId);
    expect(codesOf(cycle)).toContain("FIN_LOW_ABSOLUTE_CASH");
    const { nv, recovery } = await project(t.workspaceId, t.businessId);
    expect(nv.cashProfitProtection.signals.some((s: any) => s.category === "CASH" && s.signalType === "CASH_SAFETY_RISK")).toBe(true);
    expect(recovery.ok).toBe(true);
    expect(recovery.status.recoveryStatus).not.toBe("NONE");
    expect(recovery.status.stabilizationGate).toBe("BLOCKED");
    expect(recovery.status.thriveGate).toBe("BLOCKED");
    // CASH_DRIVER_NEVER_MASQUERADES_AS_MARGIN: the cash-driven Finance state is not reported as margin pressure.
    expect(nv.derivedBusinessCondition.marginPressureLevel).toBe("unknown");
    await teardownOwnerBusiness(t.businessId);
  }, 120000);

  it("[db] TRUE_MARGIN_RISK_STAYS_VISIBLE: a negative-margin business keeps a HIGH margin signal and a HIGH+ margin condition, never labelled cash", async () => {
    const t = await tenant();
    const per = lastMonth();
    await seedKnownBank(t.workspaceId, t.businessId, 500000, { start: per.periodStart, end: per.periodEnd });
    const snap: any = await createFinancialSnapshot(t.businessId, { ...per, currency: "GBP", revenue: 20000, fixedCosts: 30000, variableCosts: 10000, cashOnHand: 400000 } as any, t.userId, t.workspaceId);
    const cycle: any = await runFinanceDiagnosis(t.businessId, snap.id, t.userId, t.workspaceId);
    expect(cycle.survivalState).toBe("CRITICAL");
    expect(codesOf(cycle)).toContain("FIN_NEGATIVE_NET_MARGIN");
    const { nv } = await project(t.workspaceId, t.businessId);
    const signals: any[] = nv.cashProfitProtection.signals;
    expect(signals.find((s) => s.signalType === "LOW_MARGIN_WORK_RISK")?.severity).toBe("HIGH");
    expect(signals.some((s) => s.category === "CASH")).toBe(false);
    expect(["HIGH", "CRITICAL"]).toContain(nv.derivedBusinessCondition.marginPressureLevel);
    await teardownOwnerBusiness(t.businessId);
  }, 120000);
});
