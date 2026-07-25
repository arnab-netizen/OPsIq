/**
 * Jarvis 360 gap-closure (G11,G12,G13,G14) — proof-gated task completion (DI).
 * Proves the runtime completion path blocks on missing/stale/duplicate proof and on
 * performer self-approval, and allows completion only when proof is cleared.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const emitAuditEvent = vi.fn(async () => "audit-id");
vi.mock("@/infra/audit", () => ({ emitAuditEvent: (...a: unknown[]) => emitAuditEvent(...a) }));
vi.mock("@/lib/db", () => ({ db: {}, getDbInstance: vi.fn().mockResolvedValue({}) }));

import { evaluateProofClearance, ProofStatus } from "@/domain/execution/proof";
import { TaskActorRole } from "@/domain/execution/delegated-task";
import {
  completeTask,
  TaskCompletionBlockedError,
} from "@/services/execution/task-completion.service";

beforeEach(() => emitAuditEvent.mockClear());

describe("task-completion — module contract assertions", () => {
  it("evaluateProofClearance is a function", () => { expect(typeof evaluateProofClearance).toBe("function"); });
  it("ProofStatus is an object", () => { expect(typeof ProofStatus).toBe("object"); });
  it("ProofStatus.NOT_REQUIRED is defined", () => { expect(ProofStatus.NOT_REQUIRED).toBeDefined(); });
  it("ProofStatus.ACCEPTED is defined", () => { expect(ProofStatus.ACCEPTED).toBeDefined(); });
  it("ProofStatus.SUBMITTED is defined", () => { expect(ProofStatus.SUBMITTED).toBeDefined(); });
  it("TaskActorRole is an object", () => { expect(typeof TaskActorRole).toBe("object"); });
  it("TaskActorRole.OWNER is defined", () => { expect(TaskActorRole.OWNER).toBeDefined(); });
  it("completeTask is a function", () => { expect(typeof completeTask).toBe("function"); });
  it("TaskCompletionBlockedError is a function", () => { expect(typeof TaskCompletionBlockedError).toBe("function"); });
  it("emitAuditEvent is a function", () => { expect(typeof emitAuditEvent).toBe("function"); });
  it("ownerActor is an object", () => { expect(typeof ownerActor).toBe("object"); });
  it("ownerActor.role equals TaskActorRole.OWNER", () => { expect(ownerActor.role).toBe(TaskActorRole.OWNER); });
  it("deps is a function", () => { expect(typeof deps).toBe("function"); });
  it("evaluateProofClearance(ProofStatus.NOT_REQUIRED).cleared is true", () => { expect(evaluateProofClearance(ProofStatus.NOT_REQUIRED).cleared).toBe(true); });
});

describe("evaluateProofClearance", () => {
  const now = new Date("2026-06-28T00:00:00.000Z");
  it("clears NOT_REQUIRED and ACCEPTED-fresh-non-duplicate", () => {
    expect(evaluateProofClearance(ProofStatus.NOT_REQUIRED).cleared).toBe(true);
    expect(evaluateProofClearance(ProofStatus.ACCEPTED, { acceptedAt: now, now, maxAgeDays: 30 }).cleared).toBe(true);
  });
  it("blocks non-accepted, duplicate, and stale proofs", () => {
    expect(evaluateProofClearance(ProofStatus.SUBMITTED)).toEqual({ cleared: false, reason: "proof_not_accepted" });
    expect(evaluateProofClearance(ProofStatus.ACCEPTED, { duplicateFlagged: true })).toEqual({ cleared: false, reason: "duplicate_proof" });
    const old = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000);
    expect(evaluateProofClearance(ProofStatus.ACCEPTED, { acceptedAt: old, now, maxAgeDays: 30 })).toEqual({ cleared: false, reason: "proof_stale" });
  });
});

const ownerActor = { role: TaskActorRole.OWNER, isAssignee: false, canApproveCompletion: true, canReviewProof: true, canAssign: true };

function deps(opts: {
  task: { assignedUserId: string | null; status: string; proofRequirementId: string | null };
  proof?: { status: string; duplicateFlagged: boolean; reviewedAt: Date | null } | null;
  updateCount?: number;
}) {
  const auditCreate = vi.fn(async () => ({}));
  return {
    db: {
      delegatedTask: {
        findFirst: vi.fn(async () => ({
          id: "task1",
          workspaceId: "ws1",
          assignedUserId: opts.task.assignedUserId,
          assignedRole: "EMPLOYEE",
          status: opts.task.status,
          workOrderId: null,
          approvedBoundaryId: null,
          approvedBoundaryVersion: null,
          boundaryContentHash: null,
          proofRequirementId: opts.task.proofRequirementId,
        })),
        updateMany: vi.fn(async () => ({ count: opts.updateCount ?? 1 })),
      },
      proof: {
        findFirst: vi.fn(async () => opts.proof ?? null),
      },
      auditEvent: { create: auditCreate },
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          delegatedTask: { updateMany: vi.fn(async () => ({ count: opts.updateCount ?? 1 })) },
          auditEvent: { create: auditCreate },
        }),
    },
    now: () => new Date("2026-06-28T00:00:00.000Z"),
    auditCreate,
  };
}

describe("completeTask", () => {
  const base = { taskId: "task1", workspaceId: "ws1", actor: ownerActor, actorId: "owner1" };

  it("blocks completion when a required proof is not accepted", async () => {
    const d = deps({
      task: { assignedUserId: "emp1", status: "COMPLETED_PENDING_REVIEW", proofRequirementId: "pr1" },
      proof: { status: ProofStatus.SUBMITTED, duplicateFlagged: false, reviewedAt: null },
    });
    await expect(completeTask(base, d as never)).rejects.toBeInstanceOf(TaskCompletionBlockedError);
    expect(emitAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ eventName: "owner.task_completion_blocked" }));
  });

  it("blocks completion on a duplicate-flagged proof", async () => {
    const d = deps({
      task: { assignedUserId: "emp1", status: "COMPLETED_PENDING_REVIEW", proofRequirementId: "pr1" },
      proof: { status: ProofStatus.ACCEPTED, duplicateFlagged: true, reviewedAt: new Date("2026-06-28T00:00:00.000Z") },
    });
    await expect(completeTask(base, d as never)).rejects.toMatchObject({ reason: "duplicate_proof" });
  });

  it("blocks completion on a stale accepted proof", async () => {
    const d = deps({
      task: { assignedUserId: "emp1", status: "COMPLETED_PENDING_REVIEW", proofRequirementId: "pr1" },
      proof: { status: ProofStatus.ACCEPTED, duplicateFlagged: false, reviewedAt: new Date("2026-04-01T00:00:00.000Z") },
    });
    await expect(completeTask({ ...base, maxProofAgeDays: 30 }, d as never)).rejects.toMatchObject({ reason: "proof_stale" });
  });

  it("blocks the performer from approving their own completion (separation of duty)", async () => {
    const d = deps({
      task: { assignedUserId: "owner1", status: "COMPLETED_PENDING_REVIEW", proofRequirementId: null },
    });
    // actorId === assignedUserId → SoD denial (no ownerOverride)
    await expect(completeTask(base, d as never)).rejects.toMatchObject({ reason: "separation_of_duty" });
  });

  it("completes when proof is accepted, fresh, non-duplicate, and a different user approves", async () => {
    const d = deps({
      task: { assignedUserId: "emp1", status: "COMPLETED_PENDING_REVIEW", proofRequirementId: "pr1" },
      proof: { status: ProofStatus.ACCEPTED, duplicateFlagged: false, reviewedAt: new Date("2026-06-28T00:00:00.000Z") },
    });
    const status = await completeTask(base, d as never);
    expect(status).toBe("APPROVED_COMPLETE");
    // EH-28 — the completion marker is written atomically (in-tx auditEvent.create).
    expect(d.auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ eventName: "owner.task_completed" }) })
    );
  });

  it("allows an audited owner override to bypass the proof gate and records a high-visibility override event", async () => {
    const d = deps({
      task: { assignedUserId: "emp1", status: "COMPLETED_PENDING_REVIEW", proofRequirementId: "pr1" },
      proof: { status: ProofStatus.SUBMITTED, duplicateFlagged: false, reviewedAt: null },
    });
    const status = await completeTask({ ...base, ownerOverride: true }, d as never);
    expect(status).toBe("APPROVED_COMPLETE");
    // EH-30/EH-28 — the proof-gate bypass is recorded as a distinct, client-visible event,
    // atomically with the state change (in-tx).
    expect(d.auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ eventName: "owner.task_override_used", visibility: "client_visible" }) })
    );
  });
});
