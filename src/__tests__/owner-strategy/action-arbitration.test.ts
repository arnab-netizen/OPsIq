/**
 * Owner Strategy — verdict/action arbitration (Decision Overhaul, root cause 3).
 *
 * Pure/no DB. The planned actions agree with the decision: exactly one primary step (first,
 * priority 100, equal to the decision's primary step), no Pursue / Size up ever, "go ahead" only
 * under GO, and only the supporting steps the decision allows. Persisted rows from earlier
 * cycles (case N) are arbitrated the same way: a carried "Pursue" is on hold when the decision
 * forbids it, superseded under GO.
 */
import { describe, it, expect } from "vitest";
import {
  diagnoseStrategySnapshot,
  planStrategyActionsFromDiagnosis,
  deriveStrategyDecision,
  arbitrateStrategyActionRows,
  coherentStrategyActionRows,
  withoutRetiredStrategyActions,
  strategyActionFit,
  STRATEGY_REC_TEMPLATES,
  type StrategySnapshotInput,
} from "@/domain/owner-strategy";

const NOW = new Date("2026-09-26T00:00:00Z");

function scenario(over: Partial<StrategySnapshotInput>): StrategySnapshotInput {
  return {
    periodStart: "2026-09-01",
    periodEnd: "2026-09-30",
    currency: "INR",
    currentRevenue: 500000,
    timeToImpactMonths: 2,
    capacityImpactPct: 10,
    staffImpact: 1,
    riskLevel: "low",
    ...over,
  };
}

const plan = (over: Partial<StrategySnapshotInput>) =>
  planStrategyActionsFromDiagnosis(diagnoseStrategySnapshot(scenario(over), { now: NOW }));

const CASES: Record<string, Partial<StrategySnapshotInput>> = {
  A_GO: { investmentRequired: 150000, cashAvailable: 400000, expectedRevenueChange: 60000, costChange: 12000 },
  B_NOT_YET: { investmentRequired: 150000, cashAvailable: 100000, expectedRevenueChange: 30000, costChange: 12000, riskLevel: "medium" },
  C_DONT: { investmentRequired: 50000, cashAvailable: 400000, expectedRevenueChange: 10000, costChange: 15000 },
  D_DONT_UNAFFORDABLE: { investmentRequired: 150000, cashAvailable: 100000, expectedRevenueChange: 10000, costChange: 15000, riskLevel: "high" },
  E_NEED_INFO: { investmentRequired: 150000, cashAvailable: 400000, costChange: 12000 },
  F_NEED_INFO_CASH: { investmentRequired: 150000, expectedRevenueChange: 30000, costChange: 12000, riskLevel: undefined },
  G_NOT_YET_ZERO_CASH: { investmentRequired: 150000, cashAvailable: 0, expectedRevenueChange: 30000, costChange: 12000 },
  H_GWC_RISK: { investmentRequired: 150000, cashAvailable: 400000, expectedRevenueChange: 60000, costChange: 12000, riskLevel: undefined },
  I_GWC_DOWNSIDE: { investmentRequired: 50000, cashAvailable: 400000, expectedRevenueChange: 30000, costChange: 20000, riskLevel: "high" },
  J_GWC_WEAK: { investmentRequired: 150000, cashAvailable: 400000, expectedRevenueChange: 2000, costChange: 0 },
  K_ZERO_INVESTMENT: { investmentRequired: 0, expectedRevenueChange: 20000, costChange: 5000 },
  L_ZERO_PROFIT: { investmentRequired: 50000, cashAvailable: 400000, expectedRevenueChange: 12000, costChange: 12000 },
  M_NO_RESERVE: { investmentRequired: 150000, cashAvailable: 150000, expectedRevenueChange: 60000, costChange: 12000 },
};

