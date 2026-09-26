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
import { enforceOwnerActionGates } from "@/services/owner-mode/owner-action-gate.service";
import type { StrategyActionUpdateInput } from "@/domain/owner-strategy/validation";
import { strategyActionFit, STRATEGY_FITS_WITHOUT_FORWARD_STEPS } from "@/domain/owner-strategy/action-arbitration";
import { currentStrategyDecision } from "./decision-view";

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

    // Decision fit (server-side): an action that is on hold or covered by the current decision's
    // next step may be finished or cancelled, never taken on or started (action-arbitration.ts).
    if (to === "assigned" || to === "in_progress") {
      const latest = await db.ownerStrategyCycle.findFirst({
        where: { businessId: action.businessId, workspaceId },
        orderBy: { sequenceNumber: "desc" },
        include: { snapshot: true },
      });
      const decision = currentStrategyDecision(latest);
      if (decision && STRATEGY_FITS_WITHOUT_FORWARD_STEPS.includes(strategyActionFit(action, decision))) {
        throw new ValidationError(
          `This step isn't part of the current Strategy decision (${decision.headline}). Cancel it, or finish it if it's already under way.`
        );
      }
    }

    // EH-01/EH-02 — owner-mode safety gate (default-on, opt-out aware) before a material transition.
    await enforceOwnerActionGates({ workspaceId, businessId: action.businessId, actionId, domain: "strategy", toStatus: to });

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

  // On action completion, emit a dedicated event and trigger re-diagnosis from latest snapshot.
  if (updated.status === "completed") {
    await emitAuditEvent({
      eventName: AUDIT_EVENTS.OWNER_STRATEGY_ACTION_COMPLETED,
      actorId,
      workspaceId,
      entityType: "OwnerStrategyAction",
      entityId: actionId,
      payload: { businessId: updated.businessId, cycleId: updated.cycleId },
    });

    try {
      const latestSnapshot = await db.ownerStrategySnapshot.findFirst({
        where: { businessId: updated.businessId, workspaceId },
        orderBy: { periodEnd: "desc" },
        select: { id: true },
      });
      if (latestSnapshot) {
        const { runStrategyDiagnosis } = await import("./diagnosis.service");
        const newCycle = await runStrategyDiagnosis(updated.businessId, latestSnapshot.id, actorId, workspaceId);
        await emitAuditEvent({
          eventName: AUDIT_EVENTS.OWNER_STRATEGY_REASSESSMENT_TRIGGERED,
          actorId,
          workspaceId,
          entityType: "OwnerStrategyCycle",
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

export async function getStrategyAction(actionId: string, workspaceId: string) {
  const action = await db.ownerStrategyAction.findFirst({
    where: { id: actionId, workspaceId },
    include: { verifications: { orderBy: { createdAt: "desc" } } },
  });
  if (!action) throw new NotFoundError("OwnerStrategyAction", actionId);
  return action;
}
