import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError, ValidationError, InvalidStateTransitionError } from "@/infra/errors";
import {
  optimisticUpdate,
  withVersionCheck,
  withVersionIncrement,
} from "@/lib/optimistic-lock";
import { validateFindingTransition } from "@/policies/state-transition";
import { triggerReEvaluation } from "@/services/re-evaluation";
import { logger } from "@/infra/logger";
import type { FindingStatus, FindingSeverity, FindingImpact } from "@/domain/constants/statuses";
import { FINDING_STATUSES } from "@/domain/constants/statuses";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface CreateFindingInput {
  engagementId: string;
  stageId?: string;
  primaryEvidenceId: string;
  title: string;
  summary: string;
  severity: FindingSeverity;
  impactArea: FindingImpact;
  confidenceScore?: number;
  hypothesis?: string;
  rootCause?: string;
  consequence?: string;
  ownerId?: string;
  dueAt?: string;
}

export interface UpdateFindingInput {
  title?: string;
  summary?: string;
  severity?: FindingSeverity;
  impactArea?: FindingImpact;
  confidenceScore?: number;
  priorityScore?: number;
  hypothesis?: string;
  rootCause?: string;
  consequence?: string;
  ownerId?: string;
  dueAt?: string;
  status?: FindingStatus;
  version: number;
}

// ─── Service ───────────────────────────────────────────────────────────────

export async function createFinding(
  input: CreateFindingInput,
  actorId: string
): Promise<{ id: string }> {
  const engagement = await db.engagement.findUnique({
    where: { id: input.engagementId },
  });
  if (!engagement) throw new NotFoundError("Engagement", input.engagementId);

  const evidence = await db.evidence.findUnique({
    where: { id: input.primaryEvidenceId },
  });
  if (!evidence) throw new NotFoundError("Evidence", input.primaryEvidenceId);

  if (input.stageId) {
    const stage = await db.stage.findUnique({
      where: { id: input.stageId },
    });
    if (!stage) throw new NotFoundError("Stage", input.stageId);
  }

  const finding = await db.finding.create({
    data: {
      engagementId: input.engagementId,
      stageId: input.stageId ?? null,
      primaryEvidenceId: input.primaryEvidenceId,
      title: input.title,
      summary: input.summary,
      severity: input.severity,
      impactArea: input.impactArea,
      status: "identified",
      confidenceScore: input.confidenceScore ?? null,
      hypothesis: input.hypothesis ?? null,
      rootCause: input.rootCause ?? null,
      consequence: input.consequence ?? null,
      ownerId: input.ownerId ?? null,
      dueAt: input.dueAt ? new Date(input.dueAt) : null,
    },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.FINDING_CREATED,
    actorId,
    entityType: "finding",
    entityId: finding.id,
    payload: {
      engagementId: input.engagementId,
      title: input.title,
      severity: input.severity,
      impactArea: input.impactArea,
    },
    visibility: "internal",
  });

  logger.info("Finding created", {
    findingId: finding.id,
    engagementId: input.engagementId,
  });

  return { id: finding.id };
}

export async function getFinding(id: string) {
  const finding = await db.finding.findUnique({
    where: { id },
    include: {
      engagement: true,
      stage: true,
      primaryEvidence: true,
      recommendations: true,
    },
  });
  if (!finding) throw new NotFoundError("Finding", id);
  return finding;
}

export async function getFindingsForEngagement(engagementId: string) {
  return db.finding.findMany({
    where: {
      engagementId,
      archivedAt: null,
    },
    include: {
      primaryEvidence: true,
      recommendations: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function updateFinding(
  id: string,
  input: UpdateFindingInput,
  actorId: string
): Promise<void> {
  const finding = await db.finding.findUnique({ where: { id } });
  if (!finding) throw new NotFoundError("Finding", id);

  if (input.version !== finding.version) {
    throw new ValidationError("Version mismatch");
  }

  if (input.status && input.status !== finding.status) {
    validateFindingTransition(finding.status as FindingStatus, input.status);

    if (input.status === "validated" && !finding.primaryEvidenceId) {
      throw new ValidationError("Cannot validate finding without primary evidence");
    }

    if (input.status === "prioritized" && (!input.severity || !input.impactArea)) {
      throw new ValidationError("Cannot prioritize finding without severity and impact area");
    }
  }

  const updated = await db.finding.update({
    where: { id },
    data: withVersionIncrement({
      title: input.title ?? undefined,
      summary: input.summary ?? undefined,
      severity: input.severity ?? undefined,
      impactArea: input.impactArea ?? undefined,
      confidenceScore: input.confidenceScore ?? undefined,
      priorityScore: input.priorityScore ?? undefined,
      hypothesis: input.hypothesis ?? undefined,
      rootCause: input.rootCause ?? undefined,
      consequence: input.consequence ?? undefined,
      ownerId: input.ownerId ?? undefined,
      dueAt: input.dueAt ? new Date(input.dueAt) : undefined,
      status: input.status ?? undefined,
      validatedAt: input.status === "validated" ? new Date() : undefined,
      resolvedAt: input.status === "resolved" ? new Date() : undefined,
      dismissedAt: input.status === "dismissed" ? new Date() : undefined,
    }),
  });

  if (input.status && input.status !== finding.status) {
    await emitAuditEvent({
      eventName: AUDIT_EVENTS.FINDING_STATUS_CHANGED,
      actorId,
      entityType: "finding",
      entityId: id,
      payload: {
        fromStatus: finding.status,
        toStatus: input.status,
      },
      visibility: "internal",
    });

    await triggerReEvaluation({
      changeType: input.status === "prioritized" ? "new_critical_evidence" : "scope_change",
      entityType: "finding",
      entityId: id,
      engagementId: finding.engagementId,
      severity: finding.severity === "critical" ? "critical" : "high",
      description: `Finding status changed to ${input.status}`,
      triggeredBy: actorId,
    });
  } else {
    await emitAuditEvent({
      eventName: AUDIT_EVENTS.FINDING_UPDATED,
      actorId,
      entityType: "finding",
      entityId: id,
      payload: {
        fields: Object.keys(input).filter(k => k !== "version" && k !== "status"),
      },
      visibility: "internal",
    });
  }

  logger.info("Finding updated", {
    findingId: id,
    engagementId: finding.engagementId,
  });
}

export async function archiveFinding(
  id: string,
  actorId: string
): Promise<void> {
  const finding = await db.finding.findUnique({ where: { id } });
  if (!finding) throw new NotFoundError("Finding", id);

  await db.finding.update({
    where: { id },
    data: {
      archivedAt: new Date(),
      version: { increment: 1 },
    },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.FINDING_ARCHIVED,
    actorId,
    entityType: "finding",
    entityId: id,
    payload: {
      engagementId: finding.engagementId,
    },
    visibility: "internal",
  });

  logger.info("Finding archived", {
    findingId: id,
    engagementId: finding.engagementId,
  });
}
