import type { PrismaClient } from "@/generated/prisma/client";

export type ReviewDecision = "APPROVED" | "REJECTED" | "DEFERRED";

const VALID_DECISIONS: ReviewDecision[] = ["APPROVED", "REJECTED", "DEFERRED"];

export interface CreateReviewInput {
  workspaceId: string;
  candidateId: string;
  reviewerId: string;
  decision: ReviewDecision;
  reviewNotes: string;
  reviewedAt: Date;
}

export interface ReviewRecord {
  id: string;
  workspaceId: string;
  candidateId: string;
  reviewerId: string;
  decision: string;
  reviewNotes: string;
  reviewedAt: Date;
  createdAt: Date;
  updatedAt?: Date;
}

export interface CreateReviewResult {
  violations?: string[];
  id?: string;
  workspaceId?: string;
  candidateId?: string;
  reviewerId?: string;
  decision?: string;
  reviewNotes?: string;
  reviewedAt?: Date;
  createdAt?: Date;
}

export async function createReview(
  prisma: PrismaClient,
  input: CreateReviewInput
): Promise<CreateReviewResult> {
  const { workspaceId, candidateId, reviewerId, decision, reviewNotes, reviewedAt } = input;

  if (!VALID_DECISIONS.includes(decision)) {
    return {
      violations: [`Invalid decision: "${decision}". Must be one of APPROVED, REJECTED, DEFERRED`],
    };
  }

  const candidate = await (prisma as any).controlledLearningCandidate.findFirst({
    where: { id: candidateId, workspaceId },
  });

  if (!candidate) {
    return { violations: ["Candidate not found or wrong workspace"] };
  }

  const review = await (prisma as any).controlledLearningReview.create({
    data: {
      workspaceId,
      candidateId,
      reviewerId,
      decision,
      reviewNotes,
      reviewedAt,
    },
    select: {
      id: true,
      workspaceId: true,
      candidateId: true,
      reviewerId: true,
      decision: true,
      reviewNotes: true,
      reviewedAt: true,
      createdAt: true,
    },
  });

  return review;
}

export async function listReviewsForCandidate(
  prisma: PrismaClient,
  workspaceId: string,
  candidateId: string
): Promise<ReviewRecord[]> {
  const candidate = await (prisma as any).controlledLearningCandidate.findFirst({
    where: { id: candidateId, workspaceId },
  });

  if (!candidate) {
    return [];
  }

  return (prisma as any).controlledLearningReview.findMany({
    where: { workspaceId, candidateId },
    orderBy: { reviewedAt: "desc" },
  });
}

export async function listReviewsForWorkspace(
  prisma: PrismaClient,
  workspaceId: string
): Promise<ReviewRecord[]> {
  return (prisma as any).controlledLearningReview.findMany({
    where: { workspaceId },
    orderBy: { reviewedAt: "desc" },
  });
}

export async function getReview(
  prisma: PrismaClient,
  workspaceId: string,
  reviewId: string
): Promise<ReviewRecord | null> {
  const review = await (prisma as any).controlledLearningReview.findFirst({
    where: { id: reviewId, workspaceId },
  });

  return review ?? null;
}
