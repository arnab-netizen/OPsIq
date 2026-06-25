/**
 * Delegated task / work-order state machine (Slice 7, pure logic).
 *
 * Backend-enforced status transitions for owner-approved delegated work. Pure and
 * fail-closed: every transition must be in the explicit transition graph AND
 * authorized for the acting role. Critically, an employee (assignee) can never
 * mark a task APPROVED_COMPLETE — only an owner or a manager with completion
 * authority may. Each task is bound to the exact owner-approved boundary version
 * (Slice 6) it was created under; guidance is gated by re-validating that binding.
 *
 * Persistence (the Prisma Task/WorkOrder table) is MIGRATION_LANE_PENDING — this
 * module is the enforcement core the service + future table must use.
 */

import {
  ApprovedExecutionBoundary,
  BoundaryInstruction,
  BoundaryValidationResult,
  validateInstructionAgainstBoundary,
} from "@/domain/execution/boundary";

export enum DelegatedTaskStatus {
  DRAFT = "DRAFT",
  ASSIGNED = "ASSIGNED",
  ACKNOWLEDGED = "ACKNOWLEDGED",
  IN_PROGRESS = "IN_PROGRESS",
  BLOCKED = "BLOCKED",
  NEEDS_OWNER_CLARIFICATION = "NEEDS_OWNER_CLARIFICATION",
  ESCALATED = "ESCALATED",
  PROOF_REQUIRED = "PROOF_REQUIRED",
  PROOF_SUBMITTED = "PROOF_SUBMITTED",
  COMPLETED_PENDING_REVIEW = "COMPLETED_PENDING_REVIEW",
  APPROVED_COMPLETE = "APPROVED_COMPLETE",
  REJECTED_INCOMPLETE = "REJECTED_INCOMPLETE",
  CANCELLED = "CANCELLED",
  EXPIRED = "EXPIRED",
  DISPUTED = "DISPUTED",
}

const S = DelegatedTaskStatus;

/** Explicit, backend-enforced transition graph. Terminal states map to []. */
export const VALID_TASK_TRANSITIONS: Record<DelegatedTaskStatus, DelegatedTaskStatus[]> = {
  [S.DRAFT]: [S.ASSIGNED, S.CANCELLED],
  [S.ASSIGNED]: [S.ACKNOWLEDGED, S.CANCELLED, S.EXPIRED],
  [S.ACKNOWLEDGED]: [
    S.IN_PROGRESS, S.BLOCKED, S.NEEDS_OWNER_CLARIFICATION, S.ESCALATED, S.CANCELLED, S.EXPIRED,
  ],
  [S.IN_PROGRESS]: [
    S.BLOCKED, S.NEEDS_OWNER_CLARIFICATION, S.ESCALATED, S.PROOF_REQUIRED,
    S.COMPLETED_PENDING_REVIEW, S.CANCELLED, S.EXPIRED,
  ],
  [S.BLOCKED]: [S.IN_PROGRESS, S.NEEDS_OWNER_CLARIFICATION, S.ESCALATED, S.CANCELLED, S.EXPIRED],
  [S.NEEDS_OWNER_CLARIFICATION]: [S.IN_PROGRESS, S.BLOCKED, S.ESCALATED, S.CANCELLED, S.EXPIRED],
  [S.ESCALATED]: [
    S.IN_PROGRESS, S.BLOCKED, S.NEEDS_OWNER_CLARIFICATION, S.REJECTED_INCOMPLETE,
    S.CANCELLED, S.EXPIRED,
  ],
  [S.PROOF_REQUIRED]: [S.PROOF_SUBMITTED, S.BLOCKED, S.ESCALATED, S.CANCELLED, S.EXPIRED],
  [S.PROOF_SUBMITTED]: [S.COMPLETED_PENDING_REVIEW, S.REJECTED_INCOMPLETE, S.DISPUTED, S.ESCALATED],
  [S.COMPLETED_PENDING_REVIEW]: [S.APPROVED_COMPLETE, S.REJECTED_INCOMPLETE, S.DISPUTED],
  [S.APPROVED_COMPLETE]: [],
  [S.REJECTED_INCOMPLETE]: [S.IN_PROGRESS, S.PROOF_REQUIRED, S.CANCELLED, S.EXPIRED],
  [S.CANCELLED]: [],
  [S.EXPIRED]: [],
  [S.DISPUTED]: [S.APPROVED_COMPLETE, S.REJECTED_INCOMPLETE, S.ESCALATED],
};

export function isTerminalTaskStatus(status: DelegatedTaskStatus): boolean {
  return VALID_TASK_TRANSITIONS[status].length === 0;
}

export enum TaskActorRole {
  EMPLOYEE = "EMPLOYEE",
  MANAGER = "MANAGER",
  OWNER = "OWNER",
  SYSTEM = "SYSTEM",
}

export interface TaskActor {
  role: TaskActorRole;
  /** True when this actor is the employee the task is assigned to. */
  isAssignee: boolean;
  /** Owner, or manager with APPROVE_ROUTINE_COMPLETION. */
  canApproveCompletion: boolean;
  /** Owner, or manager with a PROOF_REVIEW_* grant. */
  canReviewProof: boolean;
  /** Owner, or manager with a TASK_ASSIGN_* grant. */
  canAssign: boolean;
}

