/**
 * F1 forensic matrix (`[db]`, throwaway local Postgres only) — the production observation on "Acceptance Check 561":
 * cashOnHand 40,000, no bank balance, no Cashflow snapshot, ≈7.1 days of costs → FIN_LOW_ABSOLUTE_CASH / AT_RISK.
 *
 * Figures mirror production: revenue 180,000, fixed 110,000 (61.1%), variable 60,000 (net margin 5.6%), a 30-day period,
 * cash 40,000 → 40,000 / (170,000/30) = 7.06 ≈ 7.1 days. Characterization of CURRENT behaviour, through the REAL
 * services (createFinancialSnapshot / amendFinancialSnapshot / loadFinanceEngineInput / runFinanceDiagnosis).
 * Pre-cutover rows get an explicit createdAt (the snapshot service always stamps "now").
 */
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { teardownOwnerBusiness } from "../test-helpers/owner-business-teardown";
import { createBusiness } from "@/services/founder-recovery/business.service";
import { createFinancialSnapshot, amendFinancialSnapshot } from "@/services/owner-finance/snapshot.service";
import { runFinanceDiagnosis } from "@/services/owner-finance/diagnosis.service";
import { loadFinanceEngineInput } from "@/services/owner-finance/liquidity.service";
import { resolveLiquidity, PHYSICAL_CASH_SEMANTICS_EFFECTIVE_FROM } from "@/domain/owner-finance/liquidity";
import { diagnoseFinanceSnapshot } from "@/domain/owner-finance/diagnosis";

const actor = randomUUID();
const PRE_CUTOVER = new Date("2026-10-01T10:00:00Z"); // Acceptance Check 561 era (PR #561 merged 2026-10-01)
const FIGURES = { periodStart: "2026-09-01", periodEnd: "2026-09-30", currency: "INR", revenue: 180000, fixedCosts: 110000, variableCosts: 60000, cashOnHand: 40000 };

beforeAll(async () => {
  await db.user.upsert({ where: { id: actor }, update: {}, create: { id: actor, email: `f1-forensic-${actor}@example.com`, name: "F1 Forensic", isActive: true, updatedAt: new Date() } });
});

async function biz() {
  const workspaceId = randomUUID();
  const b = await createBusiness({ name: "F1 Forensic", businessType: "generic_local_service", currency: "INR", b2cSupported: true, b2bSupported: false }, actor, workspaceId);
  return { workspaceId, businessId: b.id };
}
async function inspect(workspaceId: string, businessId: string, snapshotId: string) {
  const row = await db.ownerFinancialSnapshot.findFirstOrThrow({ where: { id: snapshotId } });
  const input = await loadFinanceEngineInput(row, workspaceId);
  const liquidity = resolveLiquidity(input);
  const engine = diagnoseFinanceSnapshot({ ...input });
  const cycle = await runFinanceDiagnosis(businessId, snapshotId, actor, workspaceId);
  return {
    semantics: input.cashSemantics,
    bankKnown: input.bankBalance !== undefined,
    status: liquidity.status,
    totalLiquidFunds: liquidity.totalLiquidFunds,
    cashDaysOfCosts: engine.metrics.cashDaysOfCosts,
    codes: cycle.findings.map((f: { code: string }) => f.code),
    survival: cycle.survivalState as string,
  };
}
async function backdate(id: string, createdAt: Date) {
  await db.ownerFinancialSnapshot.update({ where: { id }, data: { createdAt } });
}

