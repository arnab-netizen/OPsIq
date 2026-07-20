import { describe, it, expect } from "vitest";
import {
  DelegatedTaskStatus as T,
  TaskActor,
  TaskActorRole,
  planTaskTransition,
  isTerminalTaskStatus,
  hasCompleteBoundaryBinding,
  validateTaskGuidance,
  DelegatedTask,
} from "@/domain/execution/delegated-task";
import {
  sealBoundary,
  ApprovedExecutionBoundaryDraft,
  BoundaryValidationStatus,
} from "@/domain/execution/boundary";

const employeeAssignee: TaskActor = {
  role: TaskActorRole.EMPLOYEE,
  isAssignee: true,
  canApproveCompletion: false,
  canReviewProof: false,
  canAssign: false,
};
const employeeOther: TaskActor = { ...employeeAssignee, isAssignee: false };
const owner: TaskActor = {
  role: TaskActorRole.OWNER,
  isAssignee: false,
  canApproveCompletion: true,
  canReviewProof: true,
  canAssign: true,
};
const managerPlain: TaskActor = {
  role: TaskActorRole.MANAGER,
  isAssignee: false,
  canApproveCompletion: false,
  canReviewProof: false,
  canAssign: false,
};
const managerApprover: TaskActor = { ...managerPlain, canApproveCompletion: true };
const managerAssigner: TaskActor = { ...managerPlain, canAssign: true };
const managerReviewer: TaskActor = { ...managerPlain, canReviewProof: true };
const system: TaskActor = { ...managerPlain, role: TaskActorRole.SYSTEM };

describe("transition graph validity", () => {
  it("valid graph transitions are accepted (owner)", () => {
    expect(planTaskTransition(T.DRAFT, T.ASSIGNED, owner).allowed).toBe(true);
    expect(planTaskTransition(T.IN_PROGRESS, T.PROOF_REQUIRED, owner).allowed).toBe(true);
    expect(planTaskTransition(T.COMPLETED_PENDING_REVIEW, T.APPROVED_COMPLETE, owner).allowed).toBe(true);
  });
  it("invalid graph transitions are rejected even for the owner", () => {
    expect(planTaskTransition(T.DRAFT, T.APPROVED_COMPLETE, owner).allowed).toBe(false);
    expect(planTaskTransition(T.ASSIGNED, T.PROOF_SUBMITTED, owner).allowed).toBe(false);
  });
  it("no-op transition is rejected", () => {
    expect(planTaskTransition(T.IN_PROGRESS, T.IN_PROGRESS, owner).allowed).toBe(false);
  });
  it("terminal states have no outgoing transitions", () => {
    expect(isTerminalTaskStatus(T.APPROVED_COMPLETE)).toBe(true);
    expect(isTerminalTaskStatus(T.CANCELLED)).toBe(true);
    expect(isTerminalTaskStatus(T.EXPIRED)).toBe(true);
    expect(planTaskTransition(T.APPROVED_COMPLETE, T.IN_PROGRESS, owner).allowed).toBe(false);
  });
});

describe("employee authorization", () => {
  it("assignee employee can drive execution steps", () => {
    expect(planTaskTransition(T.ASSIGNED, T.ACKNOWLEDGED, employeeAssignee).allowed).toBe(true);
    expect(planTaskTransition(T.ACKNOWLEDGED, T.IN_PROGRESS, employeeAssignee).allowed).toBe(true);
    expect(planTaskTransition(T.PROOF_REQUIRED, T.PROOF_SUBMITTED, employeeAssignee).allowed).toBe(true);
    expect(planTaskTransition(T.IN_PROGRESS, T.COMPLETED_PENDING_REVIEW, employeeAssignee).allowed).toBe(true);
  });
  it("a non-assignee employee cannot update the task", () => {
    expect(planTaskTransition(T.ACKNOWLEDGED, T.IN_PROGRESS, employeeOther).allowed).toBe(false);
  });
  it("EMPLOYEE CANNOT mark APPROVED_COMPLETE", () => {
    const d = planTaskTransition(T.COMPLETED_PENDING_REVIEW, T.APPROVED_COMPLETE, employeeAssignee);
    expect(d.allowed).toBe(false);
    expect(d.reason).toMatch(/cannot mark a task APPROVED_COMPLETE/i);
  });
  it("employee cannot reject/dispute (reviewer actions) or assign or cancel", () => {
    expect(planTaskTransition(T.PROOF_SUBMITTED, T.REJECTED_INCOMPLETE, employeeAssignee).allowed).toBe(false);
    expect(planTaskTransition(T.PROOF_SUBMITTED, T.DISPUTED, employeeAssignee).allowed).toBe(false);
    expect(planTaskTransition(T.DRAFT, T.ASSIGNED, employeeAssignee).allowed).toBe(false);
    expect(planTaskTransition(T.ASSIGNED, T.CANCELLED, employeeAssignee).allowed).toBe(false);
  });
});

