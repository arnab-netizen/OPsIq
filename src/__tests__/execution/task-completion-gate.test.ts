/**
 * Jarvis 360 Slice 3 — planTaskTransition completion gate + separation of duty.
 * Pure; no DB. Additive context: with no context, behavior is unchanged.
 */
import { describe, it, expect } from "vitest";
import {
  planTaskTransition,
  DelegatedTaskStatus as S,
  TaskActorRole,
  type TaskActor,
} from "@/domain/execution/delegated-task";

const manager: TaskActor = {
  role: TaskActorRole.MANAGER,
  isAssignee: false,
  canApproveCompletion: true,
  canReviewProof: true,
  canAssign: true,
};
const owner: TaskActor = { ...manager, role: TaskActorRole.OWNER };

const FROM = S.COMPLETED_PENDING_REVIEW;
const TO = S.APPROVED_COMPLETE;

describe("planTaskTransition completion gate — module contract assertions", () => {
  it("planTaskTransition is a function", () => { expect(typeof planTaskTransition).toBe("function"); });
  it("DelegatedTaskStatus is an object", () => { expect(typeof S).toBe("object"); });
  it("TaskActorRole is an object", () => { expect(typeof TaskActorRole).toBe("object"); });
  it("TaskActorRole.MANAGER is defined", () => { expect(TaskActorRole.MANAGER).toBeDefined(); });
  it("TaskActorRole.OWNER is defined", () => { expect(TaskActorRole.OWNER).toBeDefined(); });
  it("S.COMPLETED_PENDING_REVIEW is defined", () => { expect(S.COMPLETED_PENDING_REVIEW).toBeDefined(); });
  it("S.APPROVED_COMPLETE is defined", () => { expect(S.APPROVED_COMPLETE).toBeDefined(); });
  it("manager has role field", () => { expect(manager).toHaveProperty("role"); });
  it("owner has role field", () => { expect(owner).toHaveProperty("role"); });
  it("manager.canApproveCompletion is true", () => { expect(manager.canApproveCompletion).toBe(true); });
  it("FROM equals S.COMPLETED_PENDING_REVIEW", () => { expect(FROM).toBe(S.COMPLETED_PENDING_REVIEW); });
  it("TO equals S.APPROVED_COMPLETE", () => { expect(TO).toBe(S.APPROVED_COMPLETE); });
  it("planTaskTransition(FROM, TO, manager) returns an object", () => { expect(typeof planTaskTransition(FROM, TO, manager)).toBe("object"); });
  it("planTaskTransition(FROM, TO, manager).allowed is true", () => { expect(planTaskTransition(FROM, TO, manager).allowed).toBe(true); });
});

describe("planTaskTransition completion gate (Slice 3)", () => {
  it("allows completion when no context is supplied (backward compatible)", () => {
    expect(planTaskTransition(FROM, TO, manager).allowed).toBe(true);
  });

  it("blocks completion when required proof is not cleared", () => {
    const d = planTaskTransition(FROM, TO, manager, { proofRequired: true, proofCleared: false });
    expect(d.allowed).toBe(false);
    expect(d.reason).toMatch(/proof is not cleared/i);
  });

  it("allows completion when required proof is cleared", () => {
    expect(planTaskTransition(FROM, TO, manager, { proofRequired: true, proofCleared: true }).allowed).toBe(true);
  });

  it("blocks even an OWNER from completing without cleared proof", () => {
    expect(planTaskTransition(FROM, TO, owner, { proofRequired: true, proofCleared: false }).allowed).toBe(false);
  });

  it("allows an owner emergency override of the proof gate", () => {
    expect(planTaskTransition(FROM, TO, owner, { proofRequired: true, proofCleared: false, ownerOverride: true }).allowed).toBe(true);
  });

  it("enforces separation of duty: the performer cannot approve their own completion", () => {
    const d = planTaskTransition(FROM, TO, manager, { actorUserId: "u1", performerUserId: "u1" });
    expect(d.allowed).toBe(false);
    expect(d.reason).toMatch(/separation of duty/i);
  });

  it("allows a different approver than the performer", () => {
    expect(planTaskTransition(FROM, TO, manager, { actorUserId: "mgr", performerUserId: "emp" }).allowed).toBe(true);
  });
});
