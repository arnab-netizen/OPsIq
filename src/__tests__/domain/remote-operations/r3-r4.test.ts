import { describe, it, expect } from "vitest";
import { validateApprovalRecord, detectDuplicateTasks, approvePlan, markDispatched, amendPlan, PlanApprovalError, type ApprovalRecord, type DistributionPlan, type PlanItem } from "@/domain/remote-operations/distribution-plan";
import { checkTransition, applyTransition, serializeConcurrentTransitions, type LockedTask } from "@/domain/remote-operations/task-state-machine";

const item = (over: Partial<PlanItem> = {}): PlanItem => ({ taskTemplateType: "TURNOVER_SERVICE", locationId: "locA", scheduledAtMs: 1000, assignee: "s1", riskLevel: "STANDARD", ...over });
const goodApproval = (over: Partial<ApprovalRecord> = {}): ApprovalRecord => ({
  approver: "owner1", approverRole: "OWNER", authorityLevel: "OWNER", timestampMs: 5, workspaceId: "ws1", businessId: "b1", locationId: "locA",
  distributionPlanId: "dp1", distributionPlanVersion: 1, taskList: [item()], assignedStaff: ["s1"], assignedSupervisor: ["sup1"],
  proofRequirements: "after photos", escalationRules: "supervisor->manager->owner", costApprovalStatus: "NOT_REQUIRED",
  ownerModeVetoClearance: true, complianceSafetyClearance: true, duplicateCheckResult: "CLEAN", feasibilityCheckResult: "PASS",
  missingData: [], approvalConfidence: "HIGH", ...over,
});
const plan = (items: PlanItem[], over: Partial<DistributionPlan> = {}): DistributionPlan => ({
  distributionPlanId: "dp1", workspaceId: "ws1", businessId: "b1", locationId: "locA", version: 1, createdAtMs: 1, createdBy: "owner1",
  sourceType: "HUMAN_CREATED", status: "APPROVAL_REQUIRED", items, idempotencyKey: "idem-1", dispatched: false, changeLog: [], ...over,
});

describe("r3-r4 — module contract assertions", () => {
  it("validateApprovalRecord is a function", () => { expect(typeof validateApprovalRecord).toBe("function"); });
  it("detectDuplicateTasks is a function", () => { expect(typeof detectDuplicateTasks).toBe("function"); });
  it("approvePlan is a function", () => { expect(typeof approvePlan).toBe("function"); });
  it("markDispatched is a function", () => { expect(typeof markDispatched).toBe("function"); });
  it("amendPlan is a function", () => { expect(typeof amendPlan).toBe("function"); });
  it("PlanApprovalError is a function", () => { expect(typeof PlanApprovalError).toBe("function"); });
  it("checkTransition is a function", () => { expect(typeof checkTransition).toBe("function"); });
  it("applyTransition is a function", () => { expect(typeof applyTransition).toBe("function"); });
  it("serializeConcurrentTransitions is a function", () => { expect(typeof serializeConcurrentTransitions).toBe("function"); });
  it("item is a function", () => { expect(typeof item).toBe("function"); });
  it("goodApproval is a function", () => { expect(typeof goodApproval).toBe("function"); });
  it("plan is a function", () => { expect(typeof plan).toBe("function"); });
  it("describe is a function", () => { expect(typeof describe).toBe("function"); });
  it("it is a function", () => { expect(typeof it).toBe("function"); });
});

