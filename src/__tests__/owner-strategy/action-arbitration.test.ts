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
  J_DONT_PAYBACK: { investmentRequired: 150000, cashAvailable: 400000, expectedRevenueChange: 2000, costChange: 0 },
  J_GWC_LONG: { investmentRequired: 150000, cashAvailable: 400000, expectedRevenueChange: 5000, costChange: 0 },
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
  I_GWC_DOWNSIDE: { code: "GO_WITH_CONDITIONS", titles: ["Cap the downside before committing", "Run a small pilot first"] },
  J_DONT_PAYBACK: { code: "DONT_AS_PLANNED", titles: ["Change the plan, re-scope it, or drop it"] },
  J_GWC_LONG: { code: "GO_WITH_CONDITIONS", titles: ["Shorten or stage the payback"] },
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
      // Exactly one primary: first, strictly highest priority (computed, never pinned to 100),
      // the recommended next action and the decision's step.
      expect(p.recommendedNextAction).toBe(p.actions[0]);
      expect(p.actions[0].priorityScore).toBeLessThanOrEqual(100); // Spine-computed (critical blockers can reach the clamp)
      expect(p.actions[0].title).toBe(p.decision.primaryStep.title);
      expect(p.actions[0].description).toBe(p.decision.primaryStep.description);
      for (const a of p.actions.slice(1)) expect(a.priorityScore).toBeLessThan(p.actions[0].priorityScore);
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
      data: "resolved", // a stale data step: nothing is missing any more
      rescope: "on_hold",
    });
    // Engaged work may be finished; a proposal should just be cancelled.
    expect(a.find((r) => r.id === "pursue")!.decisionFitNote).toBe("Not part of the current decision (not yet) — cancel it, or carry on and finish it since you've taken it on.");
    expect(a.find((r) => r.id === "proceed-legacy")!.decisionFitNote).toBe("Not part of the current decision (not yet) — cancel it.");
    expect(a.find((r) => r.id === "data")!.decisionFitNote).toBe("The latest evaluation no longer flags this — cancel it.");
    expect(coherentStrategyActionRows(rows, notYet).map((r) => r.id)).toEqual(["funding"]);
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

describe("audit fixes — arbitration", () => {
  const need = deriveStrategyDecision(scenario({ investmentRequired: 150000, cashAvailable: 400000, costChange: 12000 }), { now: NOW });

  it("a generic data step for the same finding as the primary is covered by it (superseded)", () => {
    const rows = [
      { id: "p", findingCode: "STR_MISSING_CRITICAL_DATA", recommendationCode: "STRREC_PROVIDE_REVENUE_CHANGE", status: "proposed" },
      { id: "g", findingCode: "STR_MISSING_CRITICAL_DATA", recommendationCode: "STRREC_IMPROVE_DATA_QUALITY", status: "assigned" },
    ];
    expect(arbitrateStrategyActionRows(rows, need).map((r) => r.decisionFit)).toEqual(["primary", "superseded"]);
  });

  it("each missing input has its own step code, so a carried step is never re-worded into a request for another input", () => {
    const codes = new Set(
      [
        { expectedRevenueChange: undefined, costChange: 1 },
        { expectedRevenueChange: 1, costChange: undefined },
        { expectedRevenueChange: 60000, costChange: 1, investmentRequired: undefined },
        { expectedRevenueChange: 60000, costChange: 1, investmentRequired: -1 },
        { expectedRevenueChange: 60000, costChange: 1, investmentRequired: 5, cashAvailable: undefined },
        { expectedRevenueChange: 60000, costChange: 1, investmentRequired: 5, cashAvailable: -1 },
      ].map((o) => `${deriveStrategyDecision(scenario(o), { now: NOW }).primaryStep.findingCode}::${deriveStrategyDecision(scenario(o), { now: NOW }).primaryStep.recommendationCode}`)
    );
    expect(codes.size).toBe(6);
  });

  it("the same advice as the primary step (another finding) is superseded, not 'on hold'", () => {
    const dont = deriveStrategyDecision(scenario(CASES.C_DONT), { now: NOW });
    expect(strategyActionFit({ findingCode: "STR_NEGATIVE_ROI", recommendationCode: "STRREC_DROP_OR_RESCOPE" }, dont)).toBe("superseded");
  });

  it("the primary step's priority is not pinned: a GO step ranks by its own impact, not above every other domain", () => {
    const p = plan(CASES.A_GO);
    expect(p.actions[0].priorityScore).toBeLessThan(80);
  });
});

describe("round-2 audit fixes — arbitration", () => {
  it("a step whose problem is gone is 'resolved', never a supporting step on Home (stale 'enter the missing inputs' under GO)", () => {
    const go = deriveStrategyDecision(scenario(CASES.A_GO), { now: NOW });
    const rows = [{ id: "stale", findingCode: "STR_MISSING_CRITICAL_DATA", recommendationCode: "STRREC_IMPROVE_DATA_QUALITY", status: "assigned" }];
    expect(arbitrateStrategyActionRows(rows, go)[0].decisionFit).toBe("resolved");
    expect(coherentStrategyActionRows(rows, go)).toEqual([]);
  });
  it("a condition step stays supporting only while its condition applies", () => {
    const i = deriveStrategyDecision(scenario(CASES.I_GWC_DOWNSIDE), { now: NOW }); // downside loss + high risk
    const rows = [
      { id: "derisk", findingCode: "STR_HIGH_EXECUTION_RISK", recommendationCode: "STRREC_DE_RISK", status: "proposed" },
      { id: "reserve", findingCode: "STR_LOW_CASH_RESERVE", recommendationCode: "STRREC_KEEP_RESERVE", status: "proposed" },
    ];
    expect(arbitrateStrategyActionRows(rows, i).map((r) => r.decisionFit)).toEqual(["supporting", "resolved"]);
  });
  it("every planned supporting step addresses a reason the decision raises (grid)", () => {
    for (const rev of [undefined, -20000, 0, 5000, 30000, 60000])
      for (const cost of [undefined, 0, 12000, 30000])
        for (const inv of [undefined, 0, 150000])
          for (const cash of [undefined, 0, 100000, 150000, 400000])
            for (const risk of [undefined, "low", "medium", "high"] as const) {
              const p = plan({ expectedRevenueChange: rev, costChange: cost, investmentRequired: inv, cashAvailable: cash, riskLevel: risk });
              const fits = arbitrateStrategyActionRows(
                p.actions.slice(1).map((a) => ({ findingCode: a.findingCode, recommendationCode: STRATEGY_REC_TEMPLATES[a.findingCode]?.recommendationCode, status: "proposed" })),
                p.decision
              );
              for (const f of fits) expect(f.decisionFit).toBe("supporting");
            }
  });
});
