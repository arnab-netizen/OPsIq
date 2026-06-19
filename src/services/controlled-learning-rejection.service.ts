import type { PrismaClient } from "@/generated/prisma/client";

export interface RejectCandidateFinalInput {
  workspaceId: string;
  candidateId: string;
  rejectedBy: string;
  rejectedAt: Date;
  rejectionReason: string;
  rejectionCode: string;
}

export interface RejectCandidateFinalResult {
  rejected: boolean;
  violations: string[];
  rejection?: object;
}

export async function rejectCandidateFinal(
  prisma: PrismaClient,
  input: RejectCandidateFinalInput
): Promise<RejectCandidateFinalResult> {
  const { workspaceId, candidateId, rejectedBy, rejectedAt, rejectionReason, rejectionCode } =
    input;

  // Verify candidate exists in workspace
  const candidate = await (prisma as any).controlledLearningCandidate.findFirst({
    where: { id: candidateId, workspaceId },
  });

  if (!candidate) {
    return { rejected: false, violations: ["Candidate not found or wrong workspace"] };
  }

  // Verify not already rejected
  const existingRejection = await (prisma as any).controlledLearningRejection.findFirst({
    where: { workspaceId, candidateId },
  });

  if (existingRejection) {
    return { rejected: false, violations: ["Candidate already rejected"] };
  }

  // Verify not already admitted
  const existingAdmission = await (prisma as any).controlledLearningAdmission.findFirst({
    where: { workspaceId, candidateId },
  });

  if (existingAdmission) {
    return { rejected: false, violations: ["Candidate already admitted; cannot reject"] };
  }

  const rejection = await (prisma as any).controlledLearningRejection.create({
    data: {
      workspaceId,
      candidateId,
      rejectedBy,
      rejectedAt,
      rejectionReason,
      rejectionCode,
    },
  });

  return { rejected: true, violations: [], rejection };
}

export async function getRejection(
  prisma: PrismaClient,
  workspaceId: string,
  candidateId: string
): Promise<object | null> {
  return (prisma as any).controlledLearningRejection.findFirst({
    where: { workspaceId, candidateId },
  });
}

export async function listRejectionsForWorkspace(
  prisma: PrismaClient,
  workspaceId: string
): Promise<object[]> {
  return (prisma as any).controlledLearningRejection.findMany({
    where: { workspaceId },
  });
}