describe("[db] F1: legacy (pre-cutover) vs physical-only Finance liquidity — production figures", () => {
  it("[db] the cutover constant is the proven production deployment instant", () => {
    expect(PHYSICAL_CASH_SEMANTICS_EFFECTIVE_FROM).toBe("2026-10-04T15:29:07.000Z");
  });

  it("[db] Case A: pre-cutover row, cash 40,000, no bank → LEGACY_AMBIGUOUS; 40,000 is the entered total; FIN_LOW_ABSOLUTE_CASH is expected", async () => {
    const { workspaceId, businessId } = await biz();
    const s = await createFinancialSnapshot(businessId, FIGURES, actor, workspaceId);
    await backdate(s.id, PRE_CUTOVER);
    const r = await inspect(workspaceId, businessId, s.id);
    expect(r.semantics).toBe("LEGACY_AMBIGUOUS");
    expect(r.bankKnown).toBe(false);
    expect(r.status).toBe("COMPLETE");
    expect(r.totalLiquidFunds).toBe(40000);
    expect(r.cashDaysOfCosts).toBeCloseTo(7.1, 1);
    expect(r.codes).toContain("FIN_LOW_ABSOLUTE_CASH");
    expect(r.codes).not.toContain("FIN_LIQUIDITY_UNCONFIRMED");
    expect(r.survival).toBe("AT_RISK");
    await teardownOwnerBusiness(businessId);
  });

  it("[db] Case B: identical figures created after the cutover → PHYSICAL_ONLY; total liquidity unknown; no runway; no FIN_LOW_ABSOLUTE_CASH", async () => {
    const { workspaceId, businessId } = await biz();
    const s = await createFinancialSnapshot(businessId, FIGURES, actor, workspaceId); // created "now" (after the cutover)
    const r = await inspect(workspaceId, businessId, s.id);
    expect(r.semantics).toBe("PHYSICAL_ONLY");
    expect(r.bankKnown).toBe(false);
    expect(r.status).toBe("BANK_UNKNOWN");
    expect(r.totalLiquidFunds).toBeNull();
    expect(r.cashDaysOfCosts).toBeNull();
    expect(r.codes).toContain("FIN_LIQUIDITY_UNCONFIRMED");
    expect(r.codes).not.toContain("FIN_LOW_ABSOLUTE_CASH");
    await teardownOwnerBusiness(businessId);
  });

  it("[db] Case C: pre-cutover row amended after the cutover on an unrelated field → legacy meaning preserved", async () => {
    const { workspaceId, businessId } = await biz();
    const s = await createFinancialSnapshot(businessId, FIGURES, actor, workspaceId);
    await backdate(s.id, PRE_CUTOVER);
    const { snapshot } = await amendFinancialSnapshot(s.id, { receivables: 5000, amendmentReason: "add receivables" } as never, actor, workspaceId);
    expect(snapshot!.cashOnHand).toBe(40000);
    const r = await inspect(workspaceId, businessId, snapshot!.id);
    expect(r.semantics).toBe("LEGACY_AMBIGUOUS");
    expect(r.totalLiquidFunds).toBe(40000);
    expect(r.codes).toContain("FIN_LOW_ABSOLUTE_CASH");
    await teardownOwnerBusiness(businessId);
  });

  it("[db] Case D: pre-cutover row with cash explicitly re-entered after the cutover → PHYSICAL_ONLY; bank-unknown rules apply", async () => {
    const { workspaceId, businessId } = await biz();
    const s = await createFinancialSnapshot(businessId, FIGURES, actor, workspaceId);
    await backdate(s.id, PRE_CUTOVER);
    const { snapshot } = await amendFinancialSnapshot(s.id, { cashOnHand: 25000, amendmentReason: "physical cash only" } as never, actor, workspaceId);
    const r = await inspect(workspaceId, businessId, snapshot!.id);
    expect(r.semantics).toBe("PHYSICAL_ONLY");
    expect(r.status).toBe("BANK_UNKNOWN");
    expect(r.totalLiquidFunds).toBeNull();
    expect(r.codes).toContain("FIN_LIQUIDITY_UNCONFIRMED");
    expect(r.codes).not.toContain("FIN_LOW_ABSOLUTE_CASH");
    await teardownOwnerBusiness(businessId);
  });

  it("[db] Case D2: re-entering the SAME cash value after the cutover does not change the meaning (indistinguishable from an untouched copy)", async () => {
    const { workspaceId, businessId } = await biz();
    const s = await createFinancialSnapshot(businessId, FIGURES, actor, workspaceId);
    await backdate(s.id, PRE_CUTOVER);
    const { snapshot } = await amendFinancialSnapshot(s.id, { cashOnHand: 40000, amendmentReason: "re-confirm" } as never, actor, workspaceId);
    const r = await inspect(workspaceId, businessId, snapshot!.id);
    expect(r.semantics).toBe("LEGACY_AMBIGUOUS");
    await teardownOwnerBusiness(businessId);
  });
});
