import { describe, it, expect } from "vitest";
import { assessScoreAvailability, presentScores } from "@/domain/owner-spine/score-availability";
import { diagnoseFinanceSnapshot } from "@/domain/owner-finance/diagnosis";
import type { FinancialSnapshotInput } from "@/domain/owner-finance";
import { financeScoreAvailability } from "@/domain/owner-finance/score-availability";

const NOW = new Date("2026-10-05T00:00:00Z");
const base = { periodStart: "2026-09-01", periodEnd: "2026-09-30", currency: "INR", evidenceQuality: "ACTUAL" } as const;
const full: FinancialSnapshotInput = {
  ...base, revenue: 80000, fixedCosts: 20000, variableCosts: 35000, cashOnHand: 5000, bankBalance: 4000,
  costOfGoodsOrServices: 30000, salaryPayroll: 8000, loanEmiDebtPayments: 0, receivables: 1000, payables: 1000,
  ownerWithdrawals: 0, orderCount: 100, customerCount: 50, discountAmount: 0, refundAmount: 0,
} as FinancialSnapshotInput;

function availabilityOf(i: FinancialSnapshotInput) {
  const d = diagnoseFinanceSnapshot(i, { now: NOW });
  return { d, a: financeScoreAvailability(i, d.metrics.dataConfidenceScore) };
}

describe("UNKNOWN is never scored as healthy, safe, zero-risk or zero-opportunity", () => {
  it("revenue UNKNOWN → WITHHELD: no number is presented for any score", () => {
    const { d, a } = availabilityOf({ ...full, revenue: undefined });
    expect(a).toBe("WITHHELD");
    // The engine's raw arithmetic is the hazard being guarded: it still produced a healthy-looking figure.
    expect(d.domainScore.riskScore).toBe(0);
    const p = presentScores({ health: d.domainScore.healthScore, risk: d.domainScore.riskScore, opportunity: d.domainScore.opportunityScore }, a);
    for (const s of p.scores) expect(s.value).toBe("Not scored yet");
    expect(p.note).toMatch(/missing information/);
  });
  it("every cost UNKNOWN → WITHHELD", () => {
    const { a } = availabilityOf({ ...base, revenue: 80000 } as FinancialSnapshotInput);
    expect(a).toBe("WITHHELD");
  });
  it("multiple critical fields UNKNOWN → WITHHELD", () => {
    expect(availabilityOf({ ...base } as FinancialSnapshotInput).a).toBe("WITHHELD");
  });
  it("cash UNKNOWN only → PARTIAL: risk 0 is worded 'none found so far', never '0/100'", () => {
    const { d, a } = availabilityOf({ ...full, cashOnHand: undefined, bankBalance: undefined });
    expect(a).toBe("PARTIAL");
    const p = presentScores({ health: d.domainScore.healthScore, risk: 0, opportunity: 0 }, a);
    expect(p.scores.find((s) => s.kind === "risk")!.value).toBe("None found so far");
    expect(p.scores.find((s) => s.kind === "opportunity")!.value).toBe("None found so far");
    expect(p.scores.find((s) => s.kind === "health")!.value).toMatch(/^\d+\/100$/);
    expect(p.note).toMatch(/none found so far/);
  });
  it("explicit numeric zeros are KNOWN: complete evidence with zero cash, zero discounts and zero costs stays scored", () => {
    const { a } = availabilityOf({ ...full, cashOnHand: 0, bankBalance: 0, variableCosts: 0, discountAmount: 0 });
    expect(a).not.toBe("WITHHELD");
  });
  it("complete evidence → FULL: scores stand unqualified, a measured 0 risk is shown as 0/100", () => {
    const { d, a } = availabilityOf(full);
    expect(a).toBe("FULL");
    const p = presentScores({ health: d.domainScore.healthScore, risk: 0, opportunity: 0 }, a);
    expect(p.scores.map((s) => s.value)).toEqual([`${Math.round(d.domainScore.healthScore)}/100`, "0/100", "0/100"]);
    expect(p.note).toBeNull();
  });
  it("a reading with confidence below the BLOCKED line is withheld even without a named critical gap", () => {
    expect(assessScoreAvailability({ dataConfidenceScore: 20, missingCritical: [] })).toBe("WITHHELD");
    expect(assessScoreAvailability({ dataConfidenceScore: Number.NaN, missingCritical: [] })).toBe("WITHHELD");
  });
});