const EXPECTED: Record<string, { code: string; titles: string[] }> = {
  A_GO: { code: "GO", titles: ["Go ahead and track the result"] },
  B_NOT_YET: { code: "NOT_YET", titles: ["Close the ₹50,000 funding gap"] },
  C_DONT: { code: "DONT_AS_PLANNED", titles: ["Change the plan, re-scope it, or drop it"] },
  D_DONT_UNAFFORDABLE: { code: "DONT_AS_PLANNED", titles: ["Change the plan, re-scope it, or drop it"] },
  E_NEED_INFO: { code: "NEED_INFO", titles: ["Enter the expected revenue change per month"] },
  F_NEED_INFO_CASH: { code: "NEED_INFO", titles: ["Enter the cash you can put into this", "Choose an execution risk level"] },
  G_NOT_YET_ZERO_CASH: { code: "NOT_YET", titles: ["Close the ₹1,50,000 funding gap"] },
  H_GWC_RISK: { code: "GO_WITH_CONDITIONS", titles: ["Choose an execution risk level"] },
  I_GWC_DOWNSIDE: { code: "GO_WITH_CONDITIONS", titles: ["Cap the downside before committing", "De-risk execution with a pilot"] },
  J_GWC_WEAK: { code: "GO_WITH_CONDITIONS", titles: ["Shorten or stage the payback", "Compare a higher-ROI use of the cash"] },
  K_ZERO_INVESTMENT: { code: "GO", titles: ["Go ahead and track the result"] },
  L_ZERO_PROFIT: { code: "DONT_AS_PLANNED", titles: ["Change the plan, re-scope it, or drop it"] },
  M_NO_RESERVE: { code: "GO_WITH_CONDITIONS", titles: ["Keep a cash reserve"] },
};

const FORBIDDEN_TITLE = /pursue|size up|proceed|low-regret/i;

describe("planned actions per decision (scenario matrix A–M)", () => {
  for (const [name, over] of Object.entries(CASES)) {
    it(`${name}: one primary step, allowed supporting steps only, no Pursue/Size up`, () => {
      const p = plan(over);
      const exp = EXPECTED[name];
      expect(p.decision.code).toBe(exp.code);
      expect(p.actions.map((a) => a.title)).toEqual(exp.titles);
      // Exactly one primary: first, priority 100, is the recommended next action and the decision's step.
      expect(p.recommendedNextAction).toBe(p.actions[0]);
      expect(p.actions[0].priorityScore).toBe(100);
      expect(p.actions[0].title).toBe(p.decision.primaryStep.title);
      expect(p.actions[0].description).toBe(p.decision.primaryStep.description);
      for (const a of p.actions.slice(1)) expect(a.priorityScore).toBeLessThanOrEqual(99);
      for (const a of p.actions) expect(a.title).not.toMatch(FORBIDDEN_TITLE);
      if (exp.code !== "GO") for (const a of p.actions) expect(a.title).not.toMatch(/^Go ahead/);
      expect(new Set(p.actions.map((a) => a.title)).size).toBe(p.actions.length);
      expect(p.missingActionInputs).toEqual([]);
    });
  }

  it("no recommendation template maps to a retired Pursue/Size up code", () => {
    const codes = Object.values(STRATEGY_REC_TEMPLATES).map((t) => t.recommendationCode);
    expect(codes).not.toContain("STRREC_PURSUE");
    expect(codes).not.toContain("STRREC_SCALE");
    for (const k of Object.keys(STRATEGY_REC_TEMPLATES)) expect(k.startsWith("STR_OPP_")).toBe(false);
  });

  it("positive findings stay as findings (reasons), never as actions", () => {
    const p = plan(CASES.A_GO);
    const diag = diagnoseStrategySnapshot(scenario(CASES.A_GO), { now: NOW });
    expect(diag.opportunityFindings.map((f) => f.code)).toEqual(
      expect.arrayContaining(["STR_OPP_STRONG_RETURN", "STR_OPP_FAST_PAYBACK", "STR_OPP_SAFE_UPSIDE"])
    );
    for (const f of diag.opportunityFindings) expect(`${f.title} ${f.summary}`).not.toMatch(/pursue|size(d)? up|commit/i);
    expect(p.actions.every((a) => !a.findingCode.startsWith("STR_OPP_"))).toBe(true);
  });
});

