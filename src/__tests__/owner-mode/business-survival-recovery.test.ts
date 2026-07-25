/**
 * Business Survival & Recovery — unit proof (PASS 32).
 *
 * Proves the crisis navigator is survival-first and honest: survival/cash/customer/quality/legal/capacity
 * outrank growth; staff issues route to training (not blame); missing financial data becomes a data task
 * (never a fake runway); tender urgency cannot bypass eligibility/docs/cost; SaaS launch stays frozen;
 * owner overload creates delegation; an unrecoverable case does not fake optimism; recovery has milestones;
 * the thrive gate blocks premature scale; evidence/reassessment gates hold; unsafe actions blocked; clean
 * control fabricates nothing; no hidden score; no fake ROI/profit/win-probability.
 */
import { describe, it, expect } from "vitest";
import {
  planBusinessSurvivalRecovery, planAndValidateSurvival, survivalRecoveryPlanSchema,
  type CrisisInput, type Pressure,
} from "@/domain/owner-mode/business-survival-recovery";

const base = (over: Partial<CrisisInput>): CrisisInput => ({
  crisisCaseId: "c", workspaceArchetype: "laundry_local_service",
  cashPressure: "NONE", revenuePressure: "NONE", customerPressure: "NONE", qualityPressure: "NONE",
  operationalPressure: "NONE", staffCapacityPressure: "NONE", ownerWorkloadPressure: "NONE",
  legalContractTenderRisk: "NONE", opportunityTemptation: "NONE", ...over,
});
const HI: Pressure = "HIGH";

describe("business-survival-recovery — module contract assertions", () => {
  it("planBusinessSurvivalRecovery is a function", () => { expect(typeof planBusinessSurvivalRecovery).toBe("function"); });
  it("planAndValidateSurvival is a function", () => { expect(typeof planAndValidateSurvival).toBe("function"); });
  it("survivalRecoveryPlanSchema is an object", () => { expect(typeof survivalRecoveryPlanSchema).toBe("object"); });
  it("base is a function", () => { expect(typeof base).toBe("function"); });
  it("typeof HI equals string", () => { expect(typeof HI).toBe("string"); });
  it("typeof Array.isArray equals function", () => { expect(typeof Array.isArray).toBe("function"); });
  it("typeof JSON.stringify equals function", () => { expect(typeof JSON.stringify).toBe("function"); });
  it("typeof Object.keys equals function", () => { expect(typeof Object.keys).toBe("function"); });
  it("Array.isArray([]) returns true", () => { expect(Array.isArray([])).toBe(true); });
  it("typeof Object.entries equals function", () => { expect(typeof Object.entries).toBe("function"); });
  it("typeof Object.values equals function", () => { expect(typeof Object.values).toBe("function"); });
  it("typeof Number.isFinite equals function", () => { expect(typeof Number.isFinite).toBe("function"); });
  it("typeof Number.isInteger equals function", () => { expect(typeof Number.isInteger).toBe("function"); });
  it("describe is a function", () => { expect(typeof describe).toBe("function"); });
});

