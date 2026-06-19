import type { PrismaClient } from "@/generated/prisma/client";
import { assertWorkspaceScopedQuery } from "@/domain/owner-mode/security-rules";

const VALID_ROLLBACK_CODES = [
  "REGRESSION_DETECTED",
  "HARM_DETECTED",
  "MANUAL_OVERRIDE",
  "POLICY_VIOLATION",
] as const;
type RollbackCode = typeof VALID_ROLLBACK_CODES[number];

export interface RecordRollbackEventInput {
  workspaceId: string;
  candidateId: string;
  rolledBackBy: string;
  rolledBackAt: Date;
  rollbackReason: string;
  rollbackCode: RollbackCode;
}

export interface RecordRollbackEventResult {
  recorded: boolean;
  violations: string[];
  event?: object;
}

export async function recordRollbackEvent(
  prisma: PrismaClient,
  input: RecordRollbackEventInput
): Promise<RecordRollbackEventResult> {
  assertWorkspaceScopedQuery({ workspaceId: input.workspaceId });
  const violations: string[] = [];

  if (!VALID_ROLLBACK_CODES.includes(input.rollbackCode)) {
    violations.push(`Invalid rollbackCode: ${input.rollbackCode}. Must be one of ${VALID_ROLLBACK_CODES.join(", ")}`);
  }

  if (!input.workspaceId) violations.push("workspaceId is required");
  if (!input.candidateId) violations.push("candidateId is required");
  if (!input.rolledBackBy) violations.push("rolledBackBy is required");
  if (!input.rollbackReason) violations.push("rollbackReason is required");

  if (violations.length > 0) {
    return { recorded: false, violations };
  }

  const candidate = await (prisma as any).controlledLearningCandidate.findFirst({
    where: { id: input.candidateId, workspaceId: input.workspaceId },
  });

  if (!candidate) {
    return { recorded: false, violations: ["Candidate not found in workspace"] };
  }

  const event = await (prisma as any).controlledLearningRollbackEvent.create({
    data: {
      workspaceId: input.workspaceId,
      candidateId: input.candidateId,
      rolledBackBy: input.rolledBackBy,
      rolledBackAt: input.rolledBackAt,
      rollbackReason: input.rollbackReason,
      rollbackCode: input.rollbackCode,
    },
  });

  return { recorded: true, violations: [], event };
}

export async function listRollbackEventsForCandidate(
  prisma: PrismaClient,
  workspaceId: string,
  candidateId: string
): Promise<object[]> {
  assertWorkspaceScopedQuery({ workspaceId });
  return (prisma as any).controlledLearningRollbackEvent.findMany({
    where: { workspaceId, candidateId },
    orderBy: { createdAt: "desc" },
  });
}

export async function listRollbackEventsForWorkspace(
  prisma: PrismaClient,
  workspaceId: string
): Promise<object[]> {
  assertWorkspaceScopedQuery({ workspaceId });
  return (prisma as any).controlledLearningRollbackEvent.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
  });
}

export async function hasBeenRolledBack(
  prisma: PrismaClient,
  workspaceId: string,
  candidateId: string
): Promise<boolean> {
  assertWorkspaceScopedQuery({ workspaceId });
  const event = await (prisma as any).controlledLearningRollbackEvent.findFirst({
    where: { workspaceId, candidateId },
  });
  return event !== null;
}
