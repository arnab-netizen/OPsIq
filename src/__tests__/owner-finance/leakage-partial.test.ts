/**
 * D9 — the cost-leakage group total must not be presented as complete when components are UNKNOWN.
 * Contract: costLeakageRatioPct is the % of sales over the components ENTERED (a lower bound while any is UNKNOWN);
 * an explicit 0 is a known component; the finding words it "at least", names what is missing, and confidence follows coverage.
 */
import { describe, it, expect } from "vitest";
import { diagnoseFinanceSnapshot } from "@/domain/owner-finance/diagnosis";
import { planFinanceActionsFromDiagnosis } from "@/domain/owner-finance/actions";
import { leakageCoverage } from "@/domain/owner-finance/cost-model";
import type { FinancialSnapshotInput } from "@/domain/owner-finance";

const NOW = new Date("2026-10-05T00:00:00Z");
const base = {
  periodStart: "2026-09-01", periodEnd: "2026-09-30", currency: "INR", evidenceQuality: "ACTUAL",
  revenue: 80000, fixedCosts: 20000, variableCosts: 35000, cashOnHand: 5000, bankBalance: 4000,
  costOfGoodsOrServices: 30000, salaryPayroll: 8000, loanEmiDebtPayments: 0, receivables: 1000, payables: 1000,
  ownerWithdrawals: 0, orderCount: 100, customerCount: 50,
} as unknown as FinancialSnapshotInput;
const leak = (d: ReturnType<typeof diagnoseFinanceSnapshot>) => d.findings.find((f) => f.code === "FIN_OPP_LEAKAGE_REDUCTION");

describe("cost leakage with UNKNOWN components", () => {
  const partial = diagnoseFinanceSnapshot({ ...base, discountAmount: 4000 }, { now: NOW });
  const complete = diagnoseFinanceSnapshot({ ...base, discountAmount: 4000, refundAmount: 0, reworkCost: 0, complaintCost: 0 }, { now: NOW });

  it("discounts alone (4,000 / 80,000) is reported as a known LOWER BOUND, not as the group total", () => {
    expect(partial.metrics.costLeakageRatioPct).toBe(5);
    expect(partial.metrics.costLeakageComplete).toBe(false);
    const f = leak(partial)!;
    expect(f.valueIsLowerBound).toBe(true);
    expect(f.summary).toMatch(/At least 5%/);
    expect(f.summary).toMatch(/refunds, redone work, complaint costs not entered/);
    expect(f.missingData).toEqual(["refunds", "redone work", "complaint costs"]);
    expect(f.evidence.join(" ")).toMatch(/>= 5%.*lower bound/);
  });

  it("the finding never uses the complete-group wording ('together') while partial; the owner rationale says 'at least'", () => {
    const plan = planFinanceActionsFromDiagnosis(partial);
    const a = plan.actions.find((x) => x.findingCode === "FIN_OPP_LEAKAGE_REDUCTION")!;
    expect(a.evidenceRationale).toMatch(/at least 5%/);
    expect(a.evidenceRationale).not.toMatch(/together/);
  });

  it("confidence follows coverage: 1 of 4 components known is strictly less sure than all 4 known", () => {
    expect(leak(partial)!.confidence).toBeLessThan(leak(complete)!.confidence);
  });

  it("explicit zeros are KNOWN: all four entered → complete, plain total wording, no lower-bound flag", () => {
    expect(complete.metrics.costLeakageComplete).toBe(true);
    const f = leak(complete)!;
    expect(f.valueIsLowerBound).toBeUndefined();
    expect(f.missingData).toEqual([]);
    expect(f.summary).not.toMatch(/At least/);
    const a = planFinanceActionsFromDiagnosis(complete).actions.find((x) => x.findingCode === "FIN_OPP_LEAKAGE_REDUCTION")!;
    expect(a.evidenceRationale).toMatch(/together are 5% of your sales/);
  });

  it("coverage helper: nothing entered → all unknown; no leakage ratio at all (never 0)", () => {
    expect(leakageCoverage(base)).toEqual({ known: [], unknown: ["discounts", "refunds", "redone work", "complaint costs"], complete: false });
    expect(diagnoseFinanceSnapshot(base, { now: NOW }).metrics.costLeakageRatioPct).toBeNull();
  });
});
