import type { PrismaClient } from "@/generated/prisma/client";

const VALID_ROLLOUT_STAGES = ["SHADOW", "CANARY", "PARTIAL", "FULL", "PAUSED"] as const;
type RolloutStage = typeof VALID_ROLLOUT_STAGES[number];

export interface SetRolloutFlagInput {
  workspaceId: string;
  candidateId: string;
  rolloutStage: RolloutStage;
  rolloutPct: number;
  enabledBy: string;
  enabledAt: Date;
  flagNotes: string;
}

export interface SetRolloutFlagResult {
  set: boolean;
  violations: string[];
  flag?: object;
}

export async function setRolloutFlag(
  prisma: PrismaClient,
  input: SetRolloutFlagInput
): Promise<SetRolloutFlagResult> {
  const violations: string[] = [];

  if (!VALID_ROLLOUT_STAGES.includes(input.rolloutStage)) {
    violations.push(`Invalid rolloutStage: ${input.rolloutStage}. Must be one of ${VALID_ROLLOUT_STAGES.join(", ")}`);
  }

  if (typeof input.rolloutPct !== "number" || input.rolloutPct < 0 || input.rolloutPct > 100) {
    violations.push(`Invalid rolloutPct: ${input.rolloutPct}. Must be between 0.0 and 100.0`);
  }

  if (!input.workspaceId) violations.push("workspaceId is required");
  if (!input.candidateId) violations.push("candidateId is required");
  if (!input.enabledBy) violations.push("enabledBy is required");

  if (violations.length > 0) {
    return { set: false, violations };
  }

  const candidate = await (prisma as any).controlledLearningCandidate.findFirst({
    where: { id: input.candidateId, workspaceId: input.workspaceId },
  });

  if (!candidate) {
    return { set: false, violations: ["Candidate not found in workspace"] };
  }

  const flag = await (prisma as any).controlledLearningRolloutFlag.upsert({
    where: { workspaceId_candidateId: { workspaceId: input.workspaceId, candidateId: input.candidateId } },
    create: {
      workspaceId: input.workspaceId,
      candidateId: input.candidateId,
      rolloutStage: input.rolloutStage,
      rolloutPct: input.rolloutPct,
      enabledBy: input.enabledBy,
      enabledAt: input.enabledAt,
      flagNotes: input.flagNotes,
    },
    update: {
      rolloutStage: input.rolloutStage,
      rolloutPct: input.rolloutPct,
      enabledBy: input.enabledBy,
      enabledAt: input.enabledAt,
      flagNotes: input.flagNotes,
    },
  });

  return { set: true, violations: [], flag };
}

export async function getRolloutFlag(
  prisma: PrismaClient,
  workspaceId: string,
  candidateId: string
): Promise<object | null> {
  return (prisma as any).controlledLearningRolloutFlag.findFirst({
    where: { workspaceId, candidateId },
  });
}

export async function listRolloutFlagsForWorkspace(
  prisma: PrismaClient,
  workspaceId: string
): Promise<object[]> {
  return (prisma as any).controlledLearningRolloutFlag.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
  });
}
