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
