/**
 * Owner Finance (Module 2) — outcome verification service.
 *
 * Records a real before/after verification for a finance action and classifies
 * it via the SHARED Module 1 `verifyOutcome` logic (never hardcoded). Workspace
 * ownership is enforced; the baseline is measured unless the owner reports one (provenance recorded).
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
import { resolveCurrentSnapshotId } from "@/services/owner-finance/snapshot.service";
import type { FinanceVerifyInput } from "@/domain/owner-finance/validation";

export async function recordFinanceVerification(
  actionId: string,
  input: FinanceVerifyInput,
  actorId: string,
  workspaceId: string
) {
  const action = await db.ownerFinanceAction.findFirst({
    where: { id: actionId, workspaceId },
    include: { finding: { select: { sourceMetric: true, sourceValue: true } } },
  });
  if (!action) throw new NotFoundError("OwnerFinanceAction", actionId);

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

  const verification = await db.ownerFinanceVerification.create({
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
    eventName: AUDIT_EVENTS.OWNER_FINANCE_OUTCOME_VERIFIED,
    actorId,
    workspaceId,
    entityType: "OwnerFinanceVerification",
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

  // On verified success, trigger re-diagnosis from the causally-linked snapshot (best-effort).
  // Phase E fix: follow action.cycleId → cycle.snapshotId → current (non-superseded) version.
  if (result.reachedTarget) {
    try {
      let targetSnapshotId: string | undefined;
      const cycle = await db.ownerFinanceCycle.findFirst({
        where: { id: action.cycleId },
        select: { snapshotId: true },
      });
      if (cycle?.snapshotId) {
        targetSnapshotId = await resolveCurrentSnapshotId(cycle.snapshotId);
      }
      if (!targetSnapshotId) {
        const snap = await db.ownerFinancialSnapshot.findFirst({
          where: { businessId: action.businessId, workspaceId, supersededById: null },
          orderBy: { periodEnd: "desc" },
          select: { id: true },
        });
        targetSnapshotId = snap?.id;
      }
      if (targetSnapshotId) {
        const { runFinanceDiagnosis } = await import("./diagnosis.service");
        const newCycle = await runFinanceDiagnosis(action.businessId, targetSnapshotId, actorId, workspaceId);
        await emitAuditEvent({
          eventName: AUDIT_EVENTS.OWNER_FINANCE_VERIFICATION_REASSESSMENT_TRIGGERED,
          actorId,
          workspaceId,
          entityType: "OwnerFinanceCycle",
          entityId: newCycle.id,
          payload: { trigger: "verification_success", triggerVerificationId: verification.id },
        });
      }
    } catch {
      // Re-diagnosis failure must not fail the verification record — advisory only.
    }
  }

  // Best-effort: record outcome signal + governed learning candidate.
  // Bridge failure must never fail the verification record itself.
  try {
    const { bridgeVerificationToLearning } = await import("./learning-bridge.service");
    await bridgeVerificationToLearning(verification.id, workspaceId, actorId);
  } catch {
    // non-fatal — verification is already persisted
  }

  return { verification, result };
}
