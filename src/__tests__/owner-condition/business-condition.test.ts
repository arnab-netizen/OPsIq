/**
 * Owner Command Center (Module 2 Slice 8) — Business Condition rollup (no DB).
 * Proves the pure finance→spine mappers, the cross-domain profile assembly +
 * single prioritized next action, and the route's canonical enforcement wiring.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  financeCycleToDomainScore,
  financeActionRowToOwnerAction,
  recoveryCycleToDomainScore,
  recoveryActionRowToOwnerAction,
  cashflowCycleToDomainScore,
  cashflowActionRowToOwnerAction,
  salesCycleToDomainScore,
  salesActionRowToOwnerAction,
  operationsCycleToDomainScore,
  operationsActionRowToOwnerAction,
  sopCycleToDomainScore,
  sopActionRowToOwnerAction,
  marketingCycleToDomainScore,
  marketingActionRowToOwnerAction,
  strategyCycleToDomainScore,
  strategyActionRowToOwnerAction,
} from "@/services/owner-condition/business-condition.service";
import {
  buildBusinessConditionProfile,
  rankOwnerActions,
  ownerActionSchema,
  domainScoreSchema,
} from "@/domain/owner-spine/contracts";

const NOW = new Date("2026-06-12T00:00:00.000Z");

function cycleRow(over: Record<string, unknown> = {}) {
  return {
    overallHealthScore: 40,
    survivalRiskScore: 80,
    growthOpportunityScore: 30,
    dataConfidenceScore: 65,
    generatedAt: NOW,
    findings: [{ code: "FIN_NEGATIVE_NET_MARGIN" }, { code: "FIN_LOW_RUNWAY" }],
    actions: [{ findingCode: "FIN_NEGATIVE_NET_MARGIN" }],
    ...over,
  };
}

function actionRow(over: Record<string, unknown> = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    findingCode: "FIN_NEGATIVE_NET_MARGIN",
    title: "Return to net profit",
    description: "Cut costs or raise revenue.",
    ownerRole: "owner",
    priorityScore: 88,
    effortScore: 70,
    expectedImpactScore: 90,
    confidence: 0.7,
    status: "proposed",
    verificationMetric: "netMarginPct",
    verificationMethod: "before/after",
    expectedTimeframeDays: 30,
    ...over,
  };
}

describe("Owner condition — finance→spine mappers", () => {
  it("maps a finance cycle row to a valid DomainScore (clamped)", () => {
    const ds = financeCycleToDomainScore(cycleRow({ overallHealthScore: 140, survivalRiskScore: -5 }));
    expect(ds.domain).toBe("finance");
    expect(ds.healthScore).toBe(100); // clamped
    expect(ds.riskScore).toBe(0); // clamped
    expect(ds.dataConfidenceScore).toBe(65);
    expect(ds.topFindingCodes).toContain("FIN_NEGATIVE_NET_MARGIN");
    expect(domainScoreSchema.safeParse(ds).success).toBe(true);
  });

  it("maps a finance action row to a schema-valid OwnerAction", () => {
    const a = financeActionRowToOwnerAction(actionRow());
    expect(a.domain).toBe("finance");
    expect(ownerActionSchema.safeParse(a).success).toBe(true);
  });
});

describe("Owner condition — Business Condition Profile assembly", () => {
  it("rolls a finance domain into a profile and selects the top action", () => {
    const domainScores = [financeCycleToDomainScore(cycleRow())];
    const topActions = [
      financeActionRowToOwnerAction(actionRow({ id: "a-low", findingCode: "FIN_OPP_DATA_QUALITY", title: "low", priorityScore: 20 })),
      financeActionRowToOwnerAction(actionRow({ id: "a-high", title: "high", priorityScore: 88 })),
    ];
    const profile = buildBusinessConditionProfile({
      businessId: "biz1", workspaceId: "ws1", domainScores, topActions, missingCriticalData: ["revenue"], now: NOW,
    });
    expect(profile.domainScores.map((d) => d.domain)).toEqual(["finance"]);
    expect(profile.survivalRiskScore).toBe(80); // finance is a survival domain
    // The profile no longer elects a next action (the ONE overall election is resolveOwnerDecision);
    // the mapped actions keep their stored-priority order.
    expect(profile).not.toHaveProperty("recommendedNextAction");
    expect(rankOwnerActions(topActions)[0].id).toBe("a-high"); // highest priority
    expect(profile.missingCriticalData).toEqual(["revenue"]); // carried, not invented
    expect(profile.generatedAt).toBe(NOW);
  });
});

describe("Owner condition — recovery→spine mappers (Module-1-safe, read-only)", () => {
  const recCycle = {
    healthScore: 60,
    healthStatus: "at_risk",
    createdAt: NOW,
    findings: [{ code: "WEAK_REPEAT_RATE" }],
    actions: [{ finding: { code: "WEAK_REPEAT_RATE" }, metricToMove: "repeatCustomerRatePct" }],
  };
  const recSnapshot = { revenue: 100000, totalCosts: 95000, orderCount: 1000 };
  const recAction = {
    id: "22222222-2222-4222-8222-222222222222",
    finding: { code: "WEAK_REPEAT_RATE" },
    title: "Reactivate dormant customers",
    description: "Run a win-back campaign.",
    assignedToRole: "owner",
    priority: "high",
    effort: "medium",
    confidence: 0.7,
    status: "proposed",
    metricToMove: "repeatCustomerRatePct",
    verificationWindowDays: 14,
  };

  it("maps a recovery cycle (+snapshot) to a valid DomainScore from real fields", () => {
    const ds = recoveryCycleToDomainScore(recCycle, recSnapshot);
    expect(ds.domain).toBe("recovery");
    expect(ds.healthScore).toBe(60); // real recovery health
    expect(ds.riskScore).toBe(55); // at_risk mapping
    expect(ds.opportunityScore).toBe(0); // recovery does not score opportunity
    expect(ds.dataConfidenceScore).toBe(100); // all 3 critical metrics present
    expect(domainScoreSchema.safeParse(ds).success).toBe(true);
  });

  it("lowers recovery data confidence when critical metrics are missing", () => {
    const ds = recoveryCycleToDomainScore(recCycle, { revenue: 100000 }); // missing totalCosts + orderCount
    expect(ds.dataConfidenceScore).toBe(40); // 100 - 2*30
  });

  it("maps a recovery action to a schema-valid OwnerAction", () => {
    const a = recoveryActionRowToOwnerAction(recAction);
    expect(a.domain).toBe("recovery");
    expect(a.priorityScore).toBe(70); // high
    expect(a.findingCode).toBe("WEAK_REPEAT_RATE");
    expect(ownerActionSchema.safeParse(a).success).toBe(true);
  });

  it("a critical recovery action can outrank a finance action (cross-domain next action)", () => {
    const domainScores = [
      financeCycleToDomainScore(cycleRow()),
      recoveryCycleToDomainScore(recCycle, recSnapshot),
    ];
    const topActions = [
      financeActionRowToOwnerAction(actionRow({ id: "fin", priorityScore: 80 })),
      recoveryActionRowToOwnerAction({ ...recAction, id: "rec-critical", priority: "critical" }), // 90
    ];
    const profile = buildBusinessConditionProfile({ businessId: "b", workspaceId: "w", domainScores, topActions, now: NOW });
    expect(profile.domainScores.map((d) => d.domain).sort()).toEqual(["finance", "recovery"]);
    // The profile no longer elects a next action (the ONE overall election is resolveOwnerDecision);
    // the mapped actions keep their stored-priority order.
    expect(profile).not.toHaveProperty("recommendedNextAction");
    expect(rankOwnerActions(topActions)[0].domain).toBe("recovery"); // critical (90) > finance (80)
  });
});

describe("Owner condition — cashflow→spine mappers", () => {
  const cfCycle = {
    healthScore: 35,
    dangerScore: 78,
    opportunityScore: 40,
    dataConfidenceScore: 70,
    cashflowState: "CRITICAL",
    generatedAt: NOW,
    findings: [{ code: "CF_URGENT_PAYMENT_RISK" }, { code: "CF_HIGH_OVERDUE_RECEIVABLES" }],
    actions: [{ findingCode: "CF_URGENT_PAYMENT_RISK" }],
  };
  const cfAction = {
    id: "33333333-3333-4333-8333-333333333333",
    findingCode: "CF_URGENT_PAYMENT_RISK",
    title: "Sequence and fund near-term dues",
    description: "Rank and fund essential dues first.",
    ownerRole: "owner",
    priorityScore: 92,
    effortScore: 45,
    expectedImpactScore: 95,
    confidence: 0.7,
    status: "proposed",
    verificationMetric: "urgentPaymentRiskPct",
    verificationMethod: "before/after",
    expectedTimeframeDays: 7,
  };

  it("maps a cashflow cycle row to a valid DomainScore (clamped, danger→risk)", () => {
    const ds = cashflowCycleToDomainScore({ ...cfCycle, healthScore: 140, dangerScore: -5 });
    expect(ds.domain).toBe("cashflow");
    expect(ds.healthScore).toBe(100); // clamped
    expect(ds.riskScore).toBe(0); // danger clamped
    expect(ds.dataConfidenceScore).toBe(70);
    expect(ds.topFindingCodes).toContain("CF_URGENT_PAYMENT_RISK");
    expect(domainScoreSchema.safeParse(ds).success).toBe(true);
  });

  it("maps a cashflow action row to a schema-valid OwnerAction", () => {
    const a = cashflowActionRowToOwnerAction(cfAction);
    expect(a.domain).toBe("cashflow");
    expect(ownerActionSchema.safeParse(a).success).toBe(true);
  });

  it("a critical cashflow action can be the cross-domain next action over finance + recovery", () => {
    const domainScores = [
      financeCycleToDomainScore(cycleRow()),
      cashflowCycleToDomainScore(cfCycle),
    ];
    const topActions = [
      financeActionRowToOwnerAction(actionRow({ id: "fin", priorityScore: 80 })),
      cashflowActionRowToOwnerAction(cfAction), // 92
    ];
    const profile = buildBusinessConditionProfile({ businessId: "b", workspaceId: "w", domainScores, topActions, now: NOW });
    expect(profile.domainScores.map((d) => d.domain).sort()).toEqual(["cashflow", "finance"]);
    expect(profile.survivalRiskScore).toBe(80); // max survival-domain risk (finance 80 vs cashflow 78)
    // The profile no longer elects a next action (the ONE overall election is resolveOwnerDecision);
    // the mapped actions keep their stored-priority order.
    expect(profile).not.toHaveProperty("recommendedNextAction");
    expect(rankOwnerActions(topActions)[0].domain).toBe("cashflow"); // 92 > 80
  });
});

describe("Owner condition — sales→spine mappers (growth domain)", () => {
  const salesCycle = {
    healthScore: 45,
    riskScore: 70,
    opportunityScore: 55,
    dataConfidenceScore: 80,
    salesState: "WEAK",
    generatedAt: NOW,
    findings: [{ code: "SALES_LOW_CONVERSION" }, { code: "SALES_WEAK_REPEAT" }],
    actions: [{ findingCode: "SALES_LOW_CONVERSION" }],
  };
  const salesAction = {
    id: "44444444-4444-4444-8444-444444444444",
    findingCode: "SALES_LOW_CONVERSION",
    title: "Raise lead-to-sale conversion",
    description: "Tighten qualification + follow-up.",
    ownerRole: "owner",
    priorityScore: 78,
    effortScore: 50,
    expectedImpactScore: 85,
    confidence: 0.7,
    status: "proposed",
    verificationMetric: "leadToSaleConversionPct",
    verificationMethod: "before/after",
    expectedTimeframeDays: 30,
  };

  it("maps a sales cycle row to a valid DomainScore (clamped)", () => {
    const ds = salesCycleToDomainScore({ ...salesCycle, healthScore: 140, riskScore: -5 });
    expect(ds.domain).toBe("sales");
    expect(ds.healthScore).toBe(100); // clamped
    expect(ds.riskScore).toBe(0); // clamped
    expect(ds.dataConfidenceScore).toBe(80);
    expect(ds.topFindingCodes).toContain("SALES_LOW_CONVERSION");
    expect(domainScoreSchema.safeParse(ds).success).toBe(true);
  });

  it("maps a sales action row to a schema-valid OwnerAction", () => {
    const a = salesActionRowToOwnerAction(salesAction);
    expect(a.domain).toBe("sales");
    expect(ownerActionSchema.safeParse(a).success).toBe(true);
  });

  it("sales is a growth domain: its risk does NOT raise survivalRiskScore", () => {
    // finance (survival) risk 80 dominates survival; sales (growth) risk 70 must not.
    const domainScores = [financeCycleToDomainScore(cycleRow()), salesCycleToDomainScore(salesCycle)];
    const topActions = [
      financeActionRowToOwnerAction(actionRow({ id: "fin", priorityScore: 60 })),
      salesActionRowToOwnerAction(salesAction), // 78
    ];
    const profile = buildBusinessConditionProfile({ businessId: "b", workspaceId: "w", domainScores, topActions, now: NOW });
    expect(profile.domainScores.map((d) => d.domain).sort()).toEqual(["finance", "sales"]);
    expect(profile.survivalRiskScore).toBe(80); // only the survival domain (finance) drives this, not sales 70
    // The profile no longer elects a next action (the ONE overall election is resolveOwnerDecision);
    // the mapped actions keep their stored-priority order.
    expect(profile).not.toHaveProperty("recommendedNextAction");
    expect(rankOwnerActions(topActions)[0].domain).toBe("sales"); // 78 > 60 across domains
  });
});

describe("Owner condition — operations→spine mappers (execution domain)", () => {
  const opsCycle = {
    healthScore: 38,
    riskScore: 72,
    opportunityScore: 30,
    dataConfidenceScore: 75,
    operationsState: "BOTTLENECKED",
    generatedAt: NOW,
    findings: [{ code: "OPS_LOW_COMPLETION_RATE" }, { code: "OPS_HIGH_DELAY_RATE" }],
    actions: [{ findingCode: "OPS_LOW_COMPLETION_RATE" }],
  };
  const opsAction = {
    id: "55555555-5555-4555-8555-555555555555",
    findingCode: "OPS_LOW_COMPLETION_RATE",
    title: "Clear the throughput bottleneck",
    description: "Rebalance capacity to lift completion rate.",
    ownerRole: "owner",
    priorityScore: 82,
    effortScore: 55,
    expectedImpactScore: 88,
    confidence: 0.7,
    status: "proposed",
    verificationMetric: "completionRatePct",
    verificationMethod: "before/after",
    expectedTimeframeDays: 21,
  };

  it("maps an operations cycle row to a valid DomainScore (clamped)", () => {
    const ds = operationsCycleToDomainScore({ ...opsCycle, healthScore: 140, riskScore: -5 });
    expect(ds.domain).toBe("operations");
    expect(ds.healthScore).toBe(100); // clamped
    expect(ds.riskScore).toBe(0); // clamped
    expect(ds.dataConfidenceScore).toBe(75);
    expect(ds.topFindingCodes).toContain("OPS_LOW_COMPLETION_RATE");
    expect(domainScoreSchema.safeParse(ds).success).toBe(true);
  });

  it("maps an operations action row to a schema-valid OwnerAction", () => {
    const a = operationsActionRowToOwnerAction(opsAction);
    expect(a.domain).toBe("operations");
    expect(ownerActionSchema.safeParse(a).success).toBe(true);
  });

  it("operations is an execution domain: its risk drives executionRiskScore, not survivalRiskScore", () => {
    // finance (survival) risk 80 drives survival; operations (execution) risk 72 drives execution.
    const domainScores = [financeCycleToDomainScore(cycleRow()), operationsCycleToDomainScore(opsCycle)];
    const topActions = [
      financeActionRowToOwnerAction(actionRow({ id: "fin", priorityScore: 60 })),
      operationsActionRowToOwnerAction(opsAction), // 82
    ];
    const profile = buildBusinessConditionProfile({ businessId: "b", workspaceId: "w", domainScores, topActions, now: NOW });
    expect(profile.domainScores.map((d) => d.domain).sort()).toEqual(["finance", "operations"]);
    expect(profile.survivalRiskScore).toBe(80); // operations risk 72 must NOT raise survival
    expect(profile.executionRiskScore).toBe(72); // operations drives execution risk
    // The profile no longer elects a next action (the ONE overall election is resolveOwnerDecision);
    // the mapped actions keep their stored-priority order.
    expect(profile).not.toHaveProperty("recommendedNextAction");
    expect(rankOwnerActions(topActions)[0].domain).toBe("operations"); // 82 > 60 across domains
  });
});

describe("Owner condition — sop→spine mappers (execution domain)", () => {
  const sopCycle = {
    healthScore: 36,
    riskScore: 74,
    opportunityScore: 32,
    dataConfidenceScore: 78,
    executionState: "BREAKDOWN",
    generatedAt: NOW,
    findings: [{ code: "SOP_LOW_COMPLETION" }, { code: "SOP_HIGH_OVERDUE" }],
    actions: [{ findingCode: "SOP_LOW_COMPLETION" }],
  };
  const sopAction = {
    id: "66666666-6666-4666-8666-666666666666",
    findingCode: "SOP_LOW_COMPLETION",
    title: "Restore follow-through on assigned work",
    description: "Re-anchor open actions to one owner + due date.",
    ownerRole: "owner",
    priorityScore: 84,
    effortScore: 45,
    expectedImpactScore: 80,
    confidence: 0.7,
    status: "proposed",
    verificationMetric: "completionRatePct",
    verificationMethod: "before/after",
    expectedTimeframeDays: 21,
  };

  it("maps a sop cycle row to a valid DomainScore (clamped)", () => {
    const ds = sopCycleToDomainScore({ ...sopCycle, healthScore: 140, riskScore: -5 });
    expect(ds.domain).toBe("sop");
    expect(ds.healthScore).toBe(100); // clamped
    expect(ds.riskScore).toBe(0); // clamped
    expect(ds.dataConfidenceScore).toBe(78);
    expect(ds.topFindingCodes).toContain("SOP_LOW_COMPLETION");
    expect(domainScoreSchema.safeParse(ds).success).toBe(true);
  });

  it("maps a sop action row to a schema-valid OwnerAction", () => {
    const a = sopActionRowToOwnerAction(sopAction);
    expect(a.domain).toBe("sop");
    expect(ownerActionSchema.safeParse(a).success).toBe(true);
  });

  it("sop is an execution domain: its risk drives executionRiskScore, not survivalRiskScore", () => {
    // finance (survival) risk 80 drives survival; sop (execution) risk 74 drives execution.
    const domainScores = [financeCycleToDomainScore(cycleRow()), sopCycleToDomainScore(sopCycle)];
    const topActions = [
      financeActionRowToOwnerAction(actionRow({ id: "fin", priorityScore: 60 })),
      sopActionRowToOwnerAction(sopAction), // 84
    ];
    const profile = buildBusinessConditionProfile({ businessId: "b", workspaceId: "w", domainScores, topActions, now: NOW });
    expect(profile.domainScores.map((d) => d.domain).sort()).toEqual(["finance", "sop"]);
    expect(profile.survivalRiskScore).toBe(80); // sop risk 74 must NOT raise survival
    expect(profile.executionRiskScore).toBe(74); // sop drives execution risk
    // The profile no longer elects a next action (the ONE overall election is resolveOwnerDecision);
    // the mapped actions keep their stored-priority order.
    expect(profile).not.toHaveProperty("recommendedNextAction");
    expect(rankOwnerActions(topActions)[0].domain).toBe("sop"); // 84 > 60 across domains
  });
});

describe("Owner condition — marketing→spine mappers (growth domain)", () => {
  const mktCycle = {
    healthScore: 30,
    riskScore: 72,
    opportunityScore: 55,
    dataConfidenceScore: 82,
    marketingState: "WASTING",
    generatedAt: NOW,
    findings: [{ code: "MKT_WASTED_SPEND" }, { code: "MKT_POOR_CONVERSION" }],
    actions: [{ findingCode: "MKT_WASTED_SPEND" }],
  };
  const mktAction = {
    id: "77777777-7777-4777-8777-777777777777",
    findingCode: "MKT_WASTED_SPEND",
    title: "Stop the loss-making spend",
    description: "Pause the worst-ROI channel and reallocate.",
    ownerRole: "owner",
    priorityScore: 88,
    effortScore: 35,
    expectedImpactScore: 85,
    confidence: 0.7,
    status: "proposed",
    verificationMetric: "campaignRoiPct",
    verificationMethod: "before/after",
    expectedTimeframeDays: 14,
  };

  it("maps a marketing cycle row to a valid DomainScore (clamped)", () => {
    const ds = marketingCycleToDomainScore({ ...mktCycle, healthScore: 140, riskScore: -5 });
    expect(ds.domain).toBe("marketing");
    expect(ds.healthScore).toBe(100); // clamped
    expect(ds.riskScore).toBe(0); // clamped
    expect(ds.dataConfidenceScore).toBe(82);
    expect(ds.topFindingCodes).toContain("MKT_WASTED_SPEND");
    expect(domainScoreSchema.safeParse(ds).success).toBe(true);
  });

  it("maps a marketing action row to a schema-valid OwnerAction", () => {
    const a = marketingActionRowToOwnerAction(mktAction);
    expect(a.domain).toBe("marketing");
    expect(ownerActionSchema.safeParse(a).success).toBe(true);
  });

  it("marketing is a growth domain: its risk does NOT raise survivalRiskScore", () => {
    // finance (survival) risk 80 drives survival; marketing (growth) risk 72 must not.
    const domainScores = [financeCycleToDomainScore(cycleRow()), marketingCycleToDomainScore(mktCycle)];
    const topActions = [
      financeActionRowToOwnerAction(actionRow({ id: "fin", priorityScore: 60 })),
      marketingActionRowToOwnerAction(mktAction), // 88
    ];
    const profile = buildBusinessConditionProfile({ businessId: "b", workspaceId: "w", domainScores, topActions, now: NOW });
    expect(profile.domainScores.map((d) => d.domain).sort()).toEqual(["finance", "marketing"]);
    expect(profile.survivalRiskScore).toBe(80); // marketing risk 72 must NOT raise survival
    // The profile no longer elects a next action (the ONE overall election is resolveOwnerDecision);
    // the mapped actions keep their stored-priority order.
    expect(profile).not.toHaveProperty("recommendedNextAction");
    expect(rankOwnerActions(topActions)[0].domain).toBe("marketing"); // 88 > 60 across domains
  });
});

describe("Owner condition — strategy→spine mappers (decision-support domain)", () => {
  const stratCycle = {
    healthScore: 82,
    riskScore: 20,
    opportunityScore: 70,
    dataConfidenceScore: 90,
    strategyState: "STRONG_GO",
    generatedAt: NOW,
    findings: [{ code: "STR_OPP_STRONG_RETURN" }, { code: "STR_OPP_FAST_PAYBACK" }],
    actions: [{ findingCode: "STR_OPP_STRONG_RETURN" }],
  };
  const stratAction = {
    id: "88888888-8888-4888-8888-888888888888",
    findingCode: "STR_OPP_STRONG_RETURN",
    title: "Pursue this high-return option",
    description: "Commit in a staged way while the numbers hold.",
    ownerRole: "owner",
    priorityScore: 76,
    effortScore: 45,
    expectedImpactScore: 60,
    confidence: 0.7,
    status: "proposed",
    verificationMetric: "roiAnnualPct",
    verificationMethod: "before/after",
    expectedTimeframeDays: 30,
  };

  it("maps a strategy cycle row to a valid DomainScore (clamped)", () => {
    const ds = strategyCycleToDomainScore({ ...stratCycle, healthScore: 140, riskScore: -5 });
    expect(ds.domain).toBe("strategy");
    expect(ds.healthScore).toBe(100); // clamped
    expect(ds.riskScore).toBe(0); // clamped
    expect(ds.dataConfidenceScore).toBe(90);
    expect(ds.topFindingCodes).toContain("STR_OPP_STRONG_RETURN");
    expect(domainScoreSchema.safeParse(ds).success).toBe(true);
  });

  it("maps a strategy action row to a schema-valid OwnerAction", () => {
    const a = strategyActionRowToOwnerAction(stratAction);
    expect(a.domain).toBe("strategy");
    expect(ownerActionSchema.safeParse(a).success).toBe(true);
  });

  it("strategy is decision-support: its risk does NOT raise survivalRiskScore", () => {
    // finance (survival) risk 80 drives survival; strategy (decision-support) does not.
    const domainScores = [financeCycleToDomainScore(cycleRow()), strategyCycleToDomainScore(stratCycle)];
    const topActions = [
      financeActionRowToOwnerAction(actionRow({ id: "fin", priorityScore: 60 })),
      strategyActionRowToOwnerAction({ ...stratAction, priorityScore: 88 }),
    ];
    const profile = buildBusinessConditionProfile({ businessId: "b", workspaceId: "w", domainScores, topActions, now: NOW });
    expect(profile.domainScores.map((d) => d.domain).sort()).toEqual(["finance", "strategy"]);
    expect(profile.survivalRiskScore).toBe(80); // finance only — strategy is not a survival domain
    // The profile no longer elects a next action (the ONE overall election is resolveOwnerDecision);
    // the mapped actions keep their stored-priority order.
    expect(profile).not.toHaveProperty("recommendedNextAction");
    expect(rankOwnerActions(topActions)[0].domain).toBe("strategy"); // 88 > 60 across domains
  });
});

describe("Owner command-center route enforcement", () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, "../../app/api/owner/command-center/route.ts"),
    "utf8"
  );
  it("is canonically enforced, workspace-scoped, OWNER_VIEW", () => {
    expect(src).toContain("withCanonicalEnforcement");
    expect(src).toContain("requireWorkspace: true");
    expect(src).toMatch(/requireCapabilities:\s*\[CAPABILITIES\.OWNER_VIEW\]/);
  });
  it("does not touch recovery tables/routes", () => {
    expect(src).not.toMatch(/recovery/i);
  });
});
