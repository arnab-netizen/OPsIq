import type { PrismaClient } from "@/generated/prisma/client";

const VALID_CONTROL_TYPES = ["ANONYMIZE", "REDACT", "EXCLUDE", "QUARANTINE"] as const;
type ControlType = (typeof VALID_CONTROL_TYPES)[number];

interface ApplyPrivacyControlInput {
  workspaceId: string;
  candidateId: string;
  controlType: ControlType;
  appliedBy: string;
  appliedAt: Date;
  reason: string;
}

interface PrivacyControlResult {
  applied: boolean;
  violations: string[];
  control?: object;
}

export async function applyPrivacyControl(
  prisma: PrismaClient,
  input: ApplyPrivacyControlInput
): Promise<PrivacyControlResult> {
  const violations: string[] = [];

  if (!input.workspaceId) violations.push("workspaceId is required");
  if (!input.candidateId) violations.push("candidateId is required");
  if (!input.appliedBy) violations.push("appliedBy is required");
  if (!input.reason || input.reason.trim() === "") violations.push("reason is required");
  if (!(VALID_CONTROL_TYPES as readonly string[]).includes(input.controlType)) {
    violations.push(
      `controlType must be one of: ${VALID_CONTROL_TYPES.join(", ")}`
    );
  }

  if (violations.length > 0) {
    return { applied: false, violations };
  }

  // Verify candidate exists in workspace
  const candidate = await (prisma as any).controlledLearningCandidate.findFirst({
    where: { id: input.candidateId, workspaceId: input.workspaceId },
  });

  if (!candidate) {
    return {
      applied: false,
      violations: ["Candidate not found in workspace"],
    };
  }

  const control = await (prisma as any).controlledLearningPrivacyControl.create({
    data: {
      workspaceId: input.workspaceId,
      candidateId: input.candidateId,
      controlType: input.controlType,
      appliedBy: input.appliedBy,
      appliedAt: input.appliedAt,
      reason: input.reason,
    },
  });

  return { applied: true, violations: [], control };
}

export async function listPrivacyControlsForCandidate(
  prisma: PrismaClient,
  workspaceId: string,
  candidateId: string
): Promise<object[]> {
  return (prisma as any).controlledLearningPrivacyControl.findMany({
    where: { workspaceId, candidateId },
    orderBy: { createdAt: "desc" },
  });
}

export async function listPrivacyControlsForWorkspace(
  prisma: PrismaClient,
  workspaceId: string
): Promise<object[]> {
  return (prisma as any).controlledLearningPrivacyControl.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
  });
}
