/**
 * Owner Marketing & Growth (Module 6) — action execution service.
 *
 * Transitions marketing actions through the SHARED Module 1 status machine
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
import type { MarketingActionUpdateInput } from "@/domain/owner-marketing/validation";

export async function updateMarketingAction(
  actionId: string,
  input: MarketingActionUpdateInput,
  actorId: string,
  workspaceId: string
) {
  const action = await db.ownerMarketingAction.findFirst({
    where: { id: actionId, workspaceId },
  });
  if (!action) throw new NotFoundError("OwnerMarketingAction", actionId);

  const data: Record<string, unknown> = {};
  const now = new Date();

  if (input.status !== undefined) {
    if (!isValidRecoveryStatus(input.status)) {
      throw new ValidationError(`Invalid marketing action status: ${input.status}`);
    }
    const from = action.status as RecoveryActionStatus;
    if (!canTransition(from, input.status)) {
      throw new ValidationError(`Invalid marketing action transition: ${from} → ${input.status}`);
    }
    const to = input.status;

    // EH-01/EH-02 — owner-mode safety gate (default-on, opt-out aware) before a material transition.
    await enforceOwnerActionGates({ workspaceId, businessId: action.businessId, actionId, domain: "marketing", toStatus: to });

    if (requiresCompletionEvidence(to)) {
      const notes = input.completionNotes ?? action.completionNotes;
      const evidence =
        input.completionEvidence ??
        (Array.isArray(action.completionEvidence) ? action.completionEvidence : null);
      if (!notes || !evidence || evidence.length === 0) {
        throw new ValidationError(
          "Completing a marketing action requires completionNotes and completionEvidence."
        );
      }
      data.completedAt = now;
    }
    data.status = to;
  }

  if (input.assignedTo !== undefined) data.assignedTo = input.assignedTo;
  if (input.completionNotes !== undefined) data.completionNotes = input.completionNotes;
  if (input.completionEvidence !== undefined) data.completionEvidence = input.completionEvidence;

  const updated = await db.ownerMarketingAction.update({
    where: { id: actionId },
    data,
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.OWNER_MARKETING_ACTION_UPDATED,
    actorId,
    workspaceId,
    entityType: "OwnerMarketingAction",
    entityId: actionId,
    payload: { status: updated.status, assignedTo: updated.assignedTo },
  });

  // On action completion, emit a dedicated event and trigger re-diagnosis from
  // latest snapshot -- matches every other owner-domain action service
  // (finance/cashflow/sales/operations/sop/strategy); marketing was missing
  // this mechanism entirely.
  if (updated.status === "completed") {
    await emitAuditEvent({
      eventName: AUDIT_EVENTS.OWNER_MARKETING_ACTION_COMPLETED,
      actorId,
      workspaceId,
      entityType: "OwnerMarketingAction",
      entityId: actionId,
      payload: { businessId: updated.businessId, cycleId: updated.cycleId },
    });

    try {
      const latestSnapshot = await db.ownerMarketingSnapshot.findFirst({
        where: { businessId: updated.businessId, workspaceId },
        orderBy: { periodEnd: "desc" },
        select: { id: true },
      });
      if (latestSnapshot) {
        const { runMarketingDiagnosis } = await import("./diagnosis.service");
        const newCycle = await runMarketingDiagnosis(updated.businessId, latestSnapshot.id, actorId, workspaceId);
        await emitAuditEvent({
          eventName: AUDIT_EVENTS.OWNER_MARKETING_REASSESSMENT_TRIGGERED,
          actorId,
          workspaceId,
          entityType: "OwnerMarketingCycle",
          entityId: newCycle.id,
          payload: { trigger: "action_completed", triggerActionId: actionId },
        });
      }
    } catch (_err) {
      // Re-diagnosis failure must not fail the action update — advisory only.
    }
  }

  return updated;
}

export async function getMarketingAction(actionId: string, workspaceId: string) {
  const action = await db.ownerMarketingAction.findFirst({
    where: { id: actionId, workspaceId },
    include: { verifications: { orderBy: { createdAt: "desc" } } },
  });
  if (!action) throw new NotFoundError("OwnerMarketingAction", actionId);
  return action;
}
