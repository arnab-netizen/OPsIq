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
import { enforceOwnerActionGates, recordOwnerGateAssessment, type OwnerGateAssessment } from "@/services/owner-mode/owner-action-gate.service";
import { applyGuardedActionUpdate } from "@/services/owner-mode/owner-action-transition";
import { recoveryActionFindingCode } from "@/services/owner-home/owner-decision-candidates";

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
    // Its finding's code decides the action's intent at the gate (the same code the owner decision uses).
    include: { finding: { select: { code: true } } },
  });
  if (!action) throw new NotFoundError("RecoveryAction", actionId);

  if (action.version !== input.version) {
    throw new ConflictError("Recovery action was modified by another request. Reload and retry.", {
      expectedVersion: action.version,
    });
  }

  const data: Record<string, unknown> = {};
  const now = new Date();
  let gateAssessment: OwnerGateAssessment | null = null;

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

    // EH-01/EH-02 — owner-mode safety gate (default-on, opt-out aware) before a material transition,
    // same as every other owner-domain action service, after the request's own validation (a request
    // that fails it never records a block).
    gateAssessment = await enforceOwnerActionGates({
      workspaceId, businessId: action.businessId, actionId, domain: "recovery", toStatus: to,
      findingCode: recoveryActionFindingCode(action), findingId: action.findingId,
    });
    data.status = to;
  }

  if (input.assignedToUserId !== undefined) data.assignedToUserId = input.assignedToUserId;
  if (input.completionNotes !== undefined) data.completionNotes = input.completionNotes;
  if (input.actualOutcome !== undefined) data.actualOutcome = input.actualOutcome;
  data.version = { increment: 1 };

  // Compare-and-set on the version AND status the update was validated against: a concurrent change or a
  // double submission never applies a stale transition twice.
  const { row: updated, transitioned } = await applyGuardedActionUpdate<typeof action>(db.recoveryAction, {
    entity: "RecoveryAction", actionId, workspaceId, expectedStatus: action.status, expectedVersion: action.version, toStatus: input.status, data,
  });
  // An identical concurrent request already applied this transition: nothing more to record or trigger.
  if (!transitioned) return updated;

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.RECOVERY_ACTION_UPDATED,
    actorId,
    workspaceId,
    entityType: "RecoveryAction",
    entityId: actionId,
    payload: { status: updated.status, assignedToUserId: updated.assignedToUserId },
  });
  // The gate's Owner-mode assessment is recorded only now that the transition is validated and saved.
  if (gateAssessment) await recordOwnerGateAssessment(gateAssessment);

  // Mandatory adaptive re-evaluation (CLAUDE.md): a completed recovery
  // action is exactly the "failed implementation" / "resolved critical
  // blocker" class of event that must route into a fresh diagnosis cycle,
  // mirroring every other owner-domain action service (finance/cashflow/
  // sales/marketing/operations/strategy). Recovery predates that pattern
  // and was never wired to it -- this closes that gap without changing any
  // other behavior.
  if (updated.status === "completed") {
    await emitAuditEvent({
      eventName: AUDIT_EVENTS.RECOVERY_ACTION_COMPLETED,
      actorId,
      workspaceId,
      entityType: "RecoveryAction",
      entityId: actionId,
      payload: { businessId: updated.businessId, cycleId: updated.cycleId },
    });
    try {
      const latestSnapshot = await db.ownerMetricSnapshot.findFirst({
        where: { businessId: updated.businessId, workspaceId, periodEnd: { lte: new Date() } },
        orderBy: { periodEnd: "desc" },
        select: { id: true },
      });
      if (latestSnapshot) {
        const { runCycle } = await import("./cycle.service");
        const newCycle = await runCycle(updated.businessId, latestSnapshot.id, actorId, workspaceId);
        await emitAuditEvent({
          eventName: AUDIT_EVENTS.RECOVERY_REASSESSMENT_TRIGGERED,
          actorId,
          workspaceId,
          entityType: "RecoveryCycle",
          entityId: newCycle.id,
          payload: { businessId: updated.businessId, trigger: "action_completed", triggerActionId: actionId },
        });
      }
    } catch {
      // Re-diagnosis failure must not fail the action update -- advisory only.
    }
  }

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
