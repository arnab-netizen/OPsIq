/**
 * Owner Finance (Module 2) — outcome verification service.
 *
 * Records a real before/after verification for a finance action and classifies
 * it via the SHARED Module 1 `verifyOutcome` logic (never hardcoded). Workspace
 * ownership is enforced; a missing before-value fails closed.
 */
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError, ValidationError } from "@/infra/errors";
import { verifyOutcome } from "@/domain/founder-recovery/verification";
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
  });
  if (!action) throw new NotFoundError("OwnerFinanceAction", actionId);

  if (input.beforeValue === null || input.beforeValue === undefined) {
    throw new ValidationError(
      "Cannot verify a finance action without a before (baseline) value for the metric."
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

  const verification = await db.ownerFinanceVerification.create({
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

  return { verification, result };
}
