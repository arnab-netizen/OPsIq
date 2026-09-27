/**
 * Owner Finance (Module 2) — action execution service.
 *
 * Transitions finance actions through the SHARED Module 1 status machine
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
import { resolveCurrentSnapshotId } from "@/services/owner-finance/snapshot.service";
import type { FinanceActionUpdateInput } from "@/domain/owner-finance/validation";
import { currentEffectiveFinancialSnapshotQuery } from "@/services/owner-finance/financial-snapshot-selection";
import { CURRENT_DIAGNOSIS_CYCLE_ORDER } from "@/services/owner-spine/current-diagnosis-cycle";

export async function updateFinanceAction(
  actionId: string,
  input: FinanceActionUpdateInput,
  actorId: string,
  workspaceId: string
) {
  const action = await db.ownerFinanceAction.findFirst({
    where: { id: actionId, workspaceId },
  });
  if (!action) throw new NotFoundError("OwnerFinanceAction", actionId);

  const data: Record<string, unknown> = {};
  const now = new Date();

  if (input.status !== undefined) {
    if (!isValidRecoveryStatus(input.status)) {
      throw new ValidationError(`Invalid finance action status: ${input.status}`);
    }
    const from = action.status as RecoveryActionStatus;
    if (!canTransition(from, input.status)) {
      throw new ValidationError(`Invalid finance action transition: ${from} → ${input.status}`);
    }
    const to = input.status;

    // EH-01/EH-02 — owner-mode safety gate (default-on, opt-out aware) before a material transition.
    await enforceOwnerActionGates({ workspaceId, businessId: action.businessId, actionId, domain: "finance", toStatus: to, findingCode: action.findingCode });

    if (requiresCompletionEvidence(to)) {
      const notes = input.completionNotes ?? action.completionNotes;
      const evidence =
        input.completionEvidence ??
        (Array.isArray(action.completionEvidence) ? action.completionEvidence : null);
      if (!notes || !evidence || evidence.length === 0) {
        throw new ValidationError(
          "Completing a finance action requires completionNotes and completionEvidence."
        );
      }
      data.completedAt = now;
    }
    data.status = to;
  }

  if (input.assignedTo !== undefined) data.assignedTo = input.assignedTo;
  if (input.completionNotes !== undefined) data.completionNotes = input.completionNotes;
  if (input.completionEvidence !== undefined) data.completionEvidence = input.completionEvidence;

  const updated = await db.ownerFinanceAction.update({
    where: { id: actionId },
    data,
    select: { id: true, status: true, assignedTo: true, businessId: true, cycleId: true },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.OWNER_FINANCE_ACTION_UPDATED,
    actorId,
    workspaceId,
    entityType: "OwnerFinanceAction",
    entityId: actionId,
    payload: { status: updated.status, assignedTo: updated.assignedTo },
  });

  // On action completion, emit a dedicated event and trigger re-diagnosis from latest snapshot.
  if (updated.status === "completed") {
    await emitAuditEvent({
      eventName: AUDIT_EVENTS.OWNER_FINANCE_ACTION_COMPLETED,
      actorId,
      workspaceId,
      entityType: "OwnerFinanceAction",
      entityId: actionId,
      payload: { businessId: updated.businessId, cycleId: updated.cycleId },
    });

    // Attempt automatic re-diagnosis from the causally-linked snapshot (best-effort; non-blocking).
    // Phase E fix: follow the latest cycle → cycle.snapshotId → current (non-superseded) version
    // instead of blindly picking ORDER BY periodEnd DESC.
    try {
      let targetSnapshotId: string | undefined;
      // The business's CURRENT diagnosis cycle (latest evidence period; not the action's own cycle): an engaged action the latest
      // diagnosis no longer raises stays on an older cycle, and re-diagnosing that cycle's
      // snapshot would roll every finance surface back to stale data. Amendments still followed.
      const cycle = await db.ownerFinanceCycle.findFirst({
        where: { businessId: updated.businessId, workspaceId },
        orderBy: CURRENT_DIAGNOSIS_CYCLE_ORDER,
        select: { snapshotId: true },
      });
      if (cycle?.snapshotId) {
        targetSnapshotId = await resolveCurrentSnapshotId(cycle.snapshotId);
      }
      // Fallback: current (non-superseded) snapshot for the business sorted by period
      if (!targetSnapshotId) {
        const snap = await db.ownerFinancialSnapshot.findFirst(
          currentEffectiveFinancialSnapshotQuery({ workspaceId, businessId: updated.businessId }, { id: true })
        );
        targetSnapshotId = snap?.id;
      }
      if (targetSnapshotId) {
        const { runFinanceDiagnosis } = await import("./diagnosis.service");
        const newCycle = await runFinanceDiagnosis(updated.businessId, targetSnapshotId, actorId, workspaceId);
        await emitAuditEvent({
          eventName: AUDIT_EVENTS.OWNER_FINANCE_REASSESSMENT_TRIGGERED,
          actorId,
          workspaceId,
          entityType: "OwnerFinanceCycle",
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

export async function getFinanceAction(actionId: string, workspaceId: string) {
  const action = await db.ownerFinanceAction.findFirst({
    where: { id: actionId, workspaceId },
    include: { verifications: { orderBy: { createdAt: "desc" } } },
  });
  if (!action) throw new NotFoundError("OwnerFinanceAction", actionId);
  return action;
}
