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
import { enforceOwnerActionGates, type OwnerGateAssessment } from "@/services/owner-mode/owner-action-gate.service";
import { applyGuardedActionTransition, classifyActionRequest } from "@/services/owner-mode/owner-action-transition";
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

  // The request's own fields: an exact replay of the action's state is a no-op, and a completed or
  // cancelled action's record is never rewritten (owner-action-transition.ts).
  const request = { status: input.status, assignedTo: input.assignedTo, completionNotes: input.completionNotes, completionEvidence: input.completionEvidence };
  if (classifyActionRequest(action, request) === "replay") return action;

  const data: Record<string, unknown> = {};
  let gateAssessment: OwnerGateAssessment | null = null;
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

    // EH-01/EH-02 — owner-mode safety gate (default-on, opt-out aware) before a material transition, after
    // the request's own validation (a request that fails it never records a block).
    gateAssessment = await enforceOwnerActionGates({ workspaceId, businessId: action.businessId, actionId, domain: "marketing", toStatus: to, findingCode: action.findingCode, findingId: action.findingId });
    data.status = to;
  }

  if (input.assignedTo !== undefined) data.assignedTo = input.assignedTo;
  if (input.completionNotes !== undefined) data.completionNotes = input.completionNotes;
  if (input.completionEvidence !== undefined) data.completionEvidence = input.completionEvidence;

  // Compare-and-set on the status the transition was validated against, atomically with its audit events
  // and the accepted gate assessment (a double submission never applies twice; a lost race with different
  // data is a conflict, never reported as applied).
  const { row: updated, transitioned } = await applyGuardedActionTransition<typeof action>({
    model: "ownerMarketingAction", entity: "OwnerMarketingAction", actionId, workspaceId, expectedStatus: action.status, data, request,
    gateAssessment,
    audits: (row) => [
      {
        eventName: AUDIT_EVENTS.OWNER_MARKETING_ACTION_UPDATED,
        actorId,
        workspaceId,
        entityType: "OwnerMarketingAction",
        entityId: actionId,
        payload: { status: row.status, previousStatus: action.status, assignedTo: row.assignedTo, changedFields: Object.keys(data) },
      },
      ...(row.status === "completed" && action.status !== "completed"
        ? [{
            eventName: AUDIT_EVENTS.OWNER_MARKETING_ACTION_COMPLETED,
            actorId,
            workspaceId,
            entityType: "OwnerMarketingAction",
            entityId: actionId,
            payload: { businessId: row.businessId, cycleId: row.cycleId },
          }]
        : []),
    ],
  });
  // An identical concurrent request already applied this transition: nothing more to record or trigger.
  if (!transitioned) return updated;

  if (updated.status === "completed") {
    try {
      const latestSnapshot = await db.ownerMarketingSnapshot.findFirst({
        where: { businessId: updated.businessId, workspaceId, periodEnd: { lte: new Date() } },
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
