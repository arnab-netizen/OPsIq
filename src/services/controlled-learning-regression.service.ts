import type { PrismaClient } from "@/generated/prisma/client";
import { assertWorkspaceScopedQuery } from "@/domain/owner-mode/security-rules";

export type RegressionVerdict = "PASS" | "FAIL" | "INCONCLUSIVE";

export interface RecordRegressionResultInput {
  workspaceId: string;
  candidateId: string;
  testRunId: string;
  testVerdict: RegressionVerdict;
  regressionScore: number;
  testedBy: string;
  testedAt: Date;
  testNotes: string;
}

export interface RegressionResultRecord {
  id: string;
  workspaceId: string;
  candidateId: string;
  testRunId: string;
  testVerdict: string;
  regressionScore: number;
  testedBy: string;
  testedAt: Date;
  testNotes: string;
  createdAt: Date;
  updatedAt: Date;
}

const ALLOWED_VERDICTS: RegressionVerdict[] = ["PASS", "FAIL", "INCONCLUSIVE"];

export async function recordRegressionResult(
  prisma: PrismaClient,
  input: RecordRegressionResultInput
): Promise<{ recorded: boolean; violations: string[]; result?: RegressionResultRecord }> {
  assertWorkspaceScopedQuery({ workspaceId: input.workspaceId });
  const violations: string[] = [];

  if (!ALLOWED_VERDICTS.includes(input.testVerdict)) {
    violations.push(
      `testVerdict must be one of: ${ALLOWED_VERDICTS.join(", ")}; received "${input.testVerdict}"`
    );
  }

  if (typeof input.regressionScore !== "number" || isNaN(input.regressionScore) || input.regressionScore < 0 || input.regressionScore > 1) {
    violations.push(`regressionScore must be a number between 0.0 and 1.0; received ${input.regressionScore}`);
  }

  if (violations.length > 0) {
    return { recorded: false, violations };
  }

  // Verify candidate exists in workspace
  const candidate = await (prisma as any).controlledLearningCandidate.findFirst({
    where: { id: input.candidateId, workspaceId: input.workspaceId },
  });

  if (!candidate) {
    return {
      recorded: false,
      violations: [`Candidate "${input.candidateId}" not found in workspace "${input.workspaceId}"`],
    };
  }

  const result = await (prisma as any).controlledLearningRegressionResult.create({
    data: {
      workspaceId: input.workspaceId,
      candidateId: input.candidateId,
      testRunId: input.testRunId,
      testVerdict: input.testVerdict,
      regressionScore: input.regressionScore,
      testedBy: input.testedBy,
      testedAt: input.testedAt,
      testNotes: input.testNotes,
    },
  });

  try {
    await (prisma as any).controlledLearningCandidateAuditEntry.create({
      data: {
        workspaceId: input.workspaceId,
        candidateId: input.candidateId,
        action: `REGRESSION_${input.testVerdict}`,
        actorId: input.testedBy,
        detail: `Regression result recorded: verdict=${input.testVerdict} score=${input.regressionScore} testRunId=${input.testRunId}`,
        timestamp: input.testedAt,
      },
    });
  } catch (auditErr) {
    console.error("[audit] Failed to write regression audit entry", { candidateId: input.candidateId, workspaceId: input.workspaceId, auditErr });
  }

  return { recorded: true, violations: [], result };
}

export async function listRegressionResultsForCandidate(
  prisma: PrismaClient,
  workspaceId: string,
  candidateId: string
): Promise<RegressionResultRecord[]> {
  assertWorkspaceScopedQuery({ workspaceId });
  // Verify candidate belongs to workspace
  const candidate = await (prisma as any).controlledLearningCandidate.findFirst({
    where: { id: candidateId, workspaceId },
  });

  if (!candidate) {
    return [];
  }

  return (prisma as any).controlledLearningRegressionResult.findMany({
    where: { workspaceId, candidateId },
    orderBy: { testedAt: "desc" },
  });
}

export async function listRegressionResultsForWorkspace(
  prisma: PrismaClient,
  workspaceId: string
): Promise<RegressionResultRecord[]> {
  assertWorkspaceScopedQuery({ workspaceId });
  return (prisma as any).controlledLearningRegressionResult.findMany({
    where: { workspaceId },
    orderBy: { testedAt: "desc" },
  });
}

export async function hasRegression(
  prisma: PrismaClient,
  workspaceId: string,
  candidateId: string
): Promise<boolean> {
  assertWorkspaceScopedQuery({ workspaceId });
  const failResult = await (prisma as any).controlledLearningRegressionResult.findFirst({
    where: { workspaceId, candidateId, testVerdict: "FAIL" },
  });

  return failResult !== null;
}
