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
import { Prisma } from "@/generated/prisma/client";
import { toAuditActor } from "@/domain/owner-budget/system-actor";

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
  // Canonical system-actor contract (F-AUDIT-CRON-ACTOR): the scheduler
  // handler passes SCHEDULER_SYSTEM_ACTOR here, a sentinel that has never
  // corresponded to a real users row. toAuditActor() maps it to
  // {actorType:"system"} with actorId omitted (NULL, FK-exempt); any real
  // human actorId passes through unchanged with actorType:"user".
  const actor = toAuditActor(actorId);

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
      ...actor,
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

  // Create the outcome signal (query layer).
  // Handle P2002 (unique constraint on verificationId) from a concurrent race:
  // two callers can both pass the findUnique check before either writes; the
  // second writer hits the constraint and we re-check to return gracefully.
  const signalId = randomUUID();
  try {
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
  } catch (createErr: unknown) {
    if (
      createErr instanceof Prisma.PrismaClientKnownRequestError &&
      createErr.code === "P2002"
    ) {
      // Concurrent write won the race — re-read to return consistent signalId
      const raceWinner = await db.ownerFinanceOutcomeSignal.findUnique({
        where: { verificationId },
        select: { id: true, learningCandidateId: true },
      });
      return {
        signalId: raceWinner?.id ?? null,
        candidateId: raceWinner?.learningCandidateId ?? null,
        skipped: true,
        reason: "already_recorded",
      };
    }
    throw createErr;
  }

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
    ...actor,
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

// Terminal verification statuses that produce a definitive learning outcome.
// "inconclusive" and "unverified" are intentionally excluded — inconclusive has no
// determined outcome; unverified means the verification hasn't been submitted yet.
const BRIDGEABLE_VERIFICATION_STATUSES = ["verified_improved", "verified_not_improved", "disputed"] as const;

export interface ReconcileResult {
  gapsFound: number;
  gapsBridged: number;
  gapsSkipped: number;
  errors: string[];
}

/**
 * Durable recovery for bridge failures.
 *
 * Finds every OwnerFinanceVerification in terminal status that has no corresponding
 * OwnerFinanceOutcomeSignal, then calls bridgeVerificationToLearning() for each.
 * The bridge is idempotent, so any already-bridged verification is skipped safely.
 *
 * Call from a cron/admin endpoint to recover verifications that were persisted but
 * whose bridge call failed (network error, transient DB error, etc.).
 */
export async function reconcileMissingFinanceLearningSignals(
  workspaceId: string,
  actorId: string
): Promise<ReconcileResult> {
  const gaps = await db.ownerFinanceVerification.findMany({
    where: {
      workspaceId,
      status: { in: [...BRIDGEABLE_VERIFICATION_STATUSES] },
      outcomeSignal: null,
    },
    select: { id: true },
    orderBy: { verifiedAt: "asc" },
  });

  const result: ReconcileResult = {
    gapsFound: gaps.length,
    gapsBridged: 0,
    gapsSkipped: 0,
    errors: [],
  };

  for (const { id: verificationId } of gaps) {
    try {
      const bridgeResult = await bridgeVerificationToLearning(verificationId, workspaceId, actorId);
      if (bridgeResult.skipped) {
        result.gapsSkipped++;
      } else {
        result.gapsBridged++;
      }
    } catch (err) {
      result.errors.push(
        `verificationId=${verificationId}: ${String(err)}`
      );
    }
  }

  return result;
}
