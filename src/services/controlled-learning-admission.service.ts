import type { PrismaClient } from "@/generated/prisma/client";

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
  return (prisma as any).controlledLearningAdmission.findFirst({
    where: { workspaceId, candidateId },
  });
}

export async function listAdmissionsForWorkspace(
  prisma: PrismaClient,
  workspaceId: string
): Promise<object[]> {
  return (prisma as any).controlledLearningAdmission.findMany({
    where: { workspaceId },
  });
}
