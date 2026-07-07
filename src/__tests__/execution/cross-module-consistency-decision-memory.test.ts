/**
 * Cross-module consistency + decision memory — unit proof (PASS 48).
 *
 * Proves OpsIQ's modules speak with ONE coherent business voice: finance overrides
 * growth, recovery/capability gates override scale, internal evidence beats weak
 * public signal, tender urgency does not bypass eligibility/cost/capacity, decision
 * memory blocks failed/owner-declined actions, and the owner cockpit resolves to a
 * single top action with grouped secondaries. Every decision is computed by the REAL
 * engines; this test only sets up the conflicts. Pure, no DB.
 */
import { describe, it, expect } from "vitest";
import {
  planBusinessSurvivalRecovery,
  planAndValidateSurvival,
  type CrisisInput,
} from "@/domain/owner-mode/business-survival-recovery";
import { assessGrowthReadiness, GrowthReadiness } from "@/domain/execution/growth-readiness";
import { evaluateProgressionRecommendation, ProgressionMove, type GrowthSignals } from "@/domain/execution/progression-engine";
import { evaluateDoNotRepeat } from "@/domain/owner-mode/do-not-repeat";
import { interpretRawPublicSignal } from "@/domain/owner-mode/public-signal-interpretation";
import { prioritisePublicSignals } from "@/domain/owner-mode/public-signal-prioritisation";
import { explainOwnerCockpitDecision, explainAndValidateOwnerCockpit } from "@/domain/owner-mode/owner-cockpit-decision-explanation";
import type { ConflictSignalInput } from "@/domain/owner-mode/public-signal-conflict-resolution";
import { getPhaseAllowedTransitions } from "@/services/intervention-state";

const MONEY = /[$£€]\s?\d|\bROI\b|\bMRR\b|guaranteed|win probability/i;

const crisis = (p: Partial<CrisisInput>): CrisisInput => ({
  crisisCaseId: "cmc", workspaceArchetype: "laundry_local_service",
  cashPressure: "NONE", revenuePressure: "NONE", customerPressure: "NONE", qualityPressure: "NONE",
  operationalPressure: "NONE", staffCapacityPressure: "NONE", ownerWorkloadPressure: "NONE",
  legalContractTenderRisk: "NONE", opportunityTemptation: "NONE", ...p,
});

// A fully-clean growth signal set (the ONLY set the gate permits).
const cleanGrowth: GrowthSignals = {
  cashRunwayWeak: false, grossMarginClear: true, repeatCustomersStrong: true, staffQualityStable: true,
  ownerFirefightingDaily: false, sopManagerLayerWorking: true, complaintsOrReworkRising: false,
  capacityStressed: false, profitImpactVerified: true, revenueGrowing: true,
};

describe("1. finance/cash overrides growth/opportunity", () => {
  it("weak cash alone blocks a growth move even when everything else is clean", () => {
    const decision = evaluateProgressionRecommendation({ ...cleanGrowth, cashRunwayWeak: true }, ProgressionMove.MARKETING_SCALE);
    expect(decision.allowed).toBe(false);
    expect(decision.blockedReasons).toContain("weak_cash_runway");
  });
  it("a cash crisis with a growth temptation keeps the top action on cash and blocks scale", () => {
    const plan = planBusinessSurvivalRecovery(crisis({ cashPressure: "HIGH", opportunityTemptation: "GROWTH" }))!;
    expect(plan.crisisStatus).toBe("CASH_PROTECTION_REQUIRED");
    expect(plan.blockedUnsafeActions.some((b) => /scale|growth|expansion/i.test(b))).toBe(true);
  });
});

describe("2. recovery/stabilization gates override growth gates", () => {
  it("an unproven SOP/manager layer blocks scale even with clean cash and margin", () => {
    const decision = assessGrowthReadiness({ ...cleanGrowth, sopManagerLayerWorking: false, staffQualityStable: false }, ProgressionMove.SECOND_LOCATION);
    expect(decision.readiness).toBe(GrowthReadiness.STABILIZE_FIRST);
    expect(decision.blockedReasons).toEqual(expect.arrayContaining(["sop_manager_layer_not_working", "unstable_staff_quality"]));
  });
  it("the phase machine cannot skip triage/stabilization straight to growth", () => {
    expect(getPhaseAllowedTransitions("triage")).not.toContain("growth");
    expect(getPhaseAllowedTransitions("stabilization")).not.toContain("growth");
    expect(getPhaseAllowedTransitions("recovery")).toContain("growth");
  });
});

describe("3 & 4. internal evidence beats weak public signal; public stays validation-needed", () => {
  it("a public 'all resolved, 5 stars' claim does not close the quality issue and needs internal validation", () => {
    const s = interpretRawPublicSignal({ rawText: "great service, all my complaints were resolved, 5 stars", sourceType: "public_review", archetype: "laundry_local_service" });
    expect(s.financialClaimAccepted).toBe(false);
    expect(s.missingData.length).toBeGreaterThan(0);
    expect(s.confidenceHandling).not.toBe("VERIFIED_SOURCE");
  });
  it("a public money claim is never accepted as a verified financial fact", () => {
    const s = interpretRawPublicSignal({ rawText: "we guarantee £5000 extra profit if you expand now", sourceType: "public_service_page", archetype: "laundry_local_service" });
    expect(s.financialClaimDetected).toBe(true);
    expect(s.financialClaimAccepted).toBe(false);
  });
  it("even an official source still needs the owner's own business data", () => {
    const s = interpretRawPublicSignal({ rawText: "Tender notice: municipal laundry contract, EMD required, eligibility documents listed", sourceType: "public_tender_notice", archetype: "laundry_local_service", officialSource: true });
    expect(s.missingData.length).toBeGreaterThan(0);
  });
});

