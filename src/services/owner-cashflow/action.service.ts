/**
 * Owner Cashflow (Module 5) — action execution service.
 *
 * Transitions cashflow actions through the SHARED Module 1 status machine
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
import { enforceOwnerActionGates } from "@/services/owner-mode/owner-action-gate.service";
import type { CashflowActionUpdateInput } from "@/domain/owner-cashflow/validation";

export async function updateCashflowAction(
  actionId: string,
  input: CashflowActionUpdateInput,
  actorId: string,
  workspaceId: string
) {
  const action = await db.ownerCashflowAction.findFirst({
    where: { id: actionId, workspaceId },
  });
  if (!action) throw new NotFoundError("OwnerCashflowAction", actionId);

  const data: Record<string, unknown> = {};
  const now = new Date();

  if (input.status !== undefined) {
    if (!isValidRecoveryStatus(input.status)) {
      throw new ValidationError(`Invalid cashflow action status: ${input.status}`);
    }
    const from = action.status as RecoveryActionStatus;
    if (!canTransition(from, input.status)) {
      throw new ValidationError(`Invalid cashflow action transition: ${from} → ${input.status}`);
    }
    const to = input.status;

    // EH-01/EH-02 — owner-mode safety gate (default-on, opt-out aware) before a material transition.
    await enforceOwnerActionGates({ workspaceId, businessId: action.businessId, actionId, domain: "cashflow", toStatus: to });

    if (requiresCompletionEvidence(to)) {
      const notes = input.completionNotes ?? action.completionNotes;
      const evidence =
        input.completionEvidence ??
        (Array.isArray(action.completionEvidence) ? action.completionEvidence : null);
      if (!notes || !evidence || evidence.length === 0) {
        throw new ValidationError(
          "Completing a cashflow action requires completionNotes and completionEvidence."
        );
      }
      data.completedAt = now;
    }
    data.status = to;
  }

  if (input.assignedTo !== undefined) data.assignedTo = input.assignedTo;
  if (input.completionNotes !== undefined) data.completionNotes = input.completionNotes;
  if (input.completionEvidence !== undefined) data.completionEvidence = input.completionEvidence;

  const updated = await db.ownerCashflowAction.update({
    where: { id: actionId },
    data,
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.OWNER_CASHFLOW_ACTION_UPDATED,
    actorId,
    workspaceId,
    entityType: "OwnerCashflowAction",
    entityId: actionId,
    payload: { status: updated.status, assignedTo: updated.assignedTo },
  });

  return updated;
}

export async function getCashflowAction(actionId: string, workspaceId: string) {
  const action = await db.ownerCashflowAction.findFirst({
    where: { id: actionId, workspaceId },
    include: { verifications: { orderBy: { createdAt: "desc" } } },
  });
  if (!action) throw new NotFoundError("OwnerCashflowAction", actionId);
  return action;
}
