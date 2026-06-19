import type { PrismaClient } from "@/generated/prisma/client";
import { assertWorkspaceScopedQuery } from "@/domain/owner-mode/security-rules";
import {
  EVIDENCE_ORIGIN_FORBIDDEN,
  ELIGIBILITY_ALLOWS_PROMOTION,
  type ControlledLearningEligibilityStatus,
} from "@/domain/owner-mode/controlled-learning";

// Evidence origin strings that are always forbidden regardless of candidate status.
// Includes the domain set plus "public_source_unverified" as an explicit string guard.
const ADMISSION_FORBIDDEN_ORIGINS = new Set([
  ...EVIDENCE_ORIGIN_FORBIDDEN,
  "public_source_unverified",
]);

export interface AdmitCandidateInput {
  workspaceId: string;
  candidateId: string;
  admittedBy: string;
  admittedAt: Date;
  sourceLabel: string;
  evidenceOrigin: string;
  // eligibilityStatus removed — must be read from DB, not accepted from caller
  admissionNotes: string;
}

export interface AdmitCandidateResult {
  admitted: boolean;
  violations: string[];
  admission?: object;
}

export async function admitCandidate(
  prisma: PrismaClient,
  input: AdmitCandidateInput
): Promise<AdmitCandidateResult> {
  assertWorkspaceScopedQuery({ workspaceId: input.workspaceId });
  const {
    workspaceId,
    candidateId,
    admittedBy,
    admittedAt,
    sourceLabel,
    evidenceOrigin,
    admissionNotes,
  } = input;

  // Guard 1: forbidden evidence origins blocked before any DB access
  if (ADMISSION_FORBIDDEN_ORIGINS.has(evidenceOrigin)) {
    return {
      admitted: false,
      violations: [`Evidence origin "${evidenceOrigin}" is forbidden and may never be admitted`],
    };
  }

  // Guard 2: fetch candidate from DB — eligibilityStatus comes from DB only, never from caller
  const candidate = await (prisma as any).controlledLearningCandidate.findFirst({
    where: { id: candidateId, workspaceId },
    select: {
      id: true,
      workspaceId: true,
      eligibilityStatus: true,
      evidenceSourceType: true,
      promotionLocked: true,
    },
  });

  if (!candidate) {
    return { admitted: false, violations: ["Candidate not found or wrong workspace"] };
  }

  // Cross-workspace guard: DB record workspace must match request workspace
  if (candidate.workspaceId !== workspaceId) {
    return { admitted: false, violations: ["Cross-workspace admission attempt blocked"] };
  }

  // Guard 3: revalidate eligibility using stored DB status — caller-provided status is never used
  const dbEligibilityStatus = candidate.eligibilityStatus as ControlledLearningEligibilityStatus;
  const allowsPromotion = ELIGIBILITY_ALLOWS_PROMOTION[dbEligibilityStatus] ?? false;
  if (!allowsPromotion) {
    return {
      admitted: false,
      violations: [
        `Candidate DB eligibility status does not allow admission: ${dbEligibilityStatus}`,
      ],
    };
  }

  // Guard 4: an APPROVED review must exist — cannot skip the review step
  const approvedReview = await (prisma as any).controlledLearningReview.findFirst({
    where: { candidateId, workspaceId, decision: "APPROVED" },
    select: { id: true },
  });
  if (!approvedReview) {
    return {
      admitted: false,
      violations: [
        "No APPROVED review found for candidate — a review must be completed and approved before admission",
      ],
    };
  }

  // Guard 5 (HIGH-6): block admission if a CRITICAL unmitigated harm event exists
  const criticalHarm = await (prisma as any).controlledLearningHarmEvent.findFirst({
    where: { candidateId, workspaceId, severity: "CRITICAL", mitigated: false },
    select: { id: true },
  });
  if (criticalHarm) {
    return {
      admitted: false,
      violations: [
        "Candidate has an unmitigated CRITICAL harm event — admission blocked until harm is mitigated",
      ],
    };
  }

  // Guard 6: duplicate admission guard
  const existing = await (prisma as any).controlledLearningAdmission.findFirst({
    where: { workspaceId, candidateId },
    select: { id: true },
  });
  if (existing) {
    return { admitted: false, violations: ["Candidate already admitted"] };
  }

  // All guards passed — write admission using DB eligibilityStatus, not caller input
  const admission = await (prisma as any).controlledLearningAdmission.create({
    data: {
      workspaceId,
      candidateId,
      admittedBy,
      admittedAt,
      sourceLabel,
      evidenceOrigin,
      eligibilityStatus: dbEligibilityStatus, // authoritative value from DB
      admissionNotes,
    },
  });

  return { admitted: true, violations: [], admission };
}

export async function getAdmission(
  prisma: PrismaClient,
  workspaceId: string,
  candidateId: string
): Promise<object | null> {
  assertWorkspaceScopedQuery({ workspaceId });
  return (prisma as any).controlledLearningAdmission.findFirst({
    where: { workspaceId, candidateId },
  });
}

export async function listAdmissionsForWorkspace(
  prisma: PrismaClient,
  workspaceId: string
): Promise<object[]> {
  assertWorkspaceScopedQuery({ workspaceId });
  return (prisma as any).controlledLearningAdmission.findMany({
    where: { workspaceId },
  });
}
