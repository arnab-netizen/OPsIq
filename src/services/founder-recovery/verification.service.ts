/**
 * Founder Recovery — outcome verification service.
 *
 * Records a real before/after verification for a recovery action: it reads the
 * action's baseline + target + direction, compares the owner-supplied after
 * value, and persists a verification with a concrete status (never hardcoded to
 * confidence 0). Workspace ownership is enforced.
 */
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError, ValidationError } from "@/infra/errors";
import { verifyOutcome } from "@/domain/founder-recovery/verification";
import { canRecordOutcome } from "@/domain/founder-recovery/verification-evidence";

export interface RecordVerificationInput {
  afterValue: number | null;
  evidence?: string;
  disputed?: boolean;
}

export async function recordVerification(
  actionId: string,
  input: RecordVerificationInput,
  actorId: string,
  workspaceId: string
) {
  const action = await db.recoveryAction.findFirst({
    where: { id: actionId, workspaceId },
  });
  if (!action) throw new NotFoundError("RecoveryAction", actionId);

  // An outcome is observable only once work has started (see verification-evidence.ts).
  if (!canRecordOutcome(action.status)) {
    throw new ValidationError("Start this action before recording its outcome.", {
      fieldErrors: [{ path: "status", message: `Outcome cannot be recorded while the action is ${action.status}` }],
    });
  }

  if (action.baselineValue === null || action.baselineValue === undefined) {
    throw new ValidationError(
      "Cannot verify an action without a baseline metric value. Re-run diagnosis to capture a baseline."
    );
  }

  const direction = action.direction === "down" ? "down" : "up";
  const result = verifyOutcome({
    baselineValue: action.baselineValue,
    targetValue: action.targetValue ?? null,
    afterValue: input.afterValue,
    direction,
    disputed: input.disputed,
  });

  const verification = await db.recoveryVerification.create({
    data: {
      id: randomUUID(),
      actionId,
      cycleId: action.cycleId,
      workspaceId,
      metric: action.metricToMove,
      baselineValue: action.baselineValue,
      targetValue: action.targetValue ?? 0,
      afterValue: input.afterValue,
      direction,
      verificationWindowDays: action.verificationWindowDays,
      actualMovement: result.actualMovement,
      status: result.status,
      evidence: input.evidence ?? result.reason,
      verifiedBy: actorId,
      verifiedAt: input.afterValue === null ? null : new Date(),
    },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.RECOVERY_OUTCOME_VERIFIED,
    actorId,
    workspaceId,
    entityType: "RecoveryVerification",
    entityId: verification.id,
    payload: {
      actionId,
      metric: action.metricToMove,
      status: result.status,
      reachedTarget: result.reachedTarget,
    },
  });

  // Mandatory adaptive re-evaluation (CLAUDE.md): a verified-improved
  // outcome is new critical evidence that must route into a fresh
  // diagnosis cycle, mirroring every other owner-domain verification
  // service (finance/cashflow/sales/marketing/operations/strategy).
  if (result.reachedTarget) {
    try {
      const latestSnapshot = await db.ownerMetricSnapshot.findFirst({
        where: { businessId: action.businessId, workspaceId },
        orderBy: { periodEnd: "desc" },
        select: { id: true },
      });
      if (latestSnapshot) {
        const { runCycle } = await import("./cycle.service");
        const newCycle = await runCycle(action.businessId, latestSnapshot.id, actorId, workspaceId);
        await emitAuditEvent({
          eventName: AUDIT_EVENTS.RECOVERY_VERIFICATION_REASSESSMENT_TRIGGERED,
          actorId,
          workspaceId,
          entityType: "RecoveryCycle",
          entityId: newCycle.id,
          payload: { businessId: action.businessId, trigger: "verification_success", triggerVerificationId: verification.id },
        });
      }
    } catch {
      // Re-diagnosis failure must not fail the verification record -- advisory only.
    }
  }

  return { verification, result };
}
