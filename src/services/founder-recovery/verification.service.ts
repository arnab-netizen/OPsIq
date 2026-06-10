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

  return { verification, result };
}