describe("manager / owner / system authorization", () => {
  it("owner can approve completion; manager only with completion authority", () => {
    expect(planTaskTransition(T.COMPLETED_PENDING_REVIEW, T.APPROVED_COMPLETE, owner).allowed).toBe(true);
    expect(planTaskTransition(T.COMPLETED_PENDING_REVIEW, T.APPROVED_COMPLETE, managerApprover).allowed).toBe(true);
    expect(planTaskTransition(T.COMPLETED_PENDING_REVIEW, T.APPROVED_COMPLETE, managerPlain).allowed).toBe(false);
  });
  it("only a reviewer may reject/dispute", () => {
    expect(planTaskTransition(T.PROOF_SUBMITTED, T.REJECTED_INCOMPLETE, managerReviewer).allowed).toBe(true);
    expect(planTaskTransition(T.PROOF_SUBMITTED, T.REJECTED_INCOMPLETE, managerPlain).allowed).toBe(false);
  });
  it("only an assigner may assign or cancel", () => {
    expect(planTaskTransition(T.DRAFT, T.ASSIGNED, managerAssigner).allowed).toBe(true);
    expect(planTaskTransition(T.DRAFT, T.ASSIGNED, managerPlain).allowed).toBe(false);
    expect(planTaskTransition(T.ASSIGNED, T.CANCELLED, managerAssigner).allowed).toBe(true);
  });
  it("system may only EXPIRE", () => {
    expect(planTaskTransition(T.IN_PROGRESS, T.EXPIRED, system).allowed).toBe(true);
    expect(planTaskTransition(T.IN_PROGRESS, T.BLOCKED, system).allowed).toBe(false);
  });
});

describe("boundary binding", () => {
  const NOW = new Date("2026-06-25T12:00:00.000Z");
  function boundary() {
    const draft: ApprovedExecutionBoundaryDraft = {
      boundaryId: "bnd-1",
      boundaryVersion: 1,
      supersedesBoundaryVersion: null,
      workspaceId: "ws-1",
      recommendationId: "rec-1",
      approvedActionId: "act-1",
      ownerApprovedBy: "owner-1",
      approvedAt: NOW,
      validFrom: new Date("2026-06-20T00:00:00.000Z"),
      validUntil: new Date(Date.now() + 4 * 365 * 24 * 60 * 60 * 1000),
      maxUses: null,
      allowedRoles: ["counter_staff"],
      forbiddenRoles: [],
      allowedActions: ["call_customer"],
      forbiddenActions: [],
      allowedCustomerSegments: ["retail"],
      forbiddenCustomerSegments: [],
      allowedCommunicationChannels: ["whatsapp"],
      forbiddenCommunicationChannels: [],
      maxDiscount: 10,
      maxRefund: null,
      maxSpend: null,
      maxOvertime: null,
      priceQuoteAllowed: false,
      refundPromiseAllowed: false,
      sameDayPromiseAllowed: false,
      deliveryPromiseLimit: null,
      geographicBoundary: null,
      serviceTypeBoundary: null,
      capacityBoundary: null,
      dataAccessBoundary: ["own_assigned_tasks"],
      proofRequired: true,
      escalationTriggers: [],
      legalComplianceFlags: [],
      brandRiskFlags: [],
      ownerOverrideRequiredFor: [],
      isActive: true,
    };
    return sealBoundary(draft);
  }

  function taskFor(b: ReturnType<typeof boundary>): DelegatedTask {
    return {
      taskId: "task-1",
      workspaceId: "ws-1",
      workOrderId: "wo-1",
      assignedUserId: "emp-1",
      assignedRole: "counter_staff",
      status: T.IN_PROGRESS,
      approvedBoundaryId: b.boundaryId,
      approvedBoundaryVersion: b.boundaryVersion,
      boundaryContentHash: b.contentHash,
    };
  }

  it("hasCompleteBoundaryBinding requires id+version+hash+assignee", () => {
    const b = boundary();
    expect(hasCompleteBoundaryBinding(taskFor(b))).toBe(true);
    expect(
      hasCompleteBoundaryBinding({ ...taskFor(b), boundaryContentHash: null })
    ).toBe(false);
    expect(
      hasCompleteBoundaryBinding({ ...taskFor(b), assignedUserId: null })
    ).toBe(false);
  });

  it("in-bounds guidance for the bound boundary passes", () => {
    const b = boundary();
    const r = validateTaskGuidance(taskFor(b), "call_customer", "counter_staff", b, { now: NOW });
    expect(r.validationStatus).toBe(BoundaryValidationStatus.PASSED);
  });

  it("boundary hash mismatch blocks task guidance (fail closed)", () => {
    const b = boundary();
    const task = { ...taskFor(b), boundaryContentHash: "stale-hash" };
    const r = validateTaskGuidance(task, "call_customer", "counter_staff", b, { now: NOW });
    expect(r.validationStatus).toBe(BoundaryValidationStatus.FAILED_INVALID_BOUNDARY_VERSION);
  });

  it("a superseded (inactive) boundary blocks task guidance", () => {
    const b = boundary();
    const inactive = { ...b, isActive: false };
    const r = validateTaskGuidance(taskFor(b), "call_customer", "counter_staff", inactive, { now: NOW });
    expect(r.validationStatus).toBe(BoundaryValidationStatus.FAILED_INVALID_BOUNDARY_VERSION);
  });
});