describe("N — persisted rows from an earlier cycle are arbitrated against the current decision", () => {
  const notYet = deriveStrategyDecision(scenario(CASES.B_NOT_YET), { now: NOW });
  const go = deriveStrategyDecision(scenario(CASES.A_GO), { now: NOW });
  const rows = [
    { id: "pursue", findingCode: "STR_OPP_STRONG_RETURN", recommendationCode: "STRREC_PURSUE", status: "assigned" },
    { id: "proceed-legacy", findingCode: "STR_OPP_FAST_PAYBACK", recommendationCode: "STRREC_PURSUE", status: "proposed" },
    { id: "scale", findingCode: "STR_OPP_SAFE_UPSIDE", recommendationCode: "STRREC_SCALE", status: "in_progress" },
    { id: "funding", findingCode: "STR_UNAFFORDABLE", recommendationCode: "STRREC_SECURE_FUNDING", status: "proposed" },
    { id: "data", findingCode: "STR_OPP_DATA_QUALITY", recommendationCode: "STRREC_IMPROVE_DATA_QUALITY", status: "proposed" },
    { id: "rescope", findingCode: "STR_NEGATIVE_BASE_CASE", recommendationCode: "STRREC_DROP_OR_RESCOPE", status: "blocked" },
  ];

  it("under NOT_YET: carried Pursue/Proceed/Size up are on hold; the funding step is the one primary", () => {
    const a = arbitrateStrategyActionRows(rows, notYet);
    expect(Object.fromEntries(a.map((r) => [r.id, r.decisionFit]))).toEqual({
      pursue: "on_hold",
      "proceed-legacy": "on_hold",
      scale: "on_hold",
      funding: "primary",
      data: "supporting",
      rescope: "on_hold",
    });
    expect(a.find((r) => r.id === "pursue")!.decisionFitNote).toBe("On hold — doesn't fit the current decision (Not yet).");
    expect(coherentStrategyActionRows(rows, notYet).map((r) => r.id)).toEqual(["funding", "data"]);
  });

  it("under GO: the proceed step is primary; legacy Pursue/Size up are superseded (deduplicated), never a second go-ahead", () => {
    const withProceed = [...rows, { id: "go", findingCode: "STR_DECISION_GO", recommendationCode: "STRREC_PROCEED", status: "proposed" }];
    const a = arbitrateStrategyActionRows(withProceed, go);
    const fit = Object.fromEntries(a.map((r) => [r.id, r.decisionFit]));
    expect(fit).toMatchObject({ pursue: "superseded", "proceed-legacy": "superseded", scale: "superseded", go: "primary", funding: "on_hold", rescope: "on_hold" });
    expect(a.filter((r) => r.decisionFit === "primary")).toHaveLength(1);
  });

  it("exactly one primary: engaged work wins over a fresh duplicate; terminal rows never take the slot", () => {
    const dupes = [
      { id: "new", findingCode: "STR_UNAFFORDABLE", recommendationCode: "STRREC_SECURE_FUNDING", status: "proposed" },
      { id: "done", findingCode: "STR_UNAFFORDABLE", recommendationCode: "STRREC_SECURE_FUNDING", status: "completed" },
      { id: "engaged", findingCode: "STR_UNAFFORDABLE", recommendationCode: "STRREC_SECURE_FUNDING", status: "in_progress" },
    ];
    const a = arbitrateStrategyActionRows(dupes, notYet);
    expect(a.map((r) => r.decisionFit)).toEqual(["superseded", "closed", "primary"]);
    expect(a.find((r) => r.id === "done")!.decisionFitNote).toBeNull();
  });

  it("supporting steps are deduplicated by recommendation code", () => {
    const d = [
      { id: "a", findingCode: "STR_MISSING_RISK_LEVEL", recommendationCode: "STRREC_SET_RISK_LEVEL", status: "proposed" },
      { id: "b", findingCode: "STR_MISSING_RISK_LEVEL", recommendationCode: "STRREC_SET_RISK_LEVEL", status: "proposed" },
    ];
    const need = deriveStrategyDecision(scenario(CASES.F_NEED_INFO_CASH), { now: NOW });
    expect(arbitrateStrategyActionRows(d, need).map((r) => r.decisionFit)).toEqual(["supporting", "superseded"]);
  });

  it("an unknown/legacy code is on hold, never promoted", () => {
    expect(strategyActionFit({ findingCode: "X", recommendationCode: "STRREC_SOMETHING_OLD" }, go)).toBe("on_hold");
    expect(strategyActionFit({ findingCode: "X", recommendationCode: null }, go)).toBe("on_hold");
  });

  it("without a decision, retired go-ahead commands are still filtered", () => {
    expect(withoutRetiredStrategyActions(rows).map((r) => r.id)).toEqual(["funding", "data", "rescope"]);
  });
});
