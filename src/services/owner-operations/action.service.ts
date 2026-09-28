/**
 * Owner Operations (Module 4) — action execution service.
 *
 * Transitions operations actions through the SHARED Module 1 status machine
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
import type { OperationsActionUpdateInput } from "@/domain/owner-operations/validation";

export async function updateOperationsAction(
  actionId: string,
  input: OperationsActionUpdateInput,
  actorId: string,
  workspaceId: string
) {
  const action = await db.ownerOperationsAction.findFirst({
    where: { id: actionId, workspaceId },
  });
  if (!action) throw new NotFoundError("OwnerOperationsAction", actionId);

  // The request's own fields: an exact replay of the action's state is a no-op, and a completed or
  // cancelled action's record is never rewritten (owner-action-transition.ts).
  const request = { status: input.status, assignedTo: input.assignedTo, completionNotes: input.completionNotes, completionEvidence: input.completionEvidence };
  if (classifyActionRequest(action, request) === "replay") return action;

  const data: Record<string, unknown> = {};
  let gateAssessment: OwnerGateAssessment | null = null;
  const now = new Date();

  if (input.status !== undefined) {
    if (!isValidRecoveryStatus(input.status)) {
      throw new ValidationError(`Invalid operations action status: ${input.status}`);
    }
    const from = action.status as RecoveryActionStatus;
    if (!canTransition(from, input.status)) {
      throw new ValidationError(`Invalid operations action transition: ${from} → ${input.status}`);
    }
    const to = input.status;

    if (requiresCompletionEvidence(to)) {
      const notes = input.completionNotes ?? action.completionNotes;
      const evidence =
        input.completionEvidence ??
        (Array.isArray(action.completionEvidence) ? action.completionEvidence : null);
      if (!notes || !evidence || evidence.length === 0) {
        throw new ValidationError(
          "Completing an operations action requires completionNotes and completionEvidence."
        );
      }
      data.completedAt = now;
    }

    // EH-01/EH-02 — owner-mode safety gate (default-on, opt-out aware) before a material transition, after
    // the request's own validation (a request that fails it never records a block).
    gateAssessment = await enforceOwnerActionGates({ workspaceId, businessId: action.businessId, actionId, domain: "operations", toStatus: to, findingCode: action.findingCode, findingId: action.findingId });
    data.status = to;
  }

  if (input.assignedTo !== undefined) data.assignedTo = input.assignedTo;
  if (input.completionNotes !== undefined) data.completionNotes = input.completionNotes;
  if (input.completionEvidence !== undefined) data.completionEvidence = input.completionEvidence;

  // Compare-and-set on the status the transition was validated against, atomically with its audit events
  // and the accepted gate assessment (a double submission never applies twice; a lost race with different
  // data is a conflict, never reported as applied).
  const { row: updated, transitioned } = await applyGuardedActionTransition<typeof action>({
    model: "ownerOperationsAction", entity: "OwnerOperationsAction", actionId, workspaceId, expectedStatus: action.status, data, request,
    gateAssessment,
    audits: (row) => [
      {
        eventName: AUDIT_EVENTS.OWNER_OPERATIONS_ACTION_UPDATED,
        actorId,
        workspaceId,
        entityType: "OwnerOperationsAction",
        entityId: actionId,
        payload: { status: row.status, previousStatus: action.status, assignedTo: row.assignedTo, changedFields: Object.keys(data) },
      },
      ...(row.status === "completed" && action.status !== "completed"
        ? [{
            eventName: AUDIT_EVENTS.OWNER_OPERATIONS_ACTION_COMPLETED,
            actorId,
            workspaceId,
            entityType: "OwnerOperationsAction",
            entityId: actionId,
            payload: { businessId: row.businessId, cycleId: row.cycleId },
          }]
        : []),
    ],
  });
  // An identical concurrent request already applied this transition: nothing more to record or trigger.
  if (!transitioned) return updated;

  if (updated.status === "completed") {
    // Attempt automatic re-diagnosis from the latest confirmed snapshot (best-effort; non-blocking).
    try {
      const latestSnapshot = await db.ownerOperationsSnapshot.findFirst({
        where: { businessId: updated.businessId, workspaceId, periodEnd: { lte: new Date() } },
        orderBy: { periodEnd: "desc" },
        select: { id: true },
      });
      if (latestSnapshot) {
        const { runOperationsDiagnosis } = await import("./diagnosis.service");
        const newCycle = await runOperationsDiagnosis(updated.businessId, latestSnapshot.id, actorId, workspaceId);
        await emitAuditEvent({
          eventName: AUDIT_EVENTS.OWNER_OPERATIONS_REASSESSMENT_TRIGGERED,
          actorId,
          workspaceId,
          entityType: "OwnerOperationsCycle",
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

export async function getOperationsAction(actionId: string, workspaceId: string) {
  const action = await db.ownerOperationsAction.findFirst({
    where: { id: actionId, workspaceId },
    include: { verifications: { orderBy: { createdAt: "desc" } } },
  });
  if (!action) throw new NotFoundError("OwnerOperationsAction", actionId);
  return action;
}
