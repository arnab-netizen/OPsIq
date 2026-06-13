/**
 * Owner SOP & Execution Accountability (Module 7) — outcome verification service.
 *
 * Records a real before/after verification for an execution action and
 * classifies it via the SHARED Module 1 `verifyOutcome` logic (never hardcoded).
 * Workspace ownership is enforced; a missing before-value fails closed.
 */
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError, ValidationError } from "@/infra/errors";
import { verifyOutcome } from "@/domain/founder-recovery/verification";
import type { SopVerifyInput } from "@/domain/owner-sop/validation";

export async function recordSopVerification(
  actionId: string,
  input: SopVerifyInput,
  actorId: string,
  workspaceId: string
) {
  const action = await db.ownerSopAction.findFirst({
    where: { id: actionId, workspaceId },
  });
  if (!action) throw new NotFoundError("OwnerSopAction", actionId);

  if (input.beforeValue === null || input.beforeValue === undefined) {
    throw new ValidationError(
      "Cannot verify an execution action without a before (baseline) value for the metric."
    );
  }

  const direction = input.targetDirection === "down" ? "down" : "up";
  const result = verifyOutcome({
    baselineValue: input.beforeValue,
    targetValue: input.targetValue ?? null,
    afterValue: input.afterValue,
    direction,
    disputed: input.disputed,
  });

  const verification = await db.ownerSopVerification.create({
    data: {
      id: randomUUID(),
      workspaceId,
      businessId: action.businessId,
      actionId,
      verificationMetric: action.verificationMetric,
      beforeValue: input.beforeValue,
      afterValue: input.afterValue,
      targetDirection: direction,
      targetValue: input.targetValue ?? null,
      status: result.status,
      confidence: action.confidence,
      evidence: input.evidence ?? [result.reason],
      verifiedAt: input.afterValue === null ? null : new Date(),
    },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.OWNER_SOP_OUTCOME_VERIFIED,
    actorId,
    workspaceId,
    entityType: "OwnerSopVerification",
    entityId: verification.id,
    payload: {
      actionId,
      metric: action.verificationMetric,
      status: result.status,
      reachedTarget: result.reachedTarget,
    },
  });

  return { verification, result };
}
