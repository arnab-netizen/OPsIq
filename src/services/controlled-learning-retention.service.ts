import type { PrismaClient } from "@/generated/prisma/client";
import { randomUUID } from "crypto";
import { assertWorkspaceScopedQuery } from "@/domain/owner-mode/security-rules";

const MAX_RETENTION_DAYS = 3650; // 10 years

interface SetRetentionPolicyInput {
  workspaceId: string;
  retentionDays: number;
  appliedBy: string;
  appliedAt: Date;
  policyNotes: string;
}

interface RetentionPolicyResult {
  set: boolean;
  violations: string[];
  policy?: object;
}

export async function setRetentionPolicy(
  prisma: PrismaClient,
  input: SetRetentionPolicyInput
): Promise<RetentionPolicyResult> {
  assertWorkspaceScopedQuery({ workspaceId: input.workspaceId });
  const violations: string[] = [];

  if (!input.workspaceId) violations.push("workspaceId is required");
  if (!input.appliedBy) violations.push("appliedBy is required");
  if (
    typeof input.retentionDays !== "number" ||
    !Number.isInteger(input.retentionDays) ||
    input.retentionDays <= 0
  ) {
    violations.push("retentionDays must be a positive integer");
  } else if (input.retentionDays > MAX_RETENTION_DAYS) {
    violations.push(`retentionDays must not exceed ${MAX_RETENTION_DAYS} (10 years)`);
  }

  if (violations.length > 0) {
    return { set: false, violations };
  }

  const policy = await (prisma as any).controlledLearningRetentionPolicy.upsert({
    where: { workspaceId: input.workspaceId },
    update: {
      retentionDays: input.retentionDays,
      appliedBy: input.appliedBy,
      appliedAt: input.appliedAt,
      policyNotes: input.policyNotes ?? "",
    },
    create: {
      workspaceId: input.workspaceId,
      retentionDays: input.retentionDays,
      appliedBy: input.appliedBy,
      appliedAt: input.appliedAt,
      policyNotes: input.policyNotes ?? "",
    },
  });

  // Retention policy is workspace-level (no candidateId) — use generic AuditEvent.
  // actorId is omitted (requires User FK; appliedBy is an email string, not a User UUID).
  try {
    await (prisma as any).auditEvent.create({
      data: {
        id: randomUUID(),
        eventName: "controlled_learning.retention_policy_set",
        workspaceId: input.workspaceId,
        actorId: null,
        entityType: "ControlledLearningRetentionPolicy",
        entityId: null,
        payload: { retentionDays: input.retentionDays, appliedBy: input.appliedBy },
        occurredAt: input.appliedAt,
      },
    });
  } catch (auditErr) {
    console.error("[audit] Failed to write retention policy audit event", { workspaceId: input.workspaceId, auditErr });
  }

  return { set: true, violations: [], policy };
}

export async function getRetentionPolicy(
  prisma: PrismaClient,
  workspaceId: string
): Promise<object | null> {
  assertWorkspaceScopedQuery({ workspaceId });
  return (prisma as any).controlledLearningRetentionPolicy.findFirst({
    where: { workspaceId },
  });
}
