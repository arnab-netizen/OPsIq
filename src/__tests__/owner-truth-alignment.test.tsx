/**
 * Owner-visible truth alignment: setup vs. evidence readiness, verification direction wording,
 * and the "No data gaps" statement. Pure/no DB.
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { verifyOutcome } from "@/domain/founder-recovery/verification";
import { VerificationEvidenceText, verificationGoalText } from "@/components/owner/VerificationEvidenceText";
import { buildExplanation, cycleDataGapUnion, findingGapStatement } from "@/domain/owner-trust";
import type { OwnerFinding } from "@/domain/owner-spine/contracts";
import { blocksFirstRead, computeOnboardingState } from "@/domain/owner-mode/owner-onboarding";

describe("C: verification direction (classification unchanged, wording explicit)", () => {
  const base = { targetValue: null, disputed: false };
  it("C1 50 -> 20, higher is better = no improvement", () => {
    expect(verifyOutcome({ ...base, baselineValue: 50, afterValue: 20, direction: "up" }).status).toBe("verified_not_improved");
  });
  it("C2 20 -> 50, higher is better = improved", () => {
    expect(verifyOutcome({ ...base, baselineValue: 20, afterValue: 50, direction: "up" }).status).toBe("verified_improved");
  });
  it("C3 lower is better: 50 -> 20 improved, 20 -> 50 not improved", () => {
    expect(verifyOutcome({ ...base, baselineValue: 50, afterValue: 20, direction: "down" }).status).toBe("verified_improved");
    expect(verifyOutcome({ ...base, baselineValue: 20, afterValue: 50, direction: "down" }).status).toBe("verified_not_improved");
  });
  it("renders the goal in words, never a bare up/down that reads as movement", () => {
    expect(verificationGoalText("up")).toBe("Goal: higher is better");
    expect(verificationGoalText("down")).toBe("Goal: lower is better");
    const { container } = render(
      <VerificationEvidenceText verification={{ beforeValue: 50, afterValue: 20, targetDirection: "up", baselineSource: "MEASURED" }} />
    );
    expect(container.textContent).toContain("before 50 → after 20");
    expect(container.textContent).toContain("Goal: higher is better");
    expect(container.textContent).not.toMatch(/\((up|down)\)/);
  });
});

describe("D: finding-scoped gaps vs diagnosis-cycle gaps", () => {
  const cards = (gaps: string[][]) => gaps.map((g) => ({ dataGaps: g }));
  const f: OwnerFinding = {
    domain: "finance", code: "FIN_X", title: "t", summary: "s", sourceMetric: "netMarginPct", sourceValue: 5, threshold: 10,
    severity: "high", confidence: 0.8, impactScore: 50, urgencyScore: 50, findingType: "risk", evidence: [], missingData: [],
  };
  it("T1 complete findings stay finding-complete while the cycle union surfaces the diagnosis gaps", () => {
    expect(buildExplanation(f, null).dataGaps).toEqual([]);
    const c = cards([[], [], ["receivables", "payables"]]);
    expect(cycleDataGapUnion(c)).toEqual(["receivables", "payables"]);
    expect(findingGapStatement([])).toBe("No missing inputs for this finding.");
    expect(findingGapStatement([])).not.toContain("No data gaps");
  });
  it("T2 complete cycle -> empty union, no warning", () => {
    expect(cycleDataGapUnion(cards([[], []]))).toEqual([]);
  });
  it("T3 finding-specific missing input is stated on the card and in the union", () => {
    const card = buildExplanation({ ...f, missingData: ["cashOnHand"] }, null);
    expect(card.dataGaps).toEqual(["cashOnHand"]);
    expect(findingGapStatement(card.dataGaps)).toBe("Missing inputs for this finding: cashOnHand.");
    expect(cycleDataGapUnion([card, { dataGaps: [] }])).toContain("cashOnHand");
  });
});

describe("A: minimum setup vs. all evidence", () => {
  it("A1 first read is available while an optional-for-that-read category is still missing", () => {
    const s = computeOnboardingState({
      profileType: "laundry_local_service",
      ownerRole: "owner_operated",
      businessName: "B",
      suppliedCategories: ["revenue_sales", "expenses", "cash_debt", "fixed_costs"],
    });
    expect(s.canRunFirstDiagnosis).toBe(true);
    const equipment = s.missingMinimum.find((m) => m.category === "equipment_logs");
    expect(equipment).toBeDefined();
    expect(s.minimumComplete).toBe(false);
    expect(blocksFirstRead(equipment!.category)).toBe(false);
  });
  it("A2 categories that gate the first read still block", () => {
    for (const c of ["revenue_sales", "expenses", "cash_debt"] as const) expect(blocksFirstRead(c)).toBe(true);
    expect(blocksFirstRead("equipment_logs")).toBe(false);
  });
});

describe("B: Health/Risk labelling on the Finance position header", () => {
  it("B1 labels say what the scores are and that the status badge is set separately", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/app/(authenticated)/owner/finance/page.tsx", "utf8");
    expect(src).toContain('"Risk score (lower is better)"');
    expect(src).toContain('"Health score"');
    expect(src).toContain("a low risk score does not mean the status is safe");
    expect(src).not.toMatch(/\["Risk", score/);
  });
});
