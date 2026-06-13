/**
 * Owner Strategy & Scenario Planning (Module 8) — action execution service.
 *
 * Transitions strategy actions through the SHARED Module 1 status machine
 * (proposed→assigned→in_progress→{blocked}→completed|cancelled). Workspace
 * ownership is enforced; invalid transitions are rejected (400); completing
 * requires completion evidence. Reuses the recovery action-status vocabulary.
 */
import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError, ValidationError } from "@/infra/errors";
import {
  canTransition,
  isValidRecoveryStatus,
  requiresCompletionEvidence,
  type RecoveryActionStatus,
} from "@/domain/founder-recovery/action-status";
import type { StrategyActionUpdateInput } from "@/domain/owner-strategy/validation";

export async function updateStrategyAction(
  actionId: string,
  input: StrategyActionUpdateInput,
  actorId: string,
  workspaceId: string
) {
  const action = await db.ownerStrategyAction.findFirst({
    where: { id: actionId, workspaceId },
  });
  if (!action) throw new NotFoundError("OwnerStrategyAction", actionId);

  const data: Record<string, unknown> = {};
  const now = new Date();

  if (input.status !== undefined) {
    if (!isValidRecoveryStatus(input.status)) {
      throw new ValidationError(`Invalid strategy action status: ${input.status}`);
    }
    const from = action.status as RecoveryActionStatus;
    if (!canTransition(from, input.status)) {
      throw new ValidationError(`Invalid strategy action transition: ${from} → ${input.status}`);
    }
    const to = input.status;

    if (requiresCompletionEvidence(to)) {
      const notes = input.completionNotes ?? action.completionNotes;
      const evidence =
        input.completionEvidence ??
        (Array.isArray(action.completionEvidence) ? action.completionEvidence : null);
      if (!notes || !evidence || evidence.length === 0) {
        throw new ValidationError(
          "Completing a strategy action requires completionNotes and completionEvidence."
        );
      }
      data.completedAt = now;
    }
    data.status = to;
  }

  if (input.assignedTo !== undefined) data.assignedTo = input.assignedTo;
  if (input.completionNotes !== undefined) data.completionNotes = input.completionNotes;
  if (input.completionEvidence !== undefined) data.completionEvidence = input.completionEvidence;

  const updated = await db.ownerStrategyAction.update({
    where: { id: actionId },
    data,
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.OWNER_STRATEGY_ACTION_UPDATED,
    actorId,
    workspaceId,
    entityType: "OwnerStrategyAction",
    entityId: actionId,
    payload: { status: updated.status, assignedTo: updated.assignedTo },
  });

  return updated;
}

export async function getStrategyAction(actionId: string, workspaceId: string) {
  const action = await db.ownerStrategyAction.findFirst({
    where: { id: actionId, workspaceId },
    include: { verifications: { orderBy: { createdAt: "desc" } } },
  });
  if (!action) throw new NotFoundError("OwnerStrategyAction", actionId);
  return action;
}
