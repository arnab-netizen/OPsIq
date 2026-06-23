/**
 * Phase 29 Slice 2: DB/Runtime service for ControlledLearningCandidate
 *
 * All entry points enforce workspace scoping.
 * Cross-tenant access throws immediately.
 * Promotion requires human approvedBy + approvedAt (SEC-005).
 * Records are append-only: promoted records cannot be mutated.
 * All mutations emit audit entries.
 */

import type { PrismaClient } from "@/generated/prisma/client";
import {
  classifyLearningCandidate,
  validateCandidatePromotion,
  buildCandidateAuditEntry,
  assertCandidateImmutable,
  ControlledLearningCandidateInput,
  ControlledLearningPromotionInput,
  CandidateAuditEntry,
  ControlledLearningEligibilityStatus,
} from "../domain/owner-mode/controlled-learning";
import { assertWorkspaceScopedQuery } from "../domain/owner-mode/security-rules";

// ─── Input Types ──────────────────────────────────────────────────────────────

export interface CreateLearningCandidateInput {
  workspaceId: string;
  businessId: string;
  sourceRecommendationId?: string;
  evidenceSummary: string;
  metadata?: Record<string, unknown>;
  classificationInput: ControlledLearningCandidateInput;
  // HIGH-3: Caller-supplied timestamp of when the business outcome was recorded.
  // Stored server-side so admission service can enforce the 30-day outcome window
  // without trusting the caller-controlled outcomeWindowElapsed boolean.
  outcomeRecordedAt?: Date;
}

export interface PromoteLearningCandidateInput {
  approvedBy: string;
  approvedAt: string;
  sourceLabel: ControlledLearningPromotionInput["sourceLabel"];
}

// ─── Fingerprint ──────────────────────────────────────────────────────────────

function computeAuditFingerprint(
  workspaceId: string,
  sourceOwnerDecisionId: string,
  sourceActionId: string,
  sourceOutcomeId: string
): string {
  return [workspaceId, sourceOwnerDecisionId, sourceActionId, sourceOutcomeId].join("::");
}

// ─── createLearningCandidate ──────────────────────────────────────────────────

export async function createLearningCandidate(
  prisma: PrismaClient,
  input: CreateLearningCandidateInput
): Promise<{ id: string; eligibilityStatus: string; eligible: boolean }> {
  assertWorkspaceScopedQuery({ workspaceId: input.workspaceId });

  if (input.classificationInput.workspaceId !== input.workspaceId) {
    throw new Error(
      "Cross-tenant violation: classificationInput.workspaceId does not match input.workspaceId"
    );
  }

  const classification = classifyLearningCandidate(input.classificationInput);

  const rec = input.classificationInput.candidateRecord;
  const fingerprint = computeAuditFingerprint(
    input.workspaceId,
    rec.ownerDecisionId,
    rec.actionId,
    rec.outcomeId
  );

  const now = new Date().toISOString();

  const candidate = await (prisma as any).controlledLearningCandidate.create({
    data: {
      workspaceId: input.workspaceId,
      businessId: input.businessId,
      sourceRecommendationId: input.sourceRecommendationId ?? null,
      sourceOwnerDecisionId: rec.ownerDecisionId,
      sourceActionId: rec.actionId,
      sourceOutcomeId: rec.outcomeId,
      outcomeRecordedAt: input.outcomeRecordedAt ?? null,
      eligibilityStatus: classification.status,
      rejectionReasons: JSON.stringify(classification.rejectionReasons),
      evidenceSourceType: input.classificationInput.evidenceOrigin,
      evidenceSummary: input.evidenceSummary,
      humanReviewed: false,
      promotionLocked: false,
      auditFingerprint: fingerprint,
      metadata: JSON.stringify(input.metadata ?? {}),
    },
  });

  const auditAction = classification.eligible ? "SUBMITTED" : "REJECTED";
  const auditDetail = classification.eligible
    ? `Candidate submitted with status ${classification.status}`
    : `Candidate rejected: ${classification.rejectionReasons.join(", ")}`;

  await (prisma as any).controlledLearningCandidateAuditEntry.create({
    data: {
      workspaceId: input.workspaceId,
      candidateId: candidate.id,
      action: auditAction,
      actorId: null,
      detail: auditDetail,
      timestamp: new Date(now),
    },
  });

  return {
    id: candidate.id,
    eligibilityStatus: classification.status,
    eligible: classification.eligible,
  };
}

// ─── classifyAndCreateLearningCandidate ──────────────────────────────────────

export async function classifyAndCreateLearningCandidate(
  prisma: PrismaClient,
  input: CreateLearningCandidateInput
): Promise<{ id: string; eligibilityStatus: string; eligible: boolean }> {
  return createLearningCandidate(prisma, input);
}

// ─── getLearningCandidate ─────────────────────────────────────────────────────