describe("5 & 6. failed correction / owner-declined action are remembered", () => {
  it("an active do-not-repeat memory blocks the repeat unless changed context is supplied", () => {
    const mem = { category: "do_not_repeat", blocksRepetition: true, memoryKey: "scope:sop" };
    expect(evaluateDoNotRepeat(mem, null).blocked).toBe(true);
    expect(evaluateDoNotRepeat(mem, "the root cause changed: new supplier + retrained step").blocked).toBe(false);
  });
});

describe("7. a repeated missing-data condition is not converted into certainty", () => {
  it("unknown cash keeps a missing-data task and never becomes a fabricated figure", () => {
    const plan = planBusinessSurvivalRecovery(crisis({ cashPressure: "HIGH", missingData: ["verified cash position and runway"] }))!;
    expect(plan.missingDataTasks.some((m) => /cash|runway/i.test(m))).toBe(true);
    expect(plan.cockpitSummary).not.toMatch(MONEY);
  });
});

describe("8. tender urgency does not override eligibility/cost/capacity", () => {
  it("an urgent 'submit now' tender still routes to owner + keeps eligibility/EMD gates", () => {
    const plan = planBusinessSurvivalRecovery(crisis({ opportunityTemptation: "TENDER", legalContractTenderRisk: "HIGH", unsafeActionTemptations: ["submit the tender now automatically"] }))!;
    expect(plan.missingDataTasks.some((m) => /eligibility|EMD|capacity|cost/i.test(m))).toBe(true);
    expect(plan.blockedUnsafeActions.some((b) => /tender auto-submit|auto EMD/i.test(b))).toBe(true);
  });
});

describe("9. a capability gap is respected (blocks automation/growth)", () => {
  it("a staffing/capability blocker becomes the top action and blocks scale", () => {
    const plan = planBusinessSurvivalRecovery(crisis({ staffCapacityPressure: "HIGH", opportunityTemptation: "GROWTH" }))!;
    expect(plan.crisisStatus).toBe("CAPABILITY_BLOCKER");
    expect(assessGrowthReadiness({ ...cleanGrowth, staffQualityStable: false, sopManagerLayerWorking: false }).allowed).toBe(false);
  });
});

describe("10 & 11. the owner cockpit shows ONE coherent top action with grouped secondaries", () => {
  const signals: ConflictSignalInput[] = [
    ...Array.from({ length: 6 }, () => ({ signal: interpretRawPublicSignal({ rawText: "Garments repeatedly came back stained and orders consistently late.", sourceType: "public_review", archetype: "laundry_local_service" }), recency: "RECENT" as const })),
    { signal: interpretRawPublicSignal({ rawText: "We don't really know our cost, margin or capacity right now.", sourceType: "public_service_page", archetype: "laundry_local_service" }), recency: "UNKNOWN" as const },
    { signal: interpretRawPublicSignal({ rawText: "Demand is rising — should we expand now and open a new branch?", sourceType: "public_service_page", archetype: "laundry_local_service" }), recency: "UNKNOWN" as const },
  ];
  const explanation = explainOwnerCockpitDecision(prioritisePublicSignals({ workspaceArchetype: "laundry_local_service", signals }))!;

  it("resolves to a single top action, not module disagreement", () => {
    expect(explanation).not.toBeNull();
    expect(explanation.topAction).toBeDefined();
    expect(typeof explanation.topAction.topic).toBe("string");
  });
  it("subordinates growth and explains why growth is not yet allowed", () => {
    expect(explanation.topAction.topic).not.toBe("growth");
    expect(explanation.whyNotGrowthYet).not.toBeNull();
  });
  it("groups the remaining actions as secondary (a coherent single voice)", () => {
    expect(Array.isArray(explanation.secondaryActionGroups)).toBe(true);
    expect(explanationIsSchemaValid(signals)).toBe(true);
  });
  it("ranks on a transparent priority tier, not an opaque hidden score", () => {
    expect(explanation.whyThisIsTopPriority.join(" ")).toMatch(/tier|not an opaque score/i);
  });
});

describe("12. a clean control fabricates nothing", () => {
  it("no signals → no cockpit action; no pressure → no crisis plan", () => {
    expect(explainOwnerCockpitDecision(prioritisePublicSignals({ workspaceArchetype: "laundry_local_service", signals: [] }))).toBeNull();
    expect(planBusinessSurvivalRecovery(crisis({}))).toBeNull();
  });
});

describe("safety: every survival plan validates and blocks unsafe/autonomous action", () => {
  it("a multi-pressure plan is schema-valid, blocks scale + autonomous action, and states no money", () => {
    const res = planAndValidateSurvival(crisis({ cashPressure: "HIGH", customerPressure: "HIGH", staffCapacityPressure: "MEDIUM", opportunityTemptation: "GROWTH" }));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.plan.blockedUnsafeActions.some((b) => /scale|growth|expansion/i.test(b))).toBe(true);
      expect(res.plan.blockedUnsafeActions.some((b) => /auto.*(contact|send|spend|submit)/i.test(b))).toBe(true);
      expect(res.plan.cockpitSummary).not.toMatch(MONEY);
    }
  });
});

function explanationIsSchemaValid(signals: ConflictSignalInput[]): boolean {
  return explainAndValidateOwnerCockpit(prioritisePublicSignals({ workspaceArchetype: "laundry_local_service", signals })).ok;
}
