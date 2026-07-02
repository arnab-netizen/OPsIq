/**
 * [db]-gated P1-A runtime-readiness proof — the delegated-task/proof CREATE PATH that closes blocker B5 (the proof
 * loop was production-inert: nothing created a task or proof requirement, so the completion gate could never demand
 * proof). Proves: assigning a task with a proof requirement wires proofRequirementId + a PENDING_SUBMISSION Proof;
 * completeTask is then BLOCKED until proof is accepted (the gate now fires); the assignee can submit against the
 * created proof (no more "Task not found"); the full submit→review→accept→complete loop closes; a no-proof task
 * completes freely; and everything is workspace-scoped. Requires TEST_WITH_DB=true.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import type { PrismaClient } from "@/generated/prisma/client";
import { assignDelegatedTask } from "@/services/execution/task-assignment.service";
import { completeTask, TaskCompletionBlockedError, TaskNotFoundError } from "@/services/execution/task-completion.service";
import { submitProof, reviewProof } from "@/services/execution/proof.service";
import { TaskActorRole, type TaskActor } from "@/domain/execution/delegated-task";
import { ProofStatus, ProofType, ProofRiskLevel, type ProofActor } from "@/domain/execution/proof";

const prisma = db as unknown as PrismaClient;
const ws = randomUUID();
const wsOther = randomUUID();
const owner = randomUUID();
const emp = randomUUID();
const system = randomUUID();

const ownerActor: TaskActor = { role: TaskActorRole.OWNER, isAssignee: false, canApproveCompletion: true, canReviewProof: true, canAssign: true };
const assigneeProof: ProofActor = { role: TaskActorRole.EMPLOYEE, isAssignee: true, canReviewProof: false };
const systemProof: ProofActor = { role: TaskActorRole.SYSTEM, isAssignee: false, canReviewProof: false };
const reviewerProof: ProofActor = { role: TaskActorRole.OWNER, isAssignee: false, canReviewProof: true };

const PROOF_REQ = { proofType: ProofType.PHOTO, requiredFields: ["note"] };
const requirement = { proofType: ProofType.PHOTO, requiredFields: ["note"], riskLevel: ProofRiskLevel.LOW };

async function toReviewState(taskId: string) {
  // Advance the task to the pre-completion review state. The full ASSIGNED→…→COMPLETED_PENDING_REVIEW lifecycle is
  // proven by the delegated-task FSM tests; here we isolate the PROOF GATE that completeTask enforces.
  await (prisma as unknown as { delegatedTask: { update: (a: unknown) => Promise<unknown> } }).delegatedTask.update({
    where: { id: taskId }, data: { status: "COMPLETED_PENDING_REVIEW", updatedAt: new Date() },
  });
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] P1-A delegated-task proof loop is no longer inert", () => {
  beforeAll(async () => {
    for (const wid of [ws, wsOther]) {
      await (prisma as unknown as { workspace: { upsert: (a: unknown) => Promise<unknown> } }).workspace.upsert({
        where: { id: wid }, update: {}, create: { id: wid, name: `WS ${wid}`, slug: `ws-${wid}`, createdBy: owner },
      });
    }
    for (const [uid, label] of [[owner, "P1A Owner"], [emp, "P1A Emp"], [system, "P1A System"]] as const) {
      await (prisma as unknown as { user: { upsert: (a: unknown) => Promise<unknown> } }).user.upsert({
        where: { id: uid }, update: {}, create: { id: uid, email: `p1a-${uid}@example.com`, name: label, isActive: true, updatedAt: new Date() },
      });
    }
  });
  afterAll(async () => {
    for (const t of ["proof", "proofRequirement", "delegatedTask", "auditEvent"] as const) {
      await (prisma as unknown as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[t].deleteMany({ where: { workspaceId: ws } });
      await (prisma as unknown as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[t].deleteMany({ where: { workspaceId: wsOther } });
    }
  });

  it("[db] assigning with a proof requirement wires proofRequirementId + a PENDING_SUBMISSION Proof", async () => {
    const t = await assignDelegatedTask({ workspaceId: ws, actorId: owner, title: "Clean machine A", assignedUserId: emp, requireProof: PROOF_REQ });
    expect(t.status).toBe("PROOF_REQUIRED");
    expect(t.proofRequirementId).not.toBeNull();
    expect(t.proofId).not.toBeNull();
    const row = await prisma.delegatedTask.findUnique({ where: { id: t.taskId } });
    expect(row?.proofRequirementId).toBe(t.proofRequirementId);
    const proof = await prisma.proof.findFirst({ where: { taskId: t.taskId } });
    expect(proof?.status).toBe(ProofStatus.PENDING_SUBMISSION);
  });

  it("[db] B5 fix: completeTask is BLOCKED while proof is required and not accepted", async () => {
    const t = await assignDelegatedTask({ workspaceId: ws, actorId: owner, title: "Deliver order 42", assignedUserId: emp, requireProof: PROOF_REQ });
    await toReviewState(t.taskId);
    await expect(completeTask({ taskId: t.taskId, workspaceId: ws, actor: ownerActor, actorId: owner }))
      .rejects.toBeInstanceOf(TaskCompletionBlockedError);
  });

  it("[db] the assignee can submit proof against the created task (no more 'Task not found')", async () => {
    const t = await assignDelegatedTask({ workspaceId: ws, actorId: owner, title: "Fix leak", assignedUserId: emp, requireProof: PROOF_REQ });
    const res = await submitProof({
      proofId: t.proofId!, taskId: t.taskId, workspaceId: ws, fromStatus: ProofStatus.PENDING_SUBMISSION, requirement,
      submission: { proofType: ProofType.PHOTO, fields: { note: "done" }, fileHash: "hash-a", submittedByUserId: emp }, actor: assigneeProof,
    });
    expect(res.status).toBe(ProofStatus.SUBMITTED);
  });

  it("[db] the loop CLOSES: submit → precheck → accept → completeTask succeeds", async () => {
    const t = await assignDelegatedTask({ workspaceId: ws, actorId: owner, title: "Repair unit", assignedUserId: emp, requireProof: PROOF_REQ });
    await submitProof({
      proofId: t.proofId!, taskId: t.taskId, workspaceId: ws, fromStatus: ProofStatus.PENDING_SUBMISSION, requirement,
      submission: { proofType: ProofType.PHOTO, fields: { note: "done" }, fileHash: "hash-b", submittedByUserId: emp }, actor: assigneeProof,
    });
    await reviewProof({ proofId: t.proofId!, workspaceId: ws, fromStatus: ProofStatus.SUBMITTED, to: ProofStatus.AI_PRECHECK_PASSED, actor: systemProof, actorId: system });
    await reviewProof({ proofId: t.proofId!, workspaceId: ws, fromStatus: ProofStatus.AI_PRECHECK_PASSED, to: ProofStatus.ACCEPTED, actor: reviewerProof, actorId: owner });
    await toReviewState(t.taskId);
    const status = await completeTask({ taskId: t.taskId, workspaceId: ws, actor: ownerActor, actorId: owner });
    expect(status).toBe("APPROVED_COMPLETE");
  });

  it("[db] a task assigned WITHOUT a proof requirement completes freely (gate does not block)", async () => {
    const t = await assignDelegatedTask({ workspaceId: ws, actorId: owner, title: "Restock counter", assignedUserId: emp });
    expect(t.proofRequirementId).toBeNull();
    await toReviewState(t.taskId);
    const status = await completeTask({ taskId: t.taskId, workspaceId: ws, actor: ownerActor, actorId: owner });
    expect(status).toBe("APPROVED_COMPLETE");
  });

  it("[db] workspace isolation: a task is invisible / not completable under another workspace", async () => {
    const t = await assignDelegatedTask({ workspaceId: ws, actorId: owner, title: "Scoped task", assignedUserId: emp });
    await toReviewState(t.taskId);
    await expect(completeTask({ taskId: t.taskId, workspaceId: wsOther, actor: ownerActor, actorId: owner }))
      .rejects.toBeInstanceOf(TaskNotFoundError);
  });
});
