import type { PrismaClient } from "@/generated/prisma/client";
import { assertWorkspaceScopedQuery } from "@/domain/owner-mode/security-rules";

const VALID_HARM_TYPES = ["FINANCIAL_LOSS", "DECISION_ERROR", "DATA_CORRUPTION", "COMPLIANCE_VIOLATION", "SAFETY_RISK"] as const;
const VALID_SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

export async function recordHarmEvent(
  prisma: PrismaClient,
  input: {
    workspaceId: string;

    candidateId: string;
    harmType: string;
    severity: string;
    detectedBy: string;
    detectedAt: Date;
    harmDescription: string;
  }
): Promise<{ recorded: boolean; violations: string[]; event?: object }> {
  assertWorkspaceScopedQuery({ workspaceId: input.workspaceId });
  const violations: string[] = [];
  if (!VALID_HARM_TYPES.includes(input.harmType as any)) {
    violations.push(`Invalid harmType: ${input.harmType}`);
  }
  if (!VALID_SEVERITIES.includes(input.severity as any)) {
    violations.push(`Invalid severity: ${input.severity}`);
  }
  if (violations.length > 0) return { recorded: false, violations };

  const candidate = await (prisma as any).controlledLearningCandidate.findFirst({
    where: { id: input.candidateId, workspaceId: input.workspaceId },
  });
  if (!candidate) {
    return { recorded: false, violations: ["Candidate not found in workspace"] };
  }

  const event = await (prisma as any).controlledLearningHarmEvent.create({
    data: {
      workspaceId: input.workspaceId,
      candidateId: input.candidateId,
      harmType: input.harmType,
      severity: input.severity,
      detectedBy: input.detectedBy,
      detectedAt: input.detectedAt,
      harmDescription: input.harmDescription,
    },
  });

  try {
    await (prisma as any).controlledLearningCandidateAuditEntry.create({
      data: {
        workspaceId: input.workspaceId,
        candidateId: input.candidateId,
        action: `HARM_EVENT_RECORDED_${input.severity}`,
        actorId: input.detectedBy,
        detail: `Harm event recorded: type=${input.harmType} severity=${input.severity}`,
        timestamp: input.detectedAt,
      },
    });
  } catch (auditErr) {
    console.error("[audit] Failed to write harm event audit entry", { candidateId: input.candidateId, workspaceId: input.workspaceId, auditErr });
  }

  return { recorded: true, violations: [], event };
}

export async function markHarmMitigated(
  prisma: PrismaClient,
  workspaceId: string,
  harmEventId: string,
  mitigatedAt: Date
): Promise<{ mitigated: boolean; violations: string[] }> {
  assertWorkspaceScopedQuery({ workspaceId });
  const existing = await (prisma as any).controlledLearningHarmEvent.findFirst({
    where: { id: harmEventId, workspaceId },
    select: { id: true, candidateId: true },
  });
  if (!existing) {
    return { mitigated: false, violations: ["Harm event not found in workspace"] };
  }

  await (prisma as any).controlledLearningHarmEvent.update({
    where: { id: harmEventId },
    data: { mitigated: true, mitigatedAt },
  });

  try {
    await (prisma as any).controlledLearningCandidateAuditEntry.create({
      data: {
        workspaceId,
        candidateId: existing.candidateId,
        action: "HARM_EVENT_MITIGATED",
        actorId: null,
        detail: `Harm event ${harmEventId} marked mitigated at ${mitigatedAt.toISOString()}`,
        timestamp: mitigatedAt,
      },
    });
  } catch (auditErr) {
    console.error("[audit] Failed to write harm mitigation audit entry", { harmEventId, workspaceId, auditErr });
  }

  return { mitigated: true, violations: [] };
}

export async function listHarmEventsForCandidate(
  prisma: PrismaClient,
  workspaceId: string,
  candidateId: string
): Promise<object[]> {
  assertWorkspaceScopedQuery({ workspaceId });
  return (prisma as any).controlledLearningHarmEvent.findMany({
    where: { workspaceId, candidateId },
    orderBy: { detectedAt: "desc" },
  });
}

export async function listHarmEventsForWorkspace(
  prisma: PrismaClient,
  workspaceId: string
): Promise<object[]> {
  assertWorkspaceScopedQuery({ workspaceId });
  return (prisma as any).controlledLearningHarmEvent.findMany({
    where: { workspaceId },
    orderBy: { detectedAt: "desc" },
  });
}

export async function hasCriticalHarm(
  prisma: PrismaClient,
  workspaceId: string,
  candidateId: string
): Promise<boolean> {
  assertWorkspaceScopedQuery({ workspaceId });
  const event = await (prisma as any).controlledLearningHarmEvent.findFirst({
    where: { workspaceId, candidateId, severity: "CRITICAL" },
  });
  return !!event;
}