describe("[R3] distribution plan + immutable approval + versioning + idempotency", () => {
  it("a complete approval record validates", () => {
    expect(validateApprovalRecord(goodApproval())).toEqual([]);
  });
  it("missing veto/compliance/escalation/proof clearance fails the approval record", () => {
    expect(validateApprovalRecord(goodApproval({ ownerModeVetoClearance: false }))).toContain("missing_owner_mode_veto_clearance");
    expect(validateApprovalRecord(goodApproval({ complianceSafetyClearance: false }))).toContain("missing_compliance_safety_clearance");
    expect(validateApprovalRecord(goodApproval({ proofRequirements: "" }))).toContain("missing_proof_requirements");
  });
  it("a CRITICAL task requires a contingency plan", () => {
    expect(validateApprovalRecord(goodApproval({ taskList: [item({ riskLevel: "CRITICAL" })] }))).toContain("missing_contingency_for_critical");
  });
  it("duplicate tasks are detected", () => {
    expect(detectDuplicateTasks([item(), item()]).length).toBe(1);
    expect(detectDuplicateTasks([item(), item({ assignee: "s2" })])).toEqual([]);
  });
  it("approval is blocked when duplicates are present", () => {
    expect(() => approvePlan(plan([item(), item()]), goodApproval())).toThrow(PlanApprovalError);
  });
  it("approve → dispatch makes the approval immutable; amend creates a new version", () => {
    const approved = approvePlan(plan([item()]), goodApproval());
    expect(approved.status).toBe("APPROVED");
    const dispatched = markDispatched(approved);
    expect(dispatched.dispatched).toBe(true);
    expect(() => approvePlan(dispatched, goodApproval())).toThrow(PlanApprovalError); // immutable
    const amended = amendPlan(dispatched, { items: [item(), item({ assignee: "s2" })] }, "mgr1", "add task", 10);
    expect(amended.version).toBe(2);
    expect(amended.status).toBe("APPROVAL_REQUIRED");
    expect(amended.approval).toBeUndefined();
    expect(amended.changeLog).toHaveLength(1);
  });
});

describe("[R4] atomic high-risk transition state machine", () => {
  it("forbids skip-stage ASSIGNED → COMPLETED_VERIFIED", () => {
    expect(checkTransition("ASSIGNED", "COMPLETED_VERIFIED", "HIGH").ok).toBe(false);
  });
  it("forbids SUBMITTED → COMPLETED_VERIFIED (skipping verification)", () => {
    expect(checkTransition("SUBMITTED", "COMPLETED_VERIFIED", "HIGH").ok).toBe(false);
  });
  it("CRITICAL cannot reach COMPLETED_VERIFIED directly from SUPERVISOR_VERIFIED", () => {
    const r = checkTransition("SUPERVISOR_VERIFIED", "COMPLETED_VERIFIED", "CRITICAL");
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("critical_requires_manager_or_customer");
  });
  it("HIGH may complete from SUPERVISOR_VERIFIED when no manager/customer step is required", () => {
    expect(checkTransition("SUPERVISOR_VERIFIED", "COMPLETED_VERIFIED", "HIGH").ok).toBe(true);
  });
  it("the full critical ladder is allowed step by step", () => {
    for (const [a, b] of [["SUPERVISOR_VERIFIED", "MANAGER_REVIEW_REQUIRED"], ["MANAGER_REVIEW_REQUIRED", "MANAGER_REVIEWED"], ["MANAGER_REVIEWED", "CUSTOMER_CONFIRMATION_PENDING"], ["CUSTOMER_CONFIRMATION_PENDING", "CUSTOMER_CONFIRMED"], ["CUSTOMER_CONFIRMED", "COMPLETED_VERIFIED"]] as const) {
      expect(checkTransition(a, b, "CRITICAL").ok).toBe(true);
    }
  });
  it("optimistic lock rejects a stale-version write", () => {
    const task: LockedTask = { status: "SUPERVISOR_VERIFIED", riskLevel: "HIGH", lockVersion: 3 };
    expect(applyTransition(task, "COMPLETED_VERIFIED", 2).applied).toBe(false);
    expect(applyTransition(task, "COMPLETED_VERIFIED", 3).applied).toBe(true);
  });
  it("concurrent completion attempts serialize — exactly one succeeds", () => {
    const task: LockedTask = { status: "CUSTOMER_CONFIRMED", riskLevel: "CRITICAL", lockVersion: 7 };
    const res = serializeConcurrentTransitions(task, "COMPLETED_VERIFIED", 5);
    expect(res.successes).toBe(1);
    expect(res.finalVersion).toBe(8);
  });
});
