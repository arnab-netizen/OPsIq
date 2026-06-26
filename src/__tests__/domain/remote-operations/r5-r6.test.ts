import { describe, it, expect } from "vitest";
import { evaluateDispatch, isApprovalFresh, type FeasibilityContext } from "@/domain/remote-operations/dispatch-feasibility";
import { canBulkApprove, itemsRequiringIndividualAck, checkAiPlanApproval, assertAiPlanApprovable, AiPlanApprovalError } from "@/domain/remote-operations/plan-approval";
import type { DistributionPlan, PlanItem } from "@/domain/remote-operations/distribution-plan";
import { runCollective } from "@/domain/collective-training/collective-engine";

const feasible = (over: Partial<FeasibilityContext> = {}): FeasibilityContext => ({
  staffAvailable: true, roleSkillMatch: true, workloadCapacityOk: true, locationValid: true, accessReady: true,
  suppliesReady: true, checklistAttached: true, proofRequirementAttached: true, verifierAssigned: true,
  pairRiskBlockActive: false, falseCompletionBlockActive: false, deadlineFeasible: true, dependencyChainSatisfied: true,
  backupForCritical: true, locationPaused: false, locationReadyBlocked: false, approvalThresholdsSatisfied: true,
  complianceGatePassed: true, safetyGatePassed: true, customerTimingKnown: true, costApprovalSatisfied: true,
  ownerApprovalSatisfied: true, vendorPrequalified: true, workloadDataComplete: true, approvalFresh: true, ...over,
});

describe("[R5] pre-dispatch feasibility + dispatch veto matrix", () => {
  it("a fully-feasible standard task dispatches", () => {
    expect(evaluateDispatch(feasible(), "STANDARD").canDispatch).toBe(true);
  });
  it("missing access / checklist / verifier / supplies block dispatch", () => {
    expect(evaluateDispatch(feasible({ accessReady: false }), "STANDARD").blocked).toContain("ACCESS_NOT_READY");
    expect(evaluateDispatch(feasible({ checklistAttached: false }), "STANDARD").blocked).toContain("NO_CHECKLIST");
    expect(evaluateDispatch(feasible({ verifierAssigned: false }), "HIGH").blocked).toContain("NO_VERIFIER");
    expect(evaluateDispatch(feasible({ suppliesReady: false }), "STANDARD").blocked).toContain("SUPPLIES_MISSING");
  });
  it("pair-risk and false-completion blocks stop dispatch", () => {
    expect(evaluateDispatch(feasible({ pairRiskBlockActive: true }), "HIGH").blocked).toContain("PAIR_RISK_BLOCK_ACTIVE");
    expect(evaluateDispatch(feasible({ falseCompletionBlockActive: true }), "HIGH").blocked).toContain("FALSE_COMPLETION_BLOCK_ACTIVE");
  });
  it("paused location and unverified dependency block dispatch", () => {
    expect(evaluateDispatch(feasible({ locationPaused: true }), "STANDARD").blocked).toContain("LOCATION_PAUSED");
    expect(evaluateDispatch(feasible({ dependencyChainSatisfied: false }), "STANDARD").blocked).toContain("DEPENDENCY_NOT_VERIFIED");
  });
  it("HIGH risk with incomplete workload data is blocked", () => {
    expect(evaluateDispatch(feasible({ workloadDataComplete: false }), "HIGH").blocked).toContain("WORKLOAD_DATA_INCOMPLETE_FOR_HIGH_RISK");
    expect(evaluateDispatch(feasible({ workloadDataComplete: false }), "STANDARD").blocked).not.toContain("WORKLOAD_DATA_INCOMPLETE_FOR_HIGH_RISK");
  });
  it("an unqualified vendor cannot be dispatched", () => {
    expect(evaluateDispatch(feasible({ isVendorTask: true, vendorPrequalified: false }), "STANDARD").blocked).toContain("VENDOR_NOT_PREQUALIFIED");
  });
  it("an Owner Mode active veto blocks dispatch of a vetoed action", () => {
    const arbitration = runCollective({ archetype: "universal", ownerGoal: "ads", signals: [{ domain: "cash-survival", status: "RED", severity: "CRITICAL", confidence: "HIGH" }] });
    expect(evaluateDispatch(feasible({ arbitration, performsActions: ["paid_marketing"] }), "STANDARD").blocked).toContain("OWNER_MODE_VETO_ACTIVE");
  });
  it("CRITICAL with no backup or unknown customer timing is blocked", () => {
    expect(evaluateDispatch(feasible({ backupForCritical: false }), "CRITICAL").blocked).toContain("OWNER_APPROVAL_REQUIRED");
    expect(evaluateDispatch(feasible({ customerTimingKnown: false }), "CRITICAL").blocked).toContain("CUSTOMER_TIMING_UNKNOWN_FOR_CRITICAL_TASK");
  });
  it("stale approval blocks dispatch; recurring tasks always re-check", () => {
    expect(isApprovalFresh(0, 3 * 60 * 60 * 1000, "STANDARD")).toBe(true);
    expect(isApprovalFresh(0, 3 * 60 * 60 * 1000, "HIGH")).toBe(false);
    expect(isApprovalFresh(0, 0, "STANDARD", true)).toBe(false);
    expect(evaluateDispatch(feasible({ approvalFresh: false }), "STANDARD").blocked).toContain("DISTRIBUTION_APPROVAL_STALE");
  });
});

