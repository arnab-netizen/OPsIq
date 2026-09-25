/**
 * Owner Operations (Module 4) — outcome verification service.
 *
 * Records a real before/after verification for an operations action and
 * classifies it via the SHARED Module 1 `verifyOutcome` logic (never hardcoded).
 * Workspace ownership is enforced; the baseline is measured unless the owner reports one (provenance recorded).
 */
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError, ValidationError } from "@/infra/errors";
import { verifyOutcome } from "@/domain/founder-recovery/verification";
import {
  canRecordOutcome,
  measuredBaselineFor,
  resolveVerificationBaseline,
} from "@/domain/founder-recovery/verification-evidence";
import type { OperationsVerifyInput } from "@/domain/owner-operations/validation";

export async function recordOperationsVerification(
  actionId: string,
  input: OperationsVerifyInput,
  actorId: string,
  workspaceId: string
) {
  const action = await db.ownerOperationsAction.findFirst({
    where: { id: actionId, workspaceId },
    include: { finding: { select: { sourceMetric: true, sourceValue: true } } },
  });
  if (!action) throw new NotFoundError("OwnerOperationsAction", actionId);

  // An outcome is observable only once work has started (see verification-evidence.ts).
  if (!canRecordOutcome(action.status)) {
    throw new ValidationError("Start this action before recording its outcome.", {
      fieldErrors: [{ path: "status", message: `Outcome cannot be recorded while the action is ${action.status}` }],
    });
  }

  // Baseline provenance: measured by the diagnosis unless the owner reports a different value.
  const baseline = resolveVerificationBaseline(
    input.beforeValue,
    measuredBaselineFor(action.verificationMetric, action.finding)
  );
  if (!baseline.ok) {
    throw new ValidationError(baseline.reason, {
      fieldErrors: [{ path: "beforeValue", message: baseline.reason }],
    });
  }

  const direction = input.targetDirection === "down" ? "down" : "up";
  const result = verifyOutcome({
    baselineValue: baseline.beforeValue,
    targetValue: input.targetValue ?? null,
    afterValue: input.afterValue,
    direction,
    disputed: input.disputed,
  });

  const verification = await db.ownerOperationsVerification.create({
    data: {
      id: randomUUID(),
      workspaceId,
      businessId: action.businessId,
      actionId,
      verificationMetric: action.verificationMetric,
      beforeValue: baseline.beforeValue,
      baselineSource: baseline.baselineSource,
      measuredBeforeValue: baseline.measuredBeforeValue,
      afterValue: input.afterValue,
      targetDirection: direction,
      targetValue: input.targetValue ?? null,
      status: result.status,
      confidence: action.confidence,
      evidence: [...(input.evidence ?? [result.reason]), baseline.provenanceNote],
      verifiedAt: input.afterValue === null ? null : new Date(),
    },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.OWNER_OPERATIONS_OUTCOME_VERIFIED,
    actorId,
    workspaceId,
    entityType: "OwnerOperationsVerification",
    entityId: verification.id,
    payload: {
      actionId,
      metric: action.verificationMetric,
      status: result.status,
      reachedTarget: result.reachedTarget,
      baselineSource: baseline.baselineSource,
      measuredBeforeValue: baseline.measuredBeforeValue,
    },
  });

  // On verified success, trigger re-diagnosis to capture improved business state.
  if (result.reachedTarget) {
    try {
      const latestSnapshot = await db.ownerOperationsSnapshot.findFirst({
        where: { businessId: action.businessId, workspaceId },
        orderBy: { periodEnd: "desc" },
        select: { id: true },
      });
      if (latestSnapshot) {
        const { runOperationsDiagnosis } = await import("./diagnosis.service");
        const newCycle = await runOperationsDiagnosis(action.businessId, latestSnapshot.id, actorId, workspaceId);
        await emitAuditEvent({
          eventName: AUDIT_EVENTS.OWNER_OPERATIONS_VERIFICATION_REASSESSMENT_TRIGGERED,
          actorId,
          workspaceId,
          entityType: "OwnerOperationsCycle",
          entityId: newCycle.id,
          payload: { trigger: "verification_success", triggerVerificationId: verification.id },
        });
      }
    } catch (_err) {
      // Re-diagnosis failure must not fail the verification record — advisory only.
    }
  }

  return { verification, result };
}
