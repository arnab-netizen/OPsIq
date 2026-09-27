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
import { enforceOwnerActionGates, recordOwnerGateAssessment, type OwnerGateAssessment } from "@/services/owner-mode/owner-action-gate.service";
import { applyGuardedActionUpdate } from "@/services/owner-mode/owner-action-transition";
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
  let gateAssessment: OwnerGateAssessment | null = null;
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

    // EH-01/EH-02 — owner-mode safety gate (default-on, opt-out aware) before a material transition, after
    // the request's own validation (a request that fails it never records a block).
    gateAssessment = await enforceOwnerActionGates({ workspaceId, businessId: action.businessId, actionId, domain: "cashflow", toStatus: to, findingCode: action.findingCode, findingId: action.findingId });
    data.status = to;
  }

  if (input.assignedTo !== undefined) data.assignedTo = input.assignedTo;
  if (input.completionNotes !== undefined) data.completionNotes = input.completionNotes;
  if (input.completionEvidence !== undefined) data.completionEvidence = input.completionEvidence;

  // Compare-and-set on the status the transition was validated against (a double submission or a
  // concurrent change never applies a stale transition twice).
  const { row: updated, transitioned } = await applyGuardedActionUpdate<typeof action>(db.ownerCashflowAction, {
    entity: "OwnerCashflowAction", actionId, workspaceId, expectedStatus: action.status, toStatus: input.status, data,
  });
  // An identical concurrent request already applied this transition: nothing more to record or trigger.
  if (!transitioned) return updated;

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.OWNER_CASHFLOW_ACTION_UPDATED,
    actorId,
    workspaceId,
    entityType: "OwnerCashflowAction",
    entityId: actionId,
    payload: { status: updated.status, assignedTo: updated.assignedTo },
  });
  // The gate's Owner-mode assessment is recorded only now that the transition is validated and saved.
  if (gateAssessment) await recordOwnerGateAssessment(gateAssessment);

  // On action completion, emit a dedicated event and trigger re-diagnosis from
  // latest snapshot -- matches every other owner-domain action service
  // (finance/sales/operations/sop/strategy/marketing); cashflow was missing
  // this mechanism entirely.
  if (updated.status === "completed") {
    await emitAuditEvent({
      eventName: AUDIT_EVENTS.OWNER_CASHFLOW_ACTION_COMPLETED,
      actorId,
      workspaceId,
      entityType: "OwnerCashflowAction",
      entityId: actionId,
      payload: { businessId: updated.businessId, cycleId: updated.cycleId },
    });

    try {
      const latestSnapshot = await db.ownerCashflowSnapshot.findFirst({
        where: { businessId: updated.businessId, workspaceId, periodEnd: { lte: new Date() } },
        orderBy: { periodEnd: "desc" },
        select: { id: true },
      });
      if (latestSnapshot) {
        const { runCashflowDiagnosis } = await import("./diagnosis.service");
        const newCycle = await runCashflowDiagnosis(updated.businessId, latestSnapshot.id, actorId, workspaceId);
        await emitAuditEvent({
          eventName: AUDIT_EVENTS.OWNER_CASHFLOW_REASSESSMENT_TRIGGERED,
          actorId,
          workspaceId,
          entityType: "OwnerCashflowCycle",
          entityId: newCycle.id,
          payload: { trigger: "action_completed", triggerActionId: actionId },
        });
      }
    } catch {
      // Re-diagnosis failure must not fail the action update — advisory only.
    }
  }

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