describe("[R6] AI-generated plan approval gate", () => {
  const item = (risk: PlanItem["riskLevel"], over: Partial<PlanItem> = {}): PlanItem => ({ taskTemplateType: "RECURRING_SERVICE", locationId: "locA", scheduledAtMs: 1, assignee: "s1", riskLevel: risk, ...over });
  const plan = (items: PlanItem[], source: DistributionPlan["sourceType"] = "AI_GENERATED_HUMAN_REVIEWED"): DistributionPlan => ({
    distributionPlanId: "dp1", workspaceId: "ws1", businessId: "b1", locationId: "locA", version: 1, createdAtMs: 1, createdBy: "ai",
    sourceType: source, status: "APPROVAL_REQUIRED", items, idempotencyKey: "k", dispatched: false, changeLog: [],
  });

  it("bulk approval allowed for all-LOW/STANDARD plans only", () => {
    expect(canBulkApprove([item("LOW"), item("STANDARD", { assignee: "s2" })]).allowed).toBe(true);
    expect(canBulkApprove([item("LOW"), item("HIGH", { assignee: "s2" })]).allowed).toBe(false);
  });
  it("HIGH/CRITICAL items are flagged for individual acknowledgement", () => {
    expect(itemsRequiringIndividualAck([item("LOW"), item("CRITICAL", { assignee: "s2" })]).length).toBe(1);
  });
  it("an AI plan pending human review cannot be approved", () => {
    expect(checkAiPlanApproval(plan([item("LOW")], "AI_GENERATED_PENDING_REVIEW"), { mode: "bulk" })).toContain("ai_plan_not_human_reviewed");
  });
  it("a HIGH/CRITICAL AI plan cannot be bulk approved", () => {
    expect(() => assertAiPlanApprovable(plan([item("HIGH")]), { mode: "bulk" })).toThrow(AiPlanApprovalError);
  });
  it("individual approval requires every high-risk item acknowledged", () => {
    const p = plan([item("LOW"), item("CRITICAL", { assignee: "s2" })]);
    expect(checkAiPlanApproval(p, { mode: "individual", acknowledgedItemIndexes: [] })).toContain("high_risk_item_not_acknowledged:1");
    expect(checkAiPlanApproval(p, { mode: "individual", acknowledgedItemIndexes: [1] })).toEqual([]);
  });
  it("a plan with duplicate tasks is blocked before approval", () => {
    expect(checkAiPlanApproval(plan([item("LOW"), item("LOW")]), { mode: "bulk" })).toContain("duplicate_tasks_present");
  });
});