/** Target statuses an assignee employee may drive directly. */
export const EMPLOYEE_ALLOWED_TARGETS: ReadonlySet<DelegatedTaskStatus> = new Set([
  S.ACKNOWLEDGED,
  S.IN_PROGRESS,
  S.BLOCKED,
  S.NEEDS_OWNER_CLARIFICATION,
  S.ESCALATED,
  S.PROOF_SUBMITTED,
  S.COMPLETED_PENDING_REVIEW,
]);

const REVIEW_TARGETS: ReadonlySet<DelegatedTaskStatus> = new Set([
  S.REJECTED_INCOMPLETE,
  S.DISPUTED,
]);

export interface TaskTransitionDecision {
  allowed: boolean;
  reason: string;
}

function deny(reason: string): TaskTransitionDecision {
  return { allowed: false, reason };
}
const ALLOW: TaskTransitionDecision = { allowed: true, reason: "ok" };

/**
 * Fail-closed transition authorization. Returns allowed only when the transition
 * is in the graph AND the actor is permitted to perform it.
 */
export function planTaskTransition(
  from: DelegatedTaskStatus,
  to: DelegatedTaskStatus,
  actor: TaskActor
): TaskTransitionDecision {
  if (from === to) return deny(`No-op transition (${from}).`);
  if (!VALID_TASK_TRANSITIONS[from].includes(to)) {
    return deny(`Invalid transition ${from} → ${to}.`);
  }

  // Owner authority is final: any graph-valid transition is permitted.
  if (actor.role === TaskActorRole.OWNER) return ALLOW;

  // System performs only automated expiry.
  if (actor.role === TaskActorRole.SYSTEM) {
    return to === S.EXPIRED
      ? ALLOW
      : deny(`System may only EXPIRE tasks, not → ${to}.`);
  }

  // Completion approval: NEVER an employee; manager only with completion authority.
  if (to === S.APPROVED_COMPLETE) {
    if (actor.role === TaskActorRole.EMPLOYEE) {
      return deny("An employee cannot mark a task APPROVED_COMPLETE.");
    }
    return actor.canApproveCompletion
      ? ALLOW
      : deny("Manager lacks completion-approval authority (APPROVE_ROUTINE_COMPLETION).");
  }

  // Proof review outcomes (reject / dispute): reviewer authority required.
  if (REVIEW_TARGETS.has(to)) {
    return actor.canReviewProof || actor.canApproveCompletion
      ? ALLOW
      : deny("Actor lacks proof-review authority for this outcome.");
  }

  // Assignment requires assignment authority.
  if (to === S.ASSIGNED) {
    return actor.canAssign ? ALLOW : deny("Actor lacks task-assignment authority.");
  }

  // Cancellation is a management action.
  if (to === S.CANCELLED) {
    return actor.canAssign
      ? ALLOW
      : deny("Only a manager/owner with assignment authority may cancel a task.");
  }

  // Employee-drivable execution steps: assignee employee or any manager.
  if (EMPLOYEE_ALLOWED_TARGETS.has(to)) {
    if (actor.role === TaskActorRole.EMPLOYEE) {
      return actor.isAssignee
        ? ALLOW
        : deny("Only the assigned employee may update this task.");
    }
    return ALLOW; // manager acting on the team's task
  }

  return deny(`Transition ${from} → ${to} is not authorized for this actor.`);
}

// ── Boundary binding (Slice 6 reuse) ─────────────────────────────────────────

/** Access/binding-relevant projection of a delegated task. */
export interface DelegatedTask {
  taskId: string;
  workspaceId: string;
  workOrderId: string | null;
  assignedUserId: string | null;
  assignedRole: string | null;
  status: DelegatedTaskStatus;
  approvedBoundaryId: string | null;
  approvedBoundaryVersion: number | null;
  boundaryContentHash: string | null;
}

/** A task must carry a full boundary binding before it can be assigned. */
export function hasCompleteBoundaryBinding(task: DelegatedTask): boolean {
  return (
    !!task.approvedBoundaryId &&
    task.approvedBoundaryVersion != null &&
    !!task.boundaryContentHash &&
    !!task.assignedUserId
  );
}

/**
 * Gate task guidance on the exact bound boundary version via the Slice 6 validator.
 * A superseded/tampered/missing boundary (hash or version mismatch) fails closed,
 * so guidance for a task whose boundary changed is blocked.
 */
export function validateTaskGuidance(
  task: DelegatedTask,
  action: string,
  role: string,
  boundary: ApprovedExecutionBoundary | null | undefined,
  opts?: { now?: Date }
): BoundaryValidationResult {
  const instruction: BoundaryInstruction = {
    action,
    role,
    boundaryId: task.approvedBoundaryId ?? undefined,
    boundaryVersion: task.approvedBoundaryVersion ?? undefined,
    boundaryContentHash: task.boundaryContentHash ?? undefined,
    summary: `guidance for task ${task.taskId}`,
  };
  return validateInstructionAgainstBoundary(boundary, instruction, opts);
}
