/**
 * Owner Finance (Module 2) — idempotent verification-to-learning bridge.
 *
 * Called best-effort after every OwnerFinanceVerification is recorded. Creates:
 * 1. OwnerFinanceOutcomeSignal — lightweight query layer for Bayesian effectiveness.
 * 2. ControlledLearningCandidate — SEC-005 governance record (awaiting human approval).
 *
 * Idempotency: the @@unique([workspaceId, verificationId]) constraint on
 * OwnerFinanceOutcomeSignal makes repeated calls safe — duplicate is detected
 * and skipped before any writes.
 *
 * This service MUST NOT throw. Every failure path returns a result object.
 * The caller (verification.service.ts) catches any unexpected throws.
 */
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { createLearningCandidate } from "@/services/controlled-learning-candidate.service";
import { extractReachedTargetFromVerification } from "@/domain/owner-finance/outcome-signals";

export interface LearningBridgeResult {
  signalId: string | null;
  candidateId: string | null;
  skipped: boolean;
  reason?: string;
}

/**
 * Bridge an OwnerFinanceVerification into the learning infrastructure.
 * Safe to call multiple times for the same verificationId (idempotent).
 */
export async function bridgeVerificationToLearning(
  verificationId: string,
  workspaceId: string,
  actorId: string
): Promise<LearningBridgeResult> {
  // Idempotency check — if signal already recorded, return immediately
  const existing = await db.ownerFinanceOutcomeSignal.findUnique({
    where: { verificationId },
    select: { id: true, learningCandidateId: true },
  });
  if (existing) {
    return {
      signalId: existing.id,
      candidateId: existing.learningCandidateId ?? null,
      skipped: true,
      reason: "already_recorded",
    };
  }

  // Fetch verification with its parent action (needed for findingCode, recommendationCode)
  const verification = await db.ownerFinanceVerification.findFirst({
    where: { id: verificationId, workspaceId },
    include: {
      action: {
        select: {
          id: true,
          cycleId: true,
          findingCode: true,
          recommendationCode: true,
          businessId: true,
          verificationMetric: true,
        },
      },
    },
  });

  if (!verification || !verification.action) {
    await emitAuditEvent({
      eventName: AUDIT_EVENTS.OWNER_FINANCE_LEARNING_SIGNAL_SKIPPED,
      actorId,
      workspaceId,
      entityType: "OwnerFinanceVerification",
      entityId: verificationId,
      payload: { reason: "verification_or_action_not_found" },
    });
    return { signalId: null, candidateId: null, skipped: true, reason: "not_found" };
  }

  const action = verification.action;
  const reachedTarget = extractReachedTargetFromVerification({
    status: verification.status,
    afterValue: verification.afterValue,
    targetValue: verification.targetValue,
    targetDirection: verification.targetDirection,
  });

  // Create the outcome signal (query layer)
  const signalId = randomUUID();
  await db.ownerFinanceOutcomeSignal.create({
    data: {
      id: signalId,
      workspaceId,
      businessId: action.businessId,
      verificationId,
      actionId: action.id,
      findingCode: action.findingCode,
      recommendationCode: action.recommendationCode,
      verificationStatus: verification.status,
      reachedTarget,
      beforeValue: verification.beforeValue,
      afterValue: verification.afterValue,
      recordedAt: verification.verifiedAt ?? new Date(),
    },
  });

  // Create the SEC-005 governance record (best-effort — CLC failure must not roll back signal)
  let candidateId: string | null = null;
  try {
    const candidateResult = await createLearningCandidate(db as Parameters<typeof createLearningCandidate>[0], {
      workspaceId,
      businessId: action.businessId,
      evidenceSummary: [
        `Finance verification ${verificationId}:`,
        `finding=${action.findingCode}`,
        `metric=${action.verificationMetric}`,
        `status=${verification.status}`,
        `reachedTarget=${reachedTarget}`,
        `before=${verification.beforeValue ?? "null"}`,
        `after=${verification.afterValue ?? "null"}`,
      ].join(" "),
      metadata: {
        domain: "finance",
        verificationId,
        actionId: action.id,
        cycleId: action.cycleId,
        findingCode: action.findingCode,
        recommendationCode: action.recommendationCode,
        verificationStatus: verification.status,
        reachedTarget,
        signalId,
      },
      classificationInput: {
        workspaceId,
        sourceLabel: "SYNTHETIC_ONLY_CANDIDATE",
        evidenceOrigin: "owner_manual_entry",
        publicSourceFullTextVerified: false,
        originatingWorkspaceId: workspaceId,
        involvesSafetyRelatedFailure: false,
        hasConflictingEvidence: false,
        candidateRecord: {
          // Record 1: owner decision = the diagnosis cycle that produced the action
          ownerDecisionId: action.cycleId,
          ownerDecisionVerdict: "approved",
          ownerDecisionWorkspaceId: workspaceId,
          // Record 2: action taken
          actionId: action.id,
          actionWasTaken: true,
          actionWorkspaceId: workspaceId,
          // Record 3: outcome window — verification exists so window has elapsed
          outcomeId: verificationId,
          outcomeWindowElapsed: true,
          outcomeWorkspaceId: workspaceId,
          // Record 4: human approval pending (SEC-005 requires separate promotion step)
          humanApprovedBy: null,
          humanApprovedAt: null,
          humanReviewWorkspaceId: workspaceId,
        },
      },
      outcomeRecordedAt: verification.verifiedAt ?? new Date(),
    });
    candidateId = candidateResult.id;

    // Backlink the candidate onto the signal record
    if (candidateId) {
      await db.ownerFinanceOutcomeSignal.update({
        where: { id: signalId },
        data: { learningCandidateId: candidateId },
      });
    }
  } catch {
    // CLC failure is non-fatal — signal is already persisted; audit below captures state
  }

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.OWNER_FINANCE_LEARNING_SIGNAL_RECORDED,
    actorId,
    workspaceId,
    entityType: "OwnerFinanceOutcomeSignal",
    entityId: signalId,
    payload: {
      verificationId,
      actionId: action.id,
      findingCode: action.findingCode,
      recommendationCode: action.recommendationCode,
      verificationStatus: verification.status,
      reachedTarget,
      candidateId,
    },
  });

  return { signalId, candidateId, skipped: false };
}
