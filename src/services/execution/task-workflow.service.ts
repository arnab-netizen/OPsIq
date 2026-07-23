/**
 * Task workflow service — orchestration layer for status transitions, proof
 * submission, and proof review on delegated tasks.
 *
 * This layer handles DB look-ups and actor construction, then delegates to the
 * proven FSM services (applyTaskTransition, submitProof, reviewProof). No
 * transition or review logic lives here.  All routes call this; no transition
 * logic in routes.
 */

import { db } from "@/lib/db";
import { enforceWorkspaceId } from "@/lib/workspace-validation";
import { DelegatedTaskStatus, TaskActorRole, type DelegatedTask, type TaskActor } from "@/domain/execution/delegated-task";
import { ProofStatus, ProofType, type ProofActor, type ProofRequirement, type ProofSubmission } from "@/domain/execution/proof";
import { TaskTransitionNotAllowedError, TaskTransitionConflictError } from "@/services/execution/delegated-task.service";
import { runTaskTransition } from "@/services/execution/task-completion.service";
import { submitProof, reviewProof, ProofValidationError, ProofTransitionNotAllowedError, ProofSelfReviewError, ProofDuplicateRejectedError, ProofConflictError } from "@/services/execution/proof.service";

export { TaskTransitionNotAllowedError, TaskTransitionConflictError };
export { ProofValidationError, ProofTransitionNotAllowedError, ProofSelfReviewError, ProofDuplicateRejectedError, ProofConflictError };

export class TaskWorkflowNotFoundError extends Error {
  readonly code = "TASK_NOT_FOUND";
  constructor(taskId: string) {
    super(`Task ${taskId} not found in workspace.`);
    this.name = "TaskWorkflowNotFoundError";
  }
}
export class ProofNotFoundError extends Error {
  readonly code = "PROOF_NOT_FOUND";
  constructor(taskId: string) {
    super(`No proof found for task ${taskId}.`);
    this.name = "ProofNotFoundError";
  }
}
export class ProofRequirementNotFoundError extends Error {
  readonly code = "PROOF_REQUIREMENT_NOT_FOUND";
  constructor(taskId: string) {
    super(`No proof requirement found for task ${taskId}.`);
    this.name = "ProofRequirementNotFoundError";
  }
}

const OWNER_TASK_ACTOR: TaskActor = {
  role: TaskActorRole.OWNER,
  isAssignee: false,
  canApproveCompletion: true,
  canReviewProof: true,
  canAssign: true,
};

const OWNER_PROOF_ACTOR: ProofActor = {
  role: TaskActorRole.OWNER,
  isAssignee: false,
  canReviewProof: true,
};

// ── Status transition ─────────────────────────────────────────────────────────

export interface TransitionTaskCommand {
  taskId: string;
  workspaceId: string;
  actorId: string;
  to: DelegatedTaskStatus;
}

/**
 * Transition a task's status as the workspace owner.
 * @throws TaskWorkflowNotFoundError — task not in workspace
 * @throws TaskTransitionNotAllowedError — FSM denied the transition
 * @throws TaskTransitionConflictError — concurrent update (stale state)
 */
export async function transitionTaskStatus(command: TransitionTaskCommand): Promise<DelegatedTaskStatus> {
  enforceWorkspaceId(command.workspaceId, "transitionTaskStatus", "DelegatedTask");

  const row = await db.delegatedTask.findFirst({
    where: { id: command.taskId, workspaceId: command.workspaceId },
    select: {
      id: true,
      workspaceId: true,
      status: true,
      assignedUserId: true,
      assignedRole: true,
      workOrderId: true,
      approvedBoundaryId: true,
      approvedBoundaryVersion: true,
      boundaryContentHash: true,
    },
  });
  if (!row) throw new TaskWorkflowNotFoundError(command.taskId);

  const task: DelegatedTask = {
    taskId: row.id,
    workspaceId: row.workspaceId,
    workOrderId: row.workOrderId,
    assignedUserId: row.assignedUserId,
    assignedRole: row.assignedRole,
    status: row.status as DelegatedTaskStatus,
    approvedBoundaryId: row.approvedBoundaryId,
    approvedBoundaryVersion: row.approvedBoundaryVersion,
    boundaryContentHash: row.boundaryContentHash,
  };

  return runTaskTransition(task, command.to, OWNER_TASK_ACTOR, command.actorId);
}

// ── Proof submission ──────────────────────────────────────────────────────────

export interface SubmitProofCommand {
  taskId: string;
  workspaceId: string;
  actorId: string;
  proofType: ProofType;
  /** Key/value proof fields per the requirement's requiredFields list. */
  fields: Record<string, unknown>;
  /** Optional content-hash for duplicate detection. */
  fileHash?: string | null;
}

