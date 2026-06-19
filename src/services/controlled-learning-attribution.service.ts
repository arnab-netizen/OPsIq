import type { PrismaClient } from "@/generated/prisma/client";
import { assertWorkspaceScopedQuery } from "@/domain/owner-mode/security-rules";

const VALID_VERDICTS = ["ATTRIBUTED", "NOT_ATTRIBUTED", "PARTIAL", "INCONCLUSIVE"] as const;

export async function recordAttributionReview(
  prisma: PrismaClient,
  input: {
    workspaceId: string;
    candidateId: string;
    harmEventId: string;
    reviewedBy: string;
    reviewedAt: Date;
    verdict: string;
    confidenceScore: number;
    reviewNotes: string;
  }
): Promise<{ recorded: boolean; violations: string[]; review?: object }> {
  assertWorkspaceScopedQuery({ workspaceId: input.workspaceId });
  const violations: string[] = [];
  if (!VALID_VERDICTS.includes(input.verdict as any)) {
    violations.push(`Invalid verdict: ${input.verdict}`);
  }
  if (input.confidenceScore < 0.0 || input.confidenceScore > 1.0) {
    violations.push("confidenceScore must be between 0.0 and 1.0");
  }
  if (violations.length > 0) return { recorded: false, violations };

  const candidate = await (prisma as any).controlledLearningCandidate.findFirst({
    where: { id: input.candidateId, workspaceId: input.workspaceId },
  });
  if (!candidate) {
    return { recorded: false, violations: ["Candidate not found in workspace"] };
  }

  const harmEvent = await (prisma as any).controlledLearningHarmEvent.findFirst({
    where: { id: input.harmEventId, workspaceId: input.workspaceId },
  });
  if (!harmEvent) {
    return { recorded: false, violations: ["Harm event not found in workspace"] };
  }

  const review = await (prisma as any).controlledLearningAttributionReview.create({
    data: {
      workspaceId: input.workspaceId,
      candidateId: input.candidateId,
      harmEventId: input.harmEventId,
      reviewedBy: input.reviewedBy,
      reviewedAt: input.reviewedAt,
      verdict: input.verdict,
      confidenceScore: input.confidenceScore,
      reviewNotes: input.reviewNotes,
    },
  });

  return { recorded: true, violations: [], review };
}

export async function listAttributionReviewsForHarmEvent(
  prisma: PrismaClient,
  workspaceId: string,
  harmEventId: string
): Promise<object[]> {
  assertWorkspaceScopedQuery({ workspaceId });
  return (prisma as any).controlledLearningAttributionReview.findMany({
    where: { workspaceId, harmEventId },
    orderBy: { reviewedAt: "desc" },
  });
}

export async function listAttributionReviewsForCandidate(
  prisma: PrismaClient,
  workspaceId: string,
  candidateId: string
): Promise<object[]> {
  assertWorkspaceScopedQuery({ workspaceId });
  return (prisma as any).controlledLearningAttributionReview.findMany({
    where: { workspaceId, candidateId },
    orderBy: { reviewedAt: "desc" },
  });
}