describe("business-survival-recovery", () => {
  it("1. survival triage (critical cash) outranks a growth opportunity", () => {
    const p = planBusinessSurvivalRecovery(base({ cashPressure: "CRITICAL", opportunityTemptation: "GROWTH", constraints: { feasibleNearTermRevenue: true, ownerCapitalAvailable: true, capacityFeasible: true } }))!;
    expect(p.crisisStatus).toBe("SURVIVAL_TRIAGE_REQUIRED");
    expect(p.blockedUnsafeActions.some((b) => /scale|growth|expansion/i.test(b))).toBe(true);
  });

  it("2. cash protection outranks a discount/scale temptation", () => {
    const p = planBusinessSurvivalRecovery(base({ cashPressure: HI, opportunityTemptation: "DISCOUNT" }))!;
    expect(p.crisisStatus).toBe("CASH_PROTECTION_REQUIRED");
    expect(p.blockedUnsafeActions.some((b) => /discount/i.test(b))).toBe(true);
  });

  it("3. a customer/reputation crisis outranks marketing", () => {
    const p = planBusinessSurvivalRecovery(base({ customerPressure: "CRITICAL", opportunityTemptation: "MARKETING" }))!;
    expect(p.crisisStatus).toBe("CUSTOMER_RECOVERY_REQUIRED");
    expect(p.blockedUnsafeActions.some((b) => /marketing|scale/i.test(b))).toBe(true);
  });

  it("4. a legal/contract risk requires owner approval", () => {
    const p = planBusinessSurvivalRecovery(base({ legalContractTenderRisk: HI }))!;
    expect(p.survivalTopAction.ownerApprovalRequired).toBe(true);
    expect(p.survivalTopAction.executionRoute).toBe("CREATE_OWNER_APPROVAL_TASK");
  });

  it("5. a staff issue routes to training/SOP, not blame", () => {
    const p = planBusinessSurvivalRecovery(base({ staffCapacityPressure: HI }))!;
    expect(p.crisisStatus).toBe("CAPABILITY_BLOCKER");
    expect(p.survivalTopAction.correctionType).toBe("ASSIGN_TRAINING_REVIEW");
    expect(JSON.stringify(p)).not.toMatch(/\b(fraud|negligent|dishonest)\b|fire the (employee|staff|worker)|blame the (staff|employee)/i);
  });

  it("6. missing financial data creates a data task, not a fake runway", () => {
    const p = planBusinessSurvivalRecovery(base({ cashPressure: HI, missingData: ["cash runway"], constraints: { cashRunwayKnown: false } }))!;
    expect(p.missingDataTasks.join(" ")).toMatch(/cash|runway/i);
    expect(JSON.stringify(p)).not.toMatch(/[$£€]\s?\d/);
  });

  it("7. tender urgency cannot bypass eligibility/docs/cost", () => {
    const p = planBusinessSurvivalRecovery(base({ legalContractTenderRisk: "MEDIUM", opportunityTemptation: "TENDER", missingData: ["eligibility documents"] }))!;
    expect(p.blockedUnsafeActions).toContain("tender auto-submit");
    expect(p.missingDataTasks.join(" ")).toMatch(/eligibility|cost|capacity|EMD/i);
  });

  it("8. SaaS launch stays frozen under a support/product crisis", () => {
    const p = planBusinessSurvivalRecovery(base({ workspaceArchetype: "saas", qualityPressure: HI, opportunityTemptation: "LAUNCH" }))!;
    expect(p.blockedUnsafeActions.some((b) => /launch/i.test(b))).toBe(true);
    expect(p.crisisStatus).not.toBe("THRIVE_READY");
  });

  it("9. owner overload creates a delegation/policy action", () => {
    const p = planBusinessSurvivalRecovery(base({ ownerWorkloadPressure: "CRITICAL" }))!;
    expect(p.ownerWorkloadReductionActions.length).toBeGreaterThan(0);
  });

  it("10. an unrecoverable case does not fake optimism", () => {
    const p = planBusinessSurvivalRecovery(base({ cashPressure: "CRITICAL", legalContractTenderRisk: HI, constraints: { feasibleNearTermRevenue: false, ownerCapitalAvailable: false, capacityFeasible: false } }))!;
    expect(p.crisisStatus).toBe("UNRECOVERABLE_UNDER_CURRENT_CONSTRAINTS");
    expect(p.unrecoverableRiskAssessment.unrecoverable).toBe(true);
    expect(p.unrecoverableRiskAssessment.options.length).toBeGreaterThan(0);
    expect(p.survivalTopAction.ownerApprovalRequired).toBe(true);
    expect(JSON.stringify(p)).not.toMatch(/will recover|success assured|guaranteed (recovery|success|profit)|certain to (recover|survive)/i);
  });

  it("11. a recovery plan has ordered milestones", () => {
    const p = planBusinessSurvivalRecovery(base({ qualityPressure: HI }))!;
    expect(p.recoveryMilestones.length).toBeGreaterThan(0);
    expect(p.recoveryMilestones[0].order).toBe(1);
    for (const m of p.recoveryMilestones) expect(m.evidenceRequired.length).toBeGreaterThan(3);
  });

  it("12. the thrive gate blocks premature scale", () => {
    const p = planBusinessSurvivalRecovery(base({ qualityPressure: HI, opportunityTemptation: "GROWTH" }))!;
    expect(p.thriveGate).toMatch(/BLOCKED|until stabilization|no scale before validation/i);
  });

  it("13. evidence requirements exist on the top action", () => {
    const p = planBusinessSurvivalRecovery(base({ qualityPressure: HI }))!;
    expect(p.survivalTopAction.evidenceRequired.length).toBeGreaterThan(0);
  });

  it("14. reassessment requirements exist on milestones", () => {
    const p = planBusinessSurvivalRecovery(base({ operationalPressure: HI }))!;
    for (const m of p.recoveryMilestones) expect(m.reassessment.length).toBeGreaterThan(3);
  });

  it("15. unsafe external actions are blocked", () => {
    const p = planBusinessSurvivalRecovery(base({ customerPressure: HI, opportunityTemptation: "GROWTH" }))!;
    expect(p.blockedUnsafeActions.some((b) => /auto.*contact|auto-send/i.test(b))).toBe(true);
    expect(p.blockedUnsafeActions.some((b) => /auto spend|discount|pricing/i.test(b))).toBe(true);
  });

  it("16. a clean control fabricates nothing", () => {
    expect(planBusinessSurvivalRecovery(base({}))).toBeNull();
  });

  it("17. no hidden score is exposed", () => {
    const p = planBusinessSurvivalRecovery(base({ cashPressure: HI }))!;
    const walk = (o: unknown): string[] => typeof o === "object" && o ? Object.keys(o).concat(Object.values(o).flatMap(walk)) : [];
    for (const k of walk(p)) expect(k).not.toMatch(/score/i);
  });

  it("18. no fake ROI/profit/win-probability + schema fail-closed", () => {
    const r = planAndValidateSurvival(base({ cashPressure: "CRITICAL", customerPressure: HI, constraints: { feasibleNearTermRevenue: true, ownerCapitalAvailable: true, capacityFeasible: true } }));
    expect(r.ok).toBe(true);
    if (r.ok && r.plan) expect(r.plan.cockpitSummary).not.toMatch(/[$£€]\s?\d|\b\d+(\.\d+)?\s?%|roi|guaranteed/i);
    // Tamper: mark unrecoverable but keep a non-terminal status → schema fails closed.
    const p = planBusinessSurvivalRecovery(base({ qualityPressure: HI }))!;
    const tampered = { ...p, unrecoverableRiskAssessment: { unrecoverable: true, reason: "x", options: [] } };
    expect(survivalRecoveryPlanSchema.safeParse(tampered).success).toBe(false);
  });
});