export async function getLearningCandidate(
  prisma: PrismaClient,
  workspaceId: string,
  candidateId: string
): Promise<unknown | null> {
  assertWorkspaceScopedQuery({ workspaceId });

  return (prisma as any).controlledLearningCandidate.findFirst({
    where: { id: candidateId, workspaceId },
  });
}

// ─── listLearningCandidatesForWorkspace ───────────────────────────────────────

export async function listLearningCandidatesForWorkspace(
  prisma: PrismaClient,
  workspaceId: string
): Promise<unknown[]> {
  assertWorkspaceScopedQuery({ workspaceId });

  return (prisma as any).controlledLearningCandidate.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
  });
}

// ─── promoteLearningCandidate ─────────────────────────────────────────────────

export async function promoteLearningCandidate(
  prisma: PrismaClient,
  workspaceId: string,
  candidateId: string,
  promotionInput: PromoteLearningCandidateInput
): Promise<{ promoted: boolean; violations: string[] }> {
  assertWorkspaceScopedQuery({ workspaceId });

  const candidate = await (prisma as any).controlledLearningCandidate.findFirst({
    where: { id: candidateId, workspaceId },
  });

  if (!candidate) {
    return { promoted: false, violations: ["Candidate not found or wrong workspace"] };
  }

  if (candidate.promotionLocked) {
    return { promoted: false, violations: ["Candidate is already promoted (locked)"] };
  }

  const eligibilityStatus = candidate.eligibilityStatus as ControlledLearningEligibilityStatus;
  const allowedStatuses: ControlledLearningEligibilityStatus[] = [
    "LEARNING_ELIGIBLE_VERIFIED_OUTCOME",
    "LEARNING_ELIGIBLE_HUMAN_REVIEWED",
  ];
  if (!allowedStatuses.includes(eligibilityStatus)) {
    return {
      promoted: false,
      violations: [`Candidate eligibilityStatus ${eligibilityStatus} does not allow promotion`],
    };
  }

  const promotionResult = validateCandidatePromotion({
    workspaceId,
    candidateId,
    approvedBy: promotionInput.approvedBy,
    approvedAt: promotionInput.approvedAt,
    sourceLabel: promotionInput.sourceLabel,
  });

  if (!promotionResult.approved) {
    return { promoted: false, violations: promotionResult.violations };
  }

  await (prisma as any).controlledLearningCandidate.update({
    where: { id: candidateId },
    data: {
      promotionLocked: true,
      promotedAt: new Date(promotionInput.approvedAt),
      humanReviewed: true,
      reviewerId: promotionInput.approvedBy,
    },
  });

  await (prisma as any).controlledLearningCandidateAuditEntry.create({
    data: {
      workspaceId,
      candidateId,
      action: "PROMOTED",
      actorId: promotionInput.approvedBy,
      detail: `Promoted by ${promotionInput.approvedBy} at ${promotionInput.approvedAt}`,
      timestamp: new Date(promotionInput.approvedAt),
    },
  });

  return { promoted: true, violations: [] };
}

// ─── rejectLearningCandidate ──────────────────────────────────────────────────

export async function rejectLearningCandidate(
  prisma: PrismaClient,
  workspaceId: string,
  candidateId: string,
  actorId: string | null,
  reason: string
): Promise<{ rejected: boolean; violations: string[] }> {
  assertWorkspaceScopedQuery({ workspaceId });

  const candidate = await (prisma as any).controlledLearningCandidate.findFirst({
    where: { id: candidateId, workspaceId },
  });

  if (!candidate) {
    return { rejected: false, violations: ["Candidate not found or wrong workspace"] };
  }

  if (candidate.promotionLocked) {
    return { rejected: false, violations: ["Cannot reject a promoted (locked) candidate"] };
  }

  await (prisma as any).controlledLearningCandidateAuditEntry.create({
    data: {
      workspaceId,
      candidateId,
      action: "REJECTED",
      actorId,
      detail: reason,
      timestamp: new Date(),
    },
  });

  return { rejected: true, violations: [] };
}

// ─── assertCandidateImmutableInDB ─────────────────────────────────────────────

export async function assertCandidateImmutableInDB(
  prisma: PrismaClient,
  workspaceId: string,
  candidateId: string,
  proposedStatus: ControlledLearningEligibilityStatus
): Promise<void> {
  assertWorkspaceScopedQuery({ workspaceId });

  const candidate = await (prisma as any).controlledLearningCandidate.findFirst({
    where: { id: candidateId, workspaceId },
  });

  if (!candidate) {
    return; // nothing to assert
  }

  assertCandidateImmutable(
    candidate.eligibilityStatus as ControlledLearningEligibilityStatus,
    proposedStatus
  );
}

// ─── buildLearningCandidateAuditEntry ────────────────────────────────────────

export function buildLearningCandidateAuditEntry(
  workspaceId: string,
  candidateId: string,
  action: CandidateAuditEntry["action"],
  actorId: string | null,
  detail: string,
  now: string
): CandidateAuditEntry {
  return buildCandidateAuditEntry(workspaceId, candidateId, action, actorId, detail, now);
}
