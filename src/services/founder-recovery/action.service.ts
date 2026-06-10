/**
 * Founder Recovery — action execution service.
 *
 * Assign, start, block, complete and annotate recovery actions using the
 * explicit, tested status machine. Workspace ownership and optimistic version
 * checks are enforced. Completion requires a completion note + actual outcome.
 */
import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { ConflictError, NotFoundError, ValidationError } from "@/infra/errors";
import {
  canTransition,
  isValidRecoveryStatus,
  requiresCompletionEvidence,
  type RecoveryActionStatus,
} from "@/domain/founder-recovery/action-status";

export interface UpdateRecoveryActionInput {
  status?: string;
  assignedToUserId?: string | null;
  completionNotes?: string;
  actualOutcome?: string;
  version: number;
}

export async function updateRecoveryAction(
  actionId: string,
  input: UpdateRecoveryActionInput,
  actorId: string,
  workspaceId: string
) {
  const action = await db.recoveryAction.findFirst({
    where: { id: actionId, workspaceId },
  });
  if (!action) throw new NotFoundError("RecoveryAction", actionId);

  if (action.version !== input.version) {
    throw new ConflictError("Recovery action was modified by another request. Reload and retry.", {
      expectedVersion: action.version,
    });
  }

  const data: Record<string, unknown> = {};
  const now = new Date();

  if (input.status !== undefined) {
    if (!isValidRecoveryStatus(input.status)) {
      throw new ValidationError(`Invalid recovery action status: ${input.status}`);
    }
    const from = action.status as RecoveryActionStatus;
    if (!canTransition(from, input.status)) {
      // Client error (400), not an internal failure: surface a clean validation error.
      throw new ValidationError(
        `Invalid recovery action transition: ${from} → ${input.status}`
      );
    }
    const to = input.status;

    if (requiresCompletionEvidence(to)) {
      const notes = input.completionNotes ?? action.completionNotes;
      const outcome = input.actualOutcome ?? action.actualOutcome;
      if (!notes || !outcome) {
        throw new ValidationError(
          "Completing a recovery action requires completionNotes and actualOutcome."
        );
      }
      data.completedAt = now;
    }
    if (to === "in_progress" && !action.startedAt) {
      data.startedAt = now;
    }
    data.status = to;
  }

  if (input.assignedToUserId !== undefined) data.assignedToUserId = input.assignedToUserId;
  if (input.completionNotes !== undefined) data.completionNotes = input.completionNotes;
  if (input.actualOutcome !== undefined) data.actualOutcome = input.actualOutcome;
  data.version = { increment: 1 };

  const updated = await db.recoveryAction.update({
    where: { id: actionId },
    data,
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.RECOVERY_ACTION_UPDATED,
    actorId,
    workspaceId,
    entityType: "RecoveryAction",
    entityId: actionId,
    payload: { status: updated.status, assignedToUserId: updated.assignedToUserId },
  });

  return updated;
}

export async function getRecoveryAction(actionId: string, workspaceId: string) {
  const action = await db.recoveryAction.findFirst({
    where: { id: actionId, workspaceId },
    include: { verifications: { orderBy: { createdAt: "desc" } } },
  });
  if (!action) throw new NotFoundError("RecoveryAction", actionId);
  return action;
}
