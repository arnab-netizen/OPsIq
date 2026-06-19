import type { PrismaClient } from "@/generated/prisma/client";
import { assertWorkspaceScopedQuery } from "@/domain/owner-mode/security-rules";
import { EVIDENCE_ORIGIN_FORBIDDEN } from "@/domain/owner-mode/controlled-learning";

export interface AdmitCandidateInput {
  workspaceId: string;
  candidateId: string;
  admittedBy: string;
  admittedAt: Date;
  sourceLabel: string;
  evidenceOrigin: string;
  eligibilityStatus: string;
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
    eligibilityStatus,
    admissionNotes,
  } = input;

  // Independent re-check: forbidden evidence origins are never admitted regardless of candidate status
  if (EVIDENCE_ORIGIN_FORBIDDEN.has(evidenceOrigin as any)) {
    return {
      admitted: false,
      violations: [`Evidence origin "${evidenceOrigin}" is forbidden and may never be admitted`],
    };
  }

  // Verify candidate exists in workspace
  const candidate = await (prisma as any).controlledLearningCandidate.findFirst({
    where: { id: candidateId, workspaceId },
  });

  if (!candidate) {
    return { admitted: false, violations: ["Candidate not found or wrong workspace"] };
  }

  // Verify eligibility status
  if (!eligibilityStatus.startsWith("LEARNING_ELIGIBLE_")) {
    return {
      admitted: false,
      violations: [`Candidate eligibility status does not allow admission: ${eligibilityStatus}`],
    };
  }

  // Verify not already admitted
  const existing = await (prisma as any).controlledLearningAdmission.findFirst({
    where: { workspaceId, candidateId },
  });

  if (existing) {
    return { admitted: false, violations: ["Candidate already admitted"] };
  }

  const admission = await (prisma as any).controlledLearningAdmission.create({
    data: {
      workspaceId,
      candidateId,
      admittedBy,
      admittedAt,
      sourceLabel,
      evidenceOrigin,
      eligibilityStatus,
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
