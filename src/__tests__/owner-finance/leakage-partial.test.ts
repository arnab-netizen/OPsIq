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

/** The D9 acceptance contract, one assertion group per clause. */
describe("D9 acceptance contract (UNKNOWN != 0)", () => {
  const find = (extra: Record<string, unknown>) => diagnoseFinanceSnapshot({ ...base, ...extra } as FinancialSnapshotInput, { now: NOW });

  it("1. complete components: true aggregate, no 'at least', normal complete-evidence confidence and wording", () => {
    const d = find({ discountAmount: 4000, refundAmount: 1000, reworkCost: 500, complaintCost: 500 });
    expect(d.metrics.costLeakageRatioPct).toBe(7.5); // (4000+1000+500+500)/80000
    expect(d.metrics.costLeakageComplete).toBe(true);
    const f = leak(d)!;
    expect(f.title).toBe("Recover margin by cutting cost leakage");
    expect(f.summary).toBe("Discounts/refunds/rework are recoverable margin; tightening them lifts profit directly.");
    expect(f.evidence).toEqual(["costLeakageRatioPct = 7.5%"]);
    expect(f.confidence).toBeCloseTo(d.metrics.dataConfidenceScore / 100, 5); // not scaled by coverage
    expect(JSON.stringify(f)).not.toMatch(/at least|lower bound/i);
  });

  it("2. partial components: lower bound, missing components named, confidence strictly reduced", () => {
    const d = find({ discountAmount: 4000, refundAmount: 1000 });
    expect(d.metrics.costLeakageRatioPct).toBe(6.3); // known subset only
    expect(d.metrics.costLeakageComplete).toBe(false);
    const f = leak(d)!;
    expect(f.valueIsLowerBound).toBe(true);
    expect(f.summary).toMatch(/At least 6\.3%/);
    expect(f.summary).toMatch(/redone work, complaint costs not entered/);
    expect(f.missingData).toEqual(["redone work", "complaint costs"]);
    expect(f.confidence).toBeLessThan(d.metrics.dataConfidenceScore / 100);
    expect(f.confidence).toBeCloseTo((d.metrics.dataConfidenceScore / 100) * (0.5 + 0.5 * (2 / 4)), 5);
  });

  it("3. all UNKNOWN: no numeric aggregate, no leakage finding, no lower-bound claim", () => {
    const d = find({});
    expect(d.metrics.costLeakageRatioPct).toBeNull();
    expect(d.metrics.refundReworkLeakagePct).toBeNull();
    expect(leak(d)).toBeUndefined();
    expect(d.findings.some((f) => f.valueIsLowerBound)).toBe(false);
  });

  it("4. explicit 0 stays a known zero: complete at 0%, not UNKNOWN, no leakage opportunity, never 'lower bound'", () => {
    const d = find({ discountAmount: 0, refundAmount: 0, reworkCost: 0, complaintCost: 0 });
    expect(d.metrics.costLeakageRatioPct).toBe(0);
    expect(d.metrics.costLeakageComplete).toBe(true);
    expect(leak(d)).toBeUndefined(); // 0% is below the 2% opportunity floor — a known zero, not an unknown
    // a known zero beside UNKNOWN parts is still only a (zero) lower bound of the entered components
    const partialZero = find({ discountAmount: 0 });
    expect(partialZero.metrics.costLeakageRatioPct).toBe(0);
    expect(partialZero.metrics.costLeakageComplete).toBe(false);
    expect(leakageCoverage({ ...base, discountAmount: 0 } as FinancialSnapshotInput).known).toEqual(["discounts"]);
  });
});
