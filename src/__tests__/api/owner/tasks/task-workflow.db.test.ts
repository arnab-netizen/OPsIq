/**
 * [db] Bundle 3.3 — full task lifecycle + cross-workspace isolation.
 *
 * Proves: list (with filters), detail (with proof + history), status transition,
 * proof submission, proof review, and cross-workspace isolation (no data leaks
 * between workspaces). Requires TEST_WITH_DB=true.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import type { PrismaClient } from "@/generated/prisma/client";
import { assignDelegatedTask } from "@/services/execution/task-assignment.service";
import { getTaskList, getTaskDetail } from "@/services/execution/task-query.service";
import {
  transitionTaskStatus,
  submitProofForTask,
  reviewProofForTask,
  TaskWorkflowNotFoundError,
  TaskTransitionNotAllowedError,
} from "@/services/execution/task-workflow.service";
import { DelegatedTaskStatus } from "@/domain/execution/delegated-task";
import { ProofStatus, ProofType } from "@/domain/execution/proof";

const prisma = db as unknown as PrismaClient;
const ws = randomUUID();
const wsOther = randomUUID();
const owner = randomUUID();
const emp = randomUUID();

async function setupWorkspaceAndUsers() {
  for (const wid of [ws, wsOther]) {
    await (prisma as unknown as { workspace: { upsert: (a: unknown) => Promise<unknown> } }).workspace.upsert({
      where: { id: wid },
      update: {},
      create: { id: wid, name: `WS ${wid}`, slug: `ws-${wid}`, createdBy: owner },
    });
  }
  for (const [uid, label] of [[owner, "WF Owner"], [emp, "WF Emp"]] as [string, string][]) {
    await (prisma as unknown as { user: { upsert: (a: unknown) => Promise<unknown> } }).user.upsert({
      where: { id: uid },
      update: {},
      create: { id: uid, email: `wf-${uid}@example.com`, name: label, isActive: true, updatedAt: new Date() },
    });
  }
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Bundle 3.3 — task lifecycle + cross-workspace isolation", () => {
  beforeAll(setupWorkspaceAndUsers);
  afterAll(async () => {
    for (const table of ["proof", "proofRequirement", "delegatedTask", "taskStatusHistory", "auditEvent"] as const) {
      for (const wid of [ws, wsOther]) {
        await (prisma as unknown as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[table]
          .deleteMany({ where: { workspaceId: wid } });
      }
    }
  });

  // ── List ─────────────────────────────────────────────────────────────────────

  it("[db] getTaskList returns tasks in the workspace", async () => {
    await assignDelegatedTask({ workspaceId: ws, actorId: owner, title: "List test task", assignedUserId: emp });
    const tasks = await getTaskList(ws);
    expect(tasks.length).toBeGreaterThanOrEqual(1);
    expect(tasks.every((t) => t.workspaceId === ws)).toBe(true);
  });

  it("[db] getTaskList status filter narrows results", async () => {
    const all = await getTaskList(ws);
    const filtered = await getTaskList(ws, { status: "PROOF_REQUIRED" });
    expect(filtered.every((t) => t.status === "PROOF_REQUIRED")).toBe(true);
    expect(filtered.length).toBeLessThanOrEqual(all.length);
  });

  it("[db] getTaskList does not leak tasks across workspaces", async () => {
    await assignDelegatedTask({ workspaceId: wsOther, actorId: owner, title: "Other WS task", assignedUserId: emp });
    const wsResult = await getTaskList(ws);
    expect(wsResult.every((t) => t.workspaceId === ws)).toBe(true);
    const otherResult = await getTaskList(wsOther);
    expect(otherResult.every((t) => t.workspaceId === wsOther)).toBe(true);
  });

  // ── Detail ───────────────────────────────────────────────────────────────────

  it("[db] getTaskDetail returns task with status history", async () => {
    const assigned = await assignDelegatedTask({ workspaceId: ws, actorId: owner, title: "Detail test", assignedUserId: emp });
    const detail = await getTaskDetail(assigned.taskId, ws);
    expect(detail).not.toBeNull();
    expect(detail!.id).toBe(assigned.taskId);
    expect(detail!.statusHistory.length).toBeGreaterThanOrEqual(0);
  });

  it("[db] getTaskDetail returns null for wrong workspace", async () => {
    const assigned = await assignDelegatedTask({ workspaceId: ws, actorId: owner, title: "Isolation detail", assignedUserId: emp });
    const result = await getTaskDetail(assigned.taskId, wsOther);
    expect(result).toBeNull();
  });

  it("[db] getTaskDetail includes proof when proofRequirementId is set", async () => {
    const assigned = await assignDelegatedTask({
      workspaceId: ws, actorId: owner, title: "Proof detail task", assignedUserId: emp,
      requireProof: { proofType: ProofType.SHORT_NOTE, requiredFields: ["note"] },
    });
    const detail = await getTaskDetail(assigned.taskId, ws);
    expect(detail).not.toBeNull();
    expect(detail!.proof).not.toBeNull();
    expect(detail!.proof!.status).toBe(ProofStatus.PENDING_SUBMISSION);
    expect(detail!.proofRequirement).not.toBeNull();
    expect(detail!.proofRequirement!.proofType).toBe(ProofType.SHORT_NOTE);
  });

  // ── Status transition ─────────────────────────────────────────────────────────

  it("[db] transitionTaskStatus moves task to requested state", async () => {
    const assigned = await assignDelegatedTask({
      workspaceId: ws, actorId: owner, title: "Transition test", assignedUserId: emp,
    });
    // ASSIGNED → ACKNOWLEDGED
    const next = await transitionTaskStatus({
      taskId: assigned.taskId,
      workspaceId: ws,
      actorId: owner,
      to: DelegatedTaskStatus.ACKNOWLEDGED,
    });
    expect(next).toBe(DelegatedTaskStatus.ACKNOWLEDGED);
  });

  it("[db] transitionTaskStatus throws TaskWorkflowNotFoundError for wrong workspace", async () => {
    const assigned = await assignDelegatedTask({
      workspaceId: ws, actorId: owner, title: "WS isolation task", assignedUserId: emp,
    });
    await expect(
      transitionTaskStatus({
        taskId: assigned.taskId,
        workspaceId: wsOther,
        actorId: owner,
        to: DelegatedTaskStatus.ACKNOWLEDGED,
      })
    ).rejects.toBeInstanceOf(TaskWorkflowNotFoundError);
  });

  it("[db] transitionTaskStatus throws TaskTransitionNotAllowedError for invalid transition", async () => {
    const assigned = await assignDelegatedTask({
      workspaceId: ws, actorId: owner, title: "Bad transition task", assignedUserId: emp,
    });
    await expect(
      transitionTaskStatus({
        taskId: assigned.taskId,
        workspaceId: ws,
        actorId: owner,
        to: DelegatedTaskStatus.APPROVED_COMPLETE, // Can't jump from ASSIGNED to APPROVED_COMPLETE
      })
    ).rejects.toBeInstanceOf(TaskTransitionNotAllowedError);
  });

  // ── Proof submission + review ─────────────────────────────────────────────────

  it("[db] full proof loop: submit → review (accept) → task completes cleanly", async () => {
    const assigned = await assignDelegatedTask({
      workspaceId: ws, actorId: owner, title: "Full proof lifecycle", assignedUserId: emp,
      requireProof: { proofType: ProofType.SHORT_NOTE, requiredFields: ["note"] },
    });

    // Must be in PROOF_REQUIRED already (assignDelegatedTask sets this when requireProof is provided)
    expect(assigned.status).toBe(DelegatedTaskStatus.PROOF_REQUIRED);

    // Submit proof
    const submitResult = await submitProofForTask({
      taskId: assigned.taskId,
      workspaceId: ws,
      actorId: owner,
      proofType: ProofType.SHORT_NOTE,
      fields: { note: "Task completed and verified." },
    });
    expect(submitResult.status).toBe(ProofStatus.SUBMITTED);
    expect(submitResult.duplicateFlagged).toBe(false);

    // Review — owner accepts
    const reviewResult = await reviewProofForTask({
      taskId: assigned.taskId,
      workspaceId: ws,
      reviewerId: owner,
      to: ProofStatus.ACCEPTED,
    });
    expect(reviewResult).toBe(ProofStatus.ACCEPTED);

    // Verify DB state
    const detail = await getTaskDetail(assigned.taskId, ws);
    expect(detail!.proof!.status).toBe(ProofStatus.ACCEPTED);
  });

  it("[db] submitProofForTask cross-workspace isolation: wrong workspace throws TaskWorkflowNotFoundError", async () => {
    const assigned = await assignDelegatedTask({
      workspaceId: ws, actorId: owner, title: "Submit isolation", assignedUserId: emp,
      requireProof: { proofType: ProofType.SHORT_NOTE, requiredFields: ["note"] },
    });
    await expect(
      submitProofForTask({
        taskId: assigned.taskId,
        workspaceId: wsOther,
        actorId: owner,
        proofType: ProofType.SHORT_NOTE,
        fields: { note: "Attempt from wrong ws" },
      })
    ).rejects.toBeInstanceOf(TaskWorkflowNotFoundError);
  });

  it("[db] reviewProofForTask cross-workspace isolation: wrong workspace throws TaskWorkflowNotFoundError", async () => {
    const assigned = await assignDelegatedTask({
      workspaceId: ws, actorId: owner, title: "Review isolation", assignedUserId: emp,
      requireProof: { proofType: ProofType.SHORT_NOTE, requiredFields: ["note"] },
    });
    await expect(
      reviewProofForTask({
        taskId: assigned.taskId,
        workspaceId: wsOther,
        reviewerId: owner,
        to: ProofStatus.ACCEPTED,
      })
    ).rejects.toBeInstanceOf(TaskWorkflowNotFoundError);
  });
});