/**
 * Submit proof for a task as the workspace owner (on behalf of or in addition to the assignee).
 * @throws TaskWorkflowNotFoundError — task not in workspace
 * @throws ProofRequirementNotFoundError — no proof requirement on task
 * @throws ProofNotFoundError — no proof row exists yet
 * @throws ProofValidationError — submission fields invalid
 * @throws ProofTransitionNotAllowedError — FSM denied submission
 * @throws ProofConflictError — concurrent submission
 */
export async function submitProofForTask(command: SubmitProofCommand): Promise<{ status: ProofStatus; duplicateFlagged: boolean }> {
  enforceWorkspaceId(command.workspaceId, "submitProofForTask", "Proof");

  const task = await db.delegatedTask.findFirst({
    where: { id: command.taskId, workspaceId: command.workspaceId },
    select: { proofRequirementId: true, workStartedAt: true },
  });
  if (!task) throw new TaskWorkflowNotFoundError(command.taskId);
  if (!task.proofRequirementId) throw new ProofRequirementNotFoundError(command.taskId);

  const [req, proof, existingHashes] = await Promise.all([
    db.proofRequirement.findFirst({
      where: { id: task.proofRequirementId, workspaceId: command.workspaceId },
      select: { proofType: true, requiredFields: true, riskLevel: true },
    }),
    db.proof.findFirst({
      where: { taskId: command.taskId, workspaceId: command.workspaceId },
      orderBy: { submittedAt: "desc" },
      select: { id: true, status: true },
    }),
    command.fileHash
      ? db.proof.findMany({
          where: { workspaceId: command.workspaceId, fileHash: { not: null } },
          select: { fileHash: true },
        }).then((rows: Array<{ fileHash: string | null }>) => new Set(rows.map((r) => r.fileHash as string).filter(Boolean)))
      : Promise.resolve(new Set<string>()),
  ]);

  if (!req) throw new ProofRequirementNotFoundError(command.taskId);
  if (!proof) throw new ProofNotFoundError(command.taskId);

  const requirement: ProofRequirement = {
    proofType: req.proofType as ProofType,
    requiredFields: (req.requiredFields as string[] | null) ?? [],
    riskLevel: req.riskLevel as import("@/domain/execution/proof").ProofRiskLevel,
  };

  const submission: ProofSubmission = {
    proofType: command.proofType,
    fields: command.fields,
    fileHash: command.fileHash ?? null,
    submittedByUserId: command.actorId,
  };

  return submitProof({
    proofId: proof.id,
    taskId: command.taskId,
    workspaceId: command.workspaceId,
    fromStatus: proof.status as ProofStatus,
    requirement,
    submission,
    actor: OWNER_PROOF_ACTOR,
    existingHashes,
    workStartedAt: task.workStartedAt ?? null,
  });
}

// ── Proof review ──────────────────────────────────────────────────────────────

export interface ReviewProofCommand {
  taskId: string;
  workspaceId: string;
  reviewerId: string;
  to: ProofStatus;
  reason?: string;
}

/**
 * Accept, reject, or route a proof for a task as the workspace owner.
 * @throws TaskWorkflowNotFoundError — task not in workspace
 * @throws ProofNotFoundError — no proof row exists
 * @throws ProofTransitionNotAllowedError — FSM denied review
 * @throws ProofSelfReviewError — reviewer is the submitter (SoD)
 * @throws ProofDuplicateRejectedError — accepting a duplicate-flagged proof
 * @throws ProofConflictError — concurrent review
 */
export async function reviewProofForTask(command: ReviewProofCommand): Promise<ProofStatus> {
  enforceWorkspaceId(command.workspaceId, "reviewProofForTask", "Proof");

  const task = await db.delegatedTask.findFirst({
    where: { id: command.taskId, workspaceId: command.workspaceId },
    select: { id: true },
  });
  if (!task) throw new TaskWorkflowNotFoundError(command.taskId);

  const proof = await db.proof.findFirst({
    where: { taskId: command.taskId, workspaceId: command.workspaceId },
    orderBy: { submittedAt: "desc" },
    select: { id: true, status: true },
  });
  if (!proof) throw new ProofNotFoundError(command.taskId);

  return reviewProof({
    proofId: proof.id,
    taskId: command.taskId,
    workspaceId: command.workspaceId,
    fromStatus: proof.status as ProofStatus,
    to: command.to,
    actor: OWNER_PROOF_ACTOR,
    actorId: command.reviewerId,
    reason: command.reason,
  });
}
