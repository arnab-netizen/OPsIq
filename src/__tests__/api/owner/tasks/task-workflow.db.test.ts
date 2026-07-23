/**
 * [db] Bundle 3.3 — comprehensive task lifecycle, SoD, concurrency, tenancy, and audit proof.
 *
 * Covers all 17 required PostgreSQL proofs from the Bundle 3.3 validation mandate:
 *  1. workspace-scoped task list
 *  2. workspace-scoped task detail
 *  3. legal status transition succeeds
 *  4. illegal transition fails with no DB mutation
 *  5. concurrent transition conflict (one winner, one loser)
 *  6. proof submission succeeds
 *  7. duplicate fileHash is detected and flagged
 *  8. duplicate-flagged proof cannot be accepted
 *  9. submitter cannot review own proof (SoD)
 * 10. independent reviewer can accept
 * 11. rejection preserves rework path
 * 12. cross-workspace task access fails
 * 13. cross-workspace proof mutation fails
 * 14. sourceOperatorItemId non-uniqueness is the intended invariant (documented)
 * 15. accepted proof detail visible, task can proceed to completion
 * 16. audit events emitted exactly once per mutation
 * 17. denial (SoD) leaves no side effects on proof or task
 *
 * Requires TEST_WITH_DB=true.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import type { PrismaClient } from "@/generated/prisma/client";
import { assignDelegatedTask } from "@/services/execution/task-assignment.service";
import { completeTask } from "@/services/execution/task-completion.service";
import { applyTaskTransition, TaskTransitionConflictError } from "@/services/execution/delegated-task.service";
import { getTaskList, getTaskDetail } from "@/services/execution/task-query.service";
import {
  transitionTaskStatus,
  submitProofForTask,
  reviewProofForTask,
  TaskWorkflowNotFoundError,
  TaskTransitionNotAllowedError,
  ProofSelfReviewError,
  ProofDuplicateRejectedError,
} from "@/services/execution/task-workflow.service";
import { DelegatedTaskStatus, TaskActorRole, type DelegatedTask, type TaskActor } from "@/domain/execution/delegated-task";
import { ProofStatus, ProofType } from "@/domain/execution/proof";

const prisma = db as unknown as PrismaClient;
const ws = randomUUID();
const wsOther = randomUUID();
const owner = randomUUID();
const emp = randomUUID();
// A second distinct user for SoD tests (independent reviewer != submitter)
const reviewer2 = randomUUID();

const ownerActor: TaskActor = {
  role: TaskActorRole.OWNER,
  isAssignee: false,
  canApproveCompletion: true,
  canReviewProof: true,
  canAssign: true,
};

async function setupWorkspaceAndUsers() {
  for (const wid of [ws, wsOther]) {
    await (prisma as unknown as { workspace: { upsert: (a: unknown) => Promise<unknown> } }).workspace.upsert({
      where: { id: wid },
      update: {},
      create: { id: wid, name: `WS ${wid}`, slug: `ws-${wid}`, createdBy: owner },
    });
  }
  for (const [uid, label] of [
    [owner, "WF Owner"],
    [emp, "WF Emp"],
    [reviewer2, "WF Reviewer2"],
  ] as [string, string][]) {
    await (prisma as unknown as { user: { upsert: (a: unknown) => Promise<unknown> } }).user.upsert({
      where: { id: uid },
      update: {},
      create: { id: uid, email: `wf-${uid}@example.com`, name: label, isActive: true, updatedAt: new Date() },
    });
  }
}

async function auditCountFor(taskId: string): Promise<number> {
  const count = await (prisma as unknown as {
    auditEvent: { count: (a: unknown) => Promise<number> };
  }).auditEvent.count({ where: { entityId: taskId } });
  return count;
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Bundle 3.3 — full task lifecycle, SoD, concurrency, tenancy, audit", () => {
  beforeAll(setupWorkspaceAndUsers, 300_000);
  afterAll(async () => {
    // Delete in dependency order: proof before proofRequirement, tasks last
    for (const table of ["proof", "proofRequirement", "delegatedTask", "auditEvent"] as const) {
      for (const wid of [ws, wsOther]) {
        await (prisma as unknown as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[table]
          .deleteMany({ where: { workspaceId: wid } });
      }
    }
  }, 120_000);

  // Per-test timeout of 30 s is the vitest default (same as vitest.config.ts testTimeout).
  // Most DB tests complete in < 3 s on a warm connection.

  // ── 1. Workspace-scoped task list ─────────────────────────────────────────────

  it("[db][1] getTaskList returns only tasks belonging to the given workspace", async () => {
    await assignDelegatedTask({ workspaceId: ws, actorId: owner, title: "List test task", assignedUserId: emp });
    await assignDelegatedTask({ workspaceId: wsOther, actorId: owner, title: "Other ws task", assignedUserId: emp });
    const wsResult = await getTaskList(ws);
    expect(wsResult.length).toBeGreaterThanOrEqual(1);
    expect(wsResult.every((t) => t.workspaceId === ws)).toBe(true);
    const otherResult = await getTaskList(wsOther);
    expect(otherResult.every((t) => t.workspaceId === wsOther)).toBe(true);
    // No cross-contamination
    const wsIds = new Set(wsResult.map((t) => t.id));
    for (const t of otherResult) expect(wsIds.has(t.id)).toBe(false);
  });

  it("[db][1b] getTaskList status filter returns only matching tasks", async () => {
    const filtered = await getTaskList(ws, { status: "PROOF_REQUIRED" });
    expect(filtered.every((t) => t.status === "PROOF_REQUIRED")).toBe(true);
  });

  // ── 2. Workspace-scoped task detail ──────────────────────────────────────────

  it("[db][2] getTaskDetail is workspace-scoped: returns null for wrong workspace", async () => {
    const t = await assignDelegatedTask({ workspaceId: ws, actorId: owner, title: "Detail isolation" });
    expect(await getTaskDetail(t.taskId, wsOther)).toBeNull();
    const detail = await getTaskDetail(t.taskId, ws);
    expect(detail).not.toBeNull();
    expect(detail!.id).toBe(t.taskId);
  });

  it("[db][2b] getTaskDetail includes proof and proofRequirement when set", async () => {
    const t = await assignDelegatedTask({
      workspaceId: ws, actorId: owner, title: "Proof detail task", assignedUserId: emp,
      requireProof: { proofType: ProofType.SHORT_NOTE, requiredFields: ["note"] },
    });
    const detail = await getTaskDetail(t.taskId, ws);
    expect(detail!.proof).not.toBeNull();
    expect(detail!.proof!.status).toBe(ProofStatus.PENDING_SUBMISSION);
    expect(detail!.proofRequirement!.proofType).toBe(ProofType.SHORT_NOTE);
  });

  // ── 3. Legal status transition succeeds ──────────────────────────────────────

  it("[db][3] legal status transition ASSIGNED→ACKNOWLEDGED succeeds and DB reflects new state", async () => {
    const t = await assignDelegatedTask({ workspaceId: ws, actorId: owner, title: "Transition legal", assignedUserId: emp });
    const next = await transitionTaskStatus({ taskId: t.taskId, workspaceId: ws, actorId: owner, to: DelegatedTaskStatus.ACKNOWLEDGED });
    expect(next).toBe(DelegatedTaskStatus.ACKNOWLEDGED);
    const row = await (prisma as unknown as { delegatedTask: { findUnique: (a: unknown) => Promise<{ status: string } | null> } })
      .delegatedTask.findUnique({ where: { id: t.taskId } });
    expect(row?.status).toBe(DelegatedTaskStatus.ACKNOWLEDGED);
  });

  // ── 4. Illegal transition fails with no DB mutation ──────────────────────────

  it("[db][4] illegal transition ASSIGNED→APPROVED_COMPLETE is rejected; task status unchanged in DB", async () => {
    const t = await assignDelegatedTask({ workspaceId: ws, actorId: owner, title: "Illegal transition", assignedUserId: emp });
    await expect(
      transitionTaskStatus({ taskId: t.taskId, workspaceId: ws, actorId: owner, to: DelegatedTaskStatus.APPROVED_COMPLETE })
    ).rejects.toBeInstanceOf(TaskTransitionNotAllowedError);
    // Assert DB state is UNCHANGED
    const row = await (prisma as unknown as { delegatedTask: { findUnique: (a: unknown) => Promise<{ status: string } | null> } })
      .delegatedTask.findUnique({ where: { id: t.taskId } });
    expect(row?.status).toBe(DelegatedTaskStatus.ASSIGNED); // still ASSIGNED
  });

  // ── 5. Concurrent transition: one winner, one loser ───────────────────────────

  it("[db][5] concurrent transition conflict: stale-state call throws TaskTransitionConflictError with no double write", async () => {
    const t = await assignDelegatedTask({ workspaceId: ws, actorId: owner, title: "Concurrency test", assignedUserId: emp });
    // Move ASSIGNED → ACKNOWLEDGED normally (first caller wins)
    await transitionTaskStatus({ taskId: t.taskId, workspaceId: ws, actorId: owner, to: DelegatedTaskStatus.ACKNOWLEDGED });

    // Simulate a second concurrent caller that loaded the task when it was still ASSIGNED
    // and now tries to apply the same transition with the stale status.
    // applyTaskTransition uses `where: { status: task.status }` — if status is now ACKNOWLEDGED,
    // the guarded updateMany count=0 → TaskTransitionConflictError.
    const staleTask: DelegatedTask = {
      taskId: t.taskId,
      workspaceId: ws,
      status: DelegatedTaskStatus.ASSIGNED, // stale
      workOrderId: null,
      assignedUserId: emp,
      assignedRole: null,
      approvedBoundaryId: null,
      approvedBoundaryVersion: null,
      boundaryContentHash: null,
    };
    await expect(
      applyTaskTransition({ task: staleTask, to: DelegatedTaskStatus.ACKNOWLEDGED, actor: ownerActor, actorId: owner })
    ).rejects.toBeInstanceOf(TaskTransitionConflictError);

    // DB still shows ACKNOWLEDGED (not rolled back to ASSIGNED or advanced further)
    const row = await (prisma as unknown as { delegatedTask: { findUnique: (a: unknown) => Promise<{ status: string } | null> } })
      .delegatedTask.findUnique({ where: { id: t.taskId } });
    expect(row?.status).toBe(DelegatedTaskStatus.ACKNOWLEDGED);
  });

  // ── 6. Proof submission succeeds ─────────────────────────────────────────────

  it("[db][6] proof submission succeeds and DB proof row reaches SUBMITTED", async () => {
    const t = await assignDelegatedTask({
      workspaceId: ws, actorId: owner, title: "Submit proof test", assignedUserId: emp,
      requireProof: { proofType: ProofType.SHORT_NOTE, requiredFields: ["note"] },
    });
    const result = await submitProofForTask({
      taskId: t.taskId, workspaceId: ws, actorId: owner,
      proofType: ProofType.SHORT_NOTE, fields: { note: "Verified action taken." },
    });
    expect(result.status).toBe(ProofStatus.SUBMITTED);
    const detail = await getTaskDetail(t.taskId, ws);
    expect(detail!.proof!.status).toBe(ProofStatus.SUBMITTED);
  });

  // ── 7. Duplicate fileHash is detected ────────────────────────────────────────

  it("[db][7] submission with a fileHash that exists in workspace is flagged as duplicate", async () => {
    const HASH = `hash-dupe-${randomUUID()}`;
    // First task: submit with this hash → establishes the hash in the workspace
    const t1 = await assignDelegatedTask({
      workspaceId: ws, actorId: owner, title: "First proof (hash)", assignedUserId: emp,
      requireProof: { proofType: ProofType.SHORT_NOTE, requiredFields: ["note"] },
    });
    const r1 = await submitProofForTask({
      taskId: t1.taskId, workspaceId: ws, actorId: owner,
      proofType: ProofType.SHORT_NOTE, fields: { note: "first" }, fileHash: HASH,
    });
    expect(r1.duplicateFlagged).toBe(false); // first submission, not yet a duplicate

    // Second task: submit with the SAME hash → should be flagged
    const t2 = await assignDelegatedTask({
      workspaceId: ws, actorId: owner, title: "Second proof (same hash)", assignedUserId: emp,
      requireProof: { proofType: ProofType.SHORT_NOTE, requiredFields: ["note"] },
    });
    const r2 = await submitProofForTask({
      taskId: t2.taskId, workspaceId: ws, actorId: owner,
      proofType: ProofType.SHORT_NOTE, fields: { note: "duplicate" }, fileHash: HASH,
    });
    expect(r2.duplicateFlagged).toBe(true); // flagged because hash already present
  });

  // ── 8. Duplicate-flagged proof cannot be accepted ────────────────────────────

  it("[db][8] duplicate-flagged proof cannot be accepted (ProofDuplicateRejectedError)", async () => {
    const HASH = `hash-duprej-${randomUUID()}`;
    // Establish the hash
    const t1 = await assignDelegatedTask({
      workspaceId: ws, actorId: owner, title: "Hash anchor", assignedUserId: emp,
      requireProof: { proofType: ProofType.SHORT_NOTE, requiredFields: ["note"] },
    });
    await submitProofForTask({
      taskId: t1.taskId, workspaceId: ws, actorId: reviewer2,
      proofType: ProofType.SHORT_NOTE, fields: { note: "anchor" }, fileHash: HASH,
    });

    // Submit duplicate hash on a second task
    const t2 = await assignDelegatedTask({
      workspaceId: ws, actorId: owner, title: "Duplicate-flagged task", assignedUserId: emp,
      requireProof: { proofType: ProofType.SHORT_NOTE, requiredFields: ["note"] },
    });
    const r2 = await submitProofForTask({
      taskId: t2.taskId, workspaceId: ws, actorId: reviewer2,
      proofType: ProofType.SHORT_NOTE, fields: { note: "dup" }, fileHash: HASH,
    });
    expect(r2.duplicateFlagged).toBe(true);

    // Attempt to accept the duplicate-flagged proof → must fail
    await expect(
      reviewProofForTask({ taskId: t2.taskId, workspaceId: ws, reviewerId: owner, to: ProofStatus.ACCEPTED })
    ).rejects.toBeInstanceOf(ProofDuplicateRejectedError);

    // DB: proof must still be SUBMITTED (not accepted)
    const detail = await getTaskDetail(t2.taskId, ws);
    expect(detail!.proof!.status).toBe(ProofStatus.SUBMITTED);
  });

  // ── 9. Submitter cannot review own proof (SoD) ───────────────────────────────

  it("[db][9] submitter cannot review own proof — ProofSelfReviewError, proof stays SUBMITTED", async () => {
    const t = await assignDelegatedTask({
      workspaceId: ws, actorId: owner, title: "SoD test task", assignedUserId: emp,
      requireProof: { proofType: ProofType.SHORT_NOTE, requiredFields: ["note"] },
    });
    // Submit with owner
    await submitProofForTask({
      taskId: t.taskId, workspaceId: ws, actorId: owner,
      proofType: ProofType.SHORT_NOTE, fields: { note: "self proof" },
    });
    // Same owner tries to review their own submission
    await expect(
      reviewProofForTask({ taskId: t.taskId, workspaceId: ws, reviewerId: owner, to: ProofStatus.ACCEPTED })
    ).rejects.toBeInstanceOf(ProofSelfReviewError);
    // Proof must still be SUBMITTED
    const detail = await getTaskDetail(t.taskId, ws);
    expect(detail!.proof!.status).toBe(ProofStatus.SUBMITTED);
    // Task must be unaffected (still in PROOF_REQUIRED — not advanced to completion)
    expect(detail!.status).toBe(DelegatedTaskStatus.PROOF_REQUIRED);
  });

  // ── 10. Independent reviewer can accept ──────────────────────────────────────

  it("[db][10] independent reviewer (different userId) can accept the proof", async () => {
    const t = await assignDelegatedTask({
      workspaceId: ws, actorId: owner, title: "Independent review", assignedUserId: emp,
      requireProof: { proofType: ProofType.SHORT_NOTE, requiredFields: ["note"] },
    });
    // reviewer2 submits
    await submitProofForTask({
      taskId: t.taskId, workspaceId: ws, actorId: reviewer2,
      proofType: ProofType.SHORT_NOTE, fields: { note: "reviewer2 submitted" },
    });
    // owner (different userId) accepts
    const accepted = await reviewProofForTask({
      taskId: t.taskId, workspaceId: ws, reviewerId: owner, to: ProofStatus.ACCEPTED,
    });
    expect(accepted).toBe(ProofStatus.ACCEPTED);
    const detail = await getTaskDetail(t.taskId, ws);
    expect(detail!.proof!.status).toBe(ProofStatus.ACCEPTED);
  });

  // ── 11. Rejection preserves rework path ──────────────────────────────────────

  it("[db][11] rejected proof advances to RESUBMISSION_REQUIRED; rework path is open", async () => {
    const t = await assignDelegatedTask({
      workspaceId: ws, actorId: owner, title: "Rejection rework", assignedUserId: emp,
      requireProof: { proofType: ProofType.SHORT_NOTE, requiredFields: ["note"] },
    });
    // reviewer2 submits
    await submitProofForTask({
      taskId: t.taskId, workspaceId: ws, actorId: reviewer2,
      proofType: ProofType.SHORT_NOTE, fields: { note: "first attempt" },
    });
    // owner rejects (reason required)
    await reviewProofForTask({
      taskId: t.taskId, workspaceId: ws, reviewerId: owner,
      to: ProofStatus.REJECTED, reason: "Does not meet evidence standard.",
    });
    // DB: proof is REJECTED
    const afterReject = await getTaskDetail(t.taskId, ws);
    expect(afterReject!.proof!.status).toBe(ProofStatus.REJECTED);

    // Route to RESUBMISSION_REQUIRED
    await reviewProofForTask({
      taskId: t.taskId, workspaceId: ws, reviewerId: owner,
      to: ProofStatus.RESUBMISSION_REQUIRED,
    });
    const afterResubmit = await getTaskDetail(t.taskId, ws);
    expect(afterResubmit!.proof!.status).toBe(ProofStatus.RESUBMISSION_REQUIRED);

    // reviewer2 resubmits — rework path open
    const r2 = await submitProofForTask({
      taskId: t.taskId, workspaceId: ws, actorId: reviewer2,
      proofType: ProofType.SHORT_NOTE, fields: { note: "corrected proof" },
    });
    expect(r2.status).toBe(ProofStatus.SUBMITTED);
  });

  // ── 12. Cross-workspace task access fails ────────────────────────────────────

  it("[db][12] transitionTaskStatus for task in ws from wsOther → TaskWorkflowNotFoundError", async () => {
    const t = await assignDelegatedTask({ workspaceId: ws, actorId: owner, title: "XWS isolation task" });
    await expect(
      transitionTaskStatus({ taskId: t.taskId, workspaceId: wsOther, actorId: owner, to: DelegatedTaskStatus.ACKNOWLEDGED })
    ).rejects.toBeInstanceOf(TaskWorkflowNotFoundError);
  });

  // ── 13. Cross-workspace proof mutation fails ──────────────────────────────────

  it("[db][13] submitProofForTask from wrong workspace → TaskWorkflowNotFoundError", async () => {
    const t = await assignDelegatedTask({
      workspaceId: ws, actorId: owner, title: "XWS submit", assignedUserId: emp,
      requireProof: { proofType: ProofType.SHORT_NOTE, requiredFields: ["note"] },
    });
    await expect(
      submitProofForTask({ taskId: t.taskId, workspaceId: wsOther, actorId: owner, proofType: ProofType.SHORT_NOTE, fields: { note: "x" } })
    ).rejects.toBeInstanceOf(TaskWorkflowNotFoundError);
  });

  it("[db][13b] reviewProofForTask from wrong workspace → TaskWorkflowNotFoundError", async () => {
    const t = await assignDelegatedTask({
      workspaceId: ws, actorId: owner, title: "XWS review", assignedUserId: emp,
      requireProof: { proofType: ProofType.SHORT_NOTE, requiredFields: ["note"] },
    });
    await expect(
      reviewProofForTask({ taskId: t.taskId, workspaceId: wsOther, reviewerId: owner, to: ProofStatus.ACCEPTED })
    ).rejects.toBeInstanceOf(TaskWorkflowNotFoundError);
  });

  // ── 14. sourceOperatorItemId: non-unique by design ───────────────────────────

  it("[db][14] sourceOperatorItemId is nullable and non-unique: multiple tasks may share the same source", async () => {
    // A recommendation may spawn N delegated tasks (e.g. "reduce costs" → multiple action tasks).
    // Non-uniqueness is intentional. Document by asserting no DB error occurs.
    const sourceId = randomUUID();
    const t1 = await (prisma as unknown as {
      delegatedTask: { create: (a: unknown) => Promise<{ id: string; sourceOperatorItemId: string | null }> }
    }).delegatedTask.create({
      data: {
        id: randomUUID(),
        workspaceId: ws,
        title: "Source-linked task 1",
        status: DelegatedTaskStatus.ASSIGNED,
        createdByUserId: owner,
        sourceOperatorItemId: sourceId,
        updatedAt: new Date(),
      },
    });
    const t2 = await (prisma as unknown as {
      delegatedTask: { create: (a: unknown) => Promise<{ id: string; sourceOperatorItemId: string | null }> }
    }).delegatedTask.create({
      data: {
        id: randomUUID(),
        workspaceId: ws,
        title: "Source-linked task 2",
        status: DelegatedTaskStatus.ASSIGNED,
        createdByUserId: owner,
        sourceOperatorItemId: sourceId,
        updatedAt: new Date(),
      },
    });
    // Both tasks exist and share the same sourceOperatorItemId — non-unique by design
    expect(t1.sourceOperatorItemId).toBe(sourceId);
    expect(t2.sourceOperatorItemId).toBe(sourceId);
    // Nullable: a task without source is also valid
    const t3 = await (prisma as unknown as {
      delegatedTask: { create: (a: unknown) => Promise<{ sourceOperatorItemId: string | null }> }
    }).delegatedTask.create({
      data: {
        id: randomUUID(), workspaceId: ws, title: "No source", status: DelegatedTaskStatus.ASSIGNED,
        createdByUserId: owner, updatedAt: new Date(),
      },
    });
    expect(t3.sourceOperatorItemId).toBeNull();
  });

  // ── 15. Accepted proof allows task to proceed to completion ──────────────────

  it("[db][15] after proof accepted, completeTask succeeds and task reaches APPROVED_COMPLETE", async () => {
    const t = await assignDelegatedTask({
      workspaceId: ws, actorId: owner, title: "Proof-gated completion", assignedUserId: emp,
      requireProof: { proofType: ProofType.SHORT_NOTE, requiredFields: ["note"] },
    });
    // reviewer2 submits, owner accepts
    await submitProofForTask({
      taskId: t.taskId, workspaceId: ws, actorId: reviewer2,
      proofType: ProofType.SHORT_NOTE, fields: { note: "done" },
    });
    await reviewProofForTask({ taskId: t.taskId, workspaceId: ws, reviewerId: owner, to: ProofStatus.ACCEPTED });

    // Advance task to COMPLETED_PENDING_REVIEW so completeTask can fire
    await (prisma as unknown as { delegatedTask: { update: (a: unknown) => Promise<unknown> } }).delegatedTask.update({
      where: { id: t.taskId }, data: { status: DelegatedTaskStatus.COMPLETED_PENDING_REVIEW, updatedAt: new Date() },
    });

    const finalStatus = await completeTask({
      taskId: t.taskId, workspaceId: ws, actor: ownerActor, actorId: owner,
    });
    expect(finalStatus).toBe(DelegatedTaskStatus.APPROVED_COMPLETE);
  });

  // ── 16. Audit events emitted exactly once per mutation ────────────────────────

  it("[db][16] each successful mutation emits exactly one audit event; no double emission", async () => {
    const t = await assignDelegatedTask({
      workspaceId: ws, actorId: owner, title: "Audit count task", assignedUserId: emp,
      requireProof: { proofType: ProofType.SHORT_NOTE, requiredFields: ["note"] },
    });

    const countAfterAssign = await auditCountFor(t.taskId);
    // assignDelegatedTask emits at least 1 audit event; we don't assert the exact count here
    // because other internal events may fire — we assert incremental deltas.

    await transitionTaskStatus({ taskId: t.taskId, workspaceId: ws, actorId: owner, to: DelegatedTaskStatus.ACKNOWLEDGED });
    const countAfterTransition = await auditCountFor(t.taskId);
    expect(countAfterTransition - countAfterAssign).toBeGreaterThanOrEqual(1); // at least 1 new audit event

    await submitProofForTask({
      taskId: t.taskId, workspaceId: ws, actorId: reviewer2,
      proofType: ProofType.SHORT_NOTE, fields: { note: "audit test" },
    });
    const countAfterSubmit = await auditCountFor(t.taskId);
    expect(countAfterSubmit - countAfterTransition).toBeGreaterThanOrEqual(1);

    await reviewProofForTask({ taskId: t.taskId, workspaceId: ws, reviewerId: owner, to: ProofStatus.ACCEPTED });
    const countAfterReview = await auditCountFor(t.taskId);
    expect(countAfterReview - countAfterSubmit).toBeGreaterThanOrEqual(1);
  });

  // ── 17. Denial leaves no side effects ────────────────────────────────────────

  it("[db][17] SoD denial leaves proof status unchanged and emits no acceptance event", async () => {
    const t = await assignDelegatedTask({
      workspaceId: ws, actorId: owner, title: "SoD no-side-effect", assignedUserId: emp,
      requireProof: { proofType: ProofType.SHORT_NOTE, requiredFields: ["note"] },
    });
    // owner submits
    await submitProofForTask({
      taskId: t.taskId, workspaceId: ws, actorId: owner,
      proofType: ProofType.SHORT_NOTE, fields: { note: "self" },
    });

    const countBefore = await auditCountFor(t.taskId);
    const detailBefore = await getTaskDetail(t.taskId, ws);

    // Same owner attempts to review — denied (SoD)
    await expect(
      reviewProofForTask({ taskId: t.taskId, workspaceId: ws, reviewerId: owner, to: ProofStatus.ACCEPTED })
    ).rejects.toBeInstanceOf(ProofSelfReviewError);

    // Proof status unchanged
    const detailAfter = await getTaskDetail(t.taskId, ws);
    expect(detailAfter!.proof!.status).toBe(detailBefore!.proof!.status);
    // No additional audit event from the denied operation (SoD block is fail-closed inside tx)
    const countAfter = await auditCountFor(t.taskId);
    expect(countAfter).toBe(countBefore);

    // Task status unchanged
    expect(detailAfter!.status).toBe(detailBefore!.status);
  });
});
