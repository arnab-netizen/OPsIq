import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError, ValidationError } from "@/infra/errors";
import { assertEngagementAccess } from "@/lib/visibility";
import {
  FINDING_STATUSES,
} from "@/domain/constants/statuses";
import { triggerReEvaluation } from "@/services/re-evaluation";
import { withIdempotency } from "@/infra/idempotency";
import { logger } from "@/infra/logger";
import type {
  FindingStatus,
} from "@/domain/constants/statuses";

export interface CreateFindingInput {
  engagementId: string;
  stageId?: string;
  primaryEvidenceId: string;
  title: string;
  summary: string;
  severity: string;
  impactArea: string;
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
  severity?: string;
  impactArea?: string;
  rootCause?: string;
  version: number;
}

export interface LinkEvidenceToFindingInput {
  findingId: string;
  evidenceItemId: string;
  linkType?: string;
}

export async function createFinding(
  input: CreateFindingInput,
  actorId: string
): Promise<{ id: string; engagementId: string }> {
  // Validate engagement exists
  const engagement = await db.engagement.findUnique({
    where: { id: input.engagementId },
    select: { id: true },
  });
  if (!engagement) throw new NotFoundError("Engagement", input.engagementId);

  // Validate severity
  const validSeverities = ["low", "medium", "high", "critical"];
  if (!validSeverities.includes(input.severity)) {
    throw new ValidationError(
      `Invalid severity: ${input.severity}. Must be one of: ${validSeverities.join(", ")}`
    );
  }

  // Validate title and summary not empty
  if (!input.title || input.title.trim().length === 0) {
    throw new ValidationError("title is required");
  }
  if (!input.summary || input.summary.trim().length === 0) {
    throw new ValidationError("summary is required");
  }

  // Validate impactArea
  const validImpacts = ["revenue", "cost", "execution", "risk"];
  if (!validImpacts.includes(input.impactArea)) {
    throw new ValidationError(
      `Invalid impact area: ${input.impactArea}. Must be one of: ${validImpacts.join(", ")}`
    );
  }

  // Build linkedEvidence array
  const linkedEvidence = input.primaryEvidenceId ? [input.primaryEvidenceId] : [];

  // Infer finding type from impact area
  const findingTypeMap: Record<string, string> = {
    revenue: "market",
    cost: "operational",
    execution: "operational",
    risk: "technical",
  };
  const findingType = findingTypeMap[input.impactArea] || "technical";

  const finding = await db.$transaction(async (tx) => {
    const newFinding = await tx.finding.create({
      data: {
        engagementId: input.engagementId,
        title: input.title,
        description: input.summary,
        findingType: findingType,
        impactArea: input.impactArea,
        severity: input.severity,
        rootCause: input.rootCause || null,
        linkedEvidence: linkedEvidence,
        createdBy: actorId,
      },
      select: { id: true, engagementId: true },
    });

    await emitAuditEvent({
      eventName: AUDIT_EVENTS.FINDING_CREATED,
      actorId,
      entityType: "Finding",
      entityId: newFinding.id,
      payload: {
        engagementId: input.engagementId,
        severity: input.severity,
        title: input.title,
      },
    });

    // Trigger re-evaluation due to new finding
    await triggerReEvaluation({
      changeType: "new_critical_evidence",
      entityType: "Finding",
      entityId: newFinding.id,
      engagementId: input.engagementId,
      severity: (input.severity === "critical" ? "critical" : input.severity === "high" ? "high" : "medium") as "low" | "medium" | "high" | "critical",
      description: `Finding created: ${input.title}`,
      triggeredBy: actorId,
    });

    return newFinding;
  });

  return finding;
}

export async function updateFinding(
  findingId: string,
  input: UpdateFindingInput,
  actorId: string
): Promise<{ id: string }> {
  // Validate finding exists
  const existing = await db.finding.findUnique({
    where: { id: findingId },
    select: { id: true, engagementId: true },
  });
  if (!existing) throw new NotFoundError("Finding", findingId);

  // Validate severity if provided
  if (input.severity) {
    const validSeverities = ["low", "medium", "high", "critical"];
    if (!validSeverities.includes(input.severity)) {
      throw new ValidationError(
        `Invalid severity: ${input.severity}. Must be one of: ${validSeverities.join(", ")}`
      );
    }
  }

  // Validate impactArea if provided
  if (input.impactArea) {
    const validImpacts = ["revenue", "cost", "execution", "risk"];
    if (!validImpacts.includes(input.impactArea)) {
      throw new ValidationError(
        `Invalid impact area: ${input.impactArea}. Must be one of: ${validImpacts.join(", ")}`
      );
    }
  }

  const data: Record<string, unknown> = {};
  if (input.title) data.title = input.title;
  if (input.summary) data.description = input.summary;
  if (input.severity) data.severity = input.severity;
  if (input.impactArea) data.impactArea = input.impactArea;
  if (input.rootCause !== undefined) data.rootCause = input.rootCause;

  const updated = await db.finding.update({
    where: { id: findingId },
    data,
    select: { id: true, engagementId: true },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.FINDING_UPDATED,
    actorId,
    entityType: "Finding",
    entityId: findingId,
    payload: {
      engagementId: updated.engagementId,
      severity: input.severity,
      title: input.title,
    },
  });

  // Trigger re-evaluation due to finding update
  const updateSeverity = input.severity ?
    (input.severity === "critical" ? "critical" : input.severity === "high" ? "high" : "medium") :
    "medium";

  await triggerReEvaluation({
    changeType: "new_critical_evidence",
    entityType: "Finding",
    entityId: findingId,
    engagementId: existing.engagementId,
    severity: updateSeverity as "low" | "medium" | "high" | "critical",
    description: `Finding updated: ${input.title || "finding"}`,
    triggeredBy: actorId,
  });

  return { id: updated.id };
}

export async function validateFinding(
  findingId: string,
  actorId: string
): Promise<{ id: string }> {
  const existing = await db.finding.findUnique({
    where: { id: findingId },
    select: { id: true, engagementId: true, linkedEvidence: true },
  });
  if (!existing) throw new NotFoundError("Finding", findingId);

  if (existing.linkedEvidence.length === 0) {
    throw new ValidationError("Finding must have at least one linked evidence before validation");
  }

  const updated = await db.finding.findUnique({
    where: { id: findingId },
    select: { id: true, engagementId: true },
  });

  if (!updated) throw new NotFoundError("Finding", findingId);

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.FINDING_VALIDATED,
    actorId,
    entityType: "Finding",
    entityId: findingId,
    payload: {
      engagementId: updated.engagementId,
    },
    visibility: "internal",
  });

  // Trigger re-evaluation due to finding validation
  await triggerReEvaluation({
    changeType: "new_critical_evidence",
    entityType: "Finding",
    entityId: findingId,
    engagementId: existing.engagementId,
    severity: "high",
    description: "Finding validated",
    triggeredBy: actorId,
  });

  return { id: updated.id };
}

export async function disputeFinding(
  findingId: string,
  actorId: string
): Promise<{ id: string }> {
  const existing = await db.finding.findUnique({
    where: { id: findingId },
    select: { id: true, engagementId: true },
  });
  if (!existing) throw new NotFoundError("Finding", findingId);

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.FINDING_DISPUTED,
    actorId,
    entityType: "Finding",
    entityId: findingId,
    payload: {
      engagementId: existing.engagementId,
    },
  });

  return { id: existing.id };
}

export async function supersedeFinding(
  oldFindingId: string,
  newFindingInput: CreateFindingInput,
  actorId: string
): Promise<{ id: string; supersededFindingId: string }> {
  // Validate old finding exists
  const oldFinding = await db.finding.findUnique({
    where: { id: oldFindingId },
    select: { id: true, engagementId: true },
  });
  if (!oldFinding) throw new NotFoundError("Finding", oldFindingId);

  // Create new finding using the new field names
  const findingType = newFindingInput.impactArea === "revenue" ? "market" : "operational";
  const newFinding = await db.finding.create({
    data: {
      engagementId: newFindingInput.engagementId,
      title: newFindingInput.title,
      description: newFindingInput.summary || null,
      findingType: findingType,
      impactArea: newFindingInput.impactArea,
      severity: newFindingInput.severity,
      rootCause: newFindingInput.rootCause || null,
      linkedEvidence: newFindingInput.primaryEvidenceId ? [newFindingInput.primaryEvidenceId] : [],
      createdBy: actorId,
    },
    select: { id: true, engagementId: true },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.FINDING_SUPERSEDED,
    actorId,
    entityType: "Finding",
    entityId: newFinding.id,
    payload: {
      engagementId: newFinding.engagementId,
      supersedes: oldFindingId,
    },
  });

  return { id: newFinding.id, supersededFindingId: oldFindingId };
}

export async function linkEvidenceToFinding(
  findingId: string,
  evidenceId: string,
  actorId: string
): Promise<{ findingId: string; evidenceId: string }> {
  const finding = await db.finding.findUnique({
    where: { id: findingId },
    select: { id: true, engagementId: true, linkedEvidence: true },
  });
  if (!finding) throw new NotFoundError("Finding", findingId);

  const evidence = await db.evidence.findUnique({
    where: { id: evidenceId },
    select: { id: true, engagementId: true, status: true, relatedFindingId: true },
  });
  if (!evidence) throw new NotFoundError("Evidence", evidenceId);

  if (finding.engagementId !== evidence.engagementId) {
    throw new ValidationError("Finding and evidence must belong to the same engagement");
  }

  if (evidence.status === "rejected") {
    throw new ValidationError("Cannot link rejected evidence");
  }

  if (evidence.status === "superseded") {
    throw new ValidationError("Cannot link superseded evidence");
  }

  if (finding.linkedEvidence.includes(evidenceId)) {
    throw new ValidationError("Evidence is already linked to this finding");
  }

  const updated = await db.$transaction(async (tx) => {
    const updatedFinding = await tx.finding.update({
      where: { id: findingId },
      data: {
        linkedEvidence: {
          push: evidenceId,
        },
      },
      select: { id: true, engagementId: true },
    });

    await tx.evidence.update({
      where: { id: evidenceId },
      data: { relatedFindingId: findingId },
    });

    return updatedFinding;
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.FINDING_EVIDENCE_LINKED,
    actorId,
    entityType: "Finding",
    entityId: findingId,
    payload: {
      findingId,
      evidenceId,
      action: "linked",
    },
    visibility: "internal",
  });

  return { findingId: updated.id, evidenceId };
}

export async function unlinkEvidenceFromFinding(
  findingId: string,
  evidenceId: string,
  actorId: string
): Promise<{ findingId: string; evidenceId: string }> {
  const finding = await db.finding.findUnique({
    where: { id: findingId },
    select: { id: true, engagementId: true, linkedEvidence: true },
  });
  if (!finding) throw new NotFoundError("Finding", findingId);

  const evidence = await db.evidence.findUnique({
    where: { id: evidenceId },
    select: { id: true, engagementId: true, relatedFindingId: true },
  });
  if (!evidence) throw new NotFoundError("Evidence", evidenceId);

  if (finding.engagementId !== evidence.engagementId) {
    throw new ValidationError("Finding and evidence must belong to the same engagement");
  }

  if (!finding.linkedEvidence.includes(evidenceId)) {
    throw new ValidationError("Evidence is not linked to this finding");
  }

  const updated = await db.$transaction(async (tx) => {
    const updatedFinding = await tx.finding.update({
      where: { id: findingId },
      data: {
        linkedEvidence: finding.linkedEvidence.filter((id) => id !== evidenceId),
      },
      select: { id: true, linkedEvidence: true },
    });

    await tx.evidence.update({
      where: { id: evidenceId },
      data: { relatedFindingId: null },
    });

    return updatedFinding;
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.FINDING_EVIDENCE_UNLINKED,
    actorId,
    entityType: "Finding",
    entityId: findingId,
    payload: {
      findingId,
      evidenceId,
      action: "unlinked",
    },
    visibility: "internal",
  });

  return { findingId: updated.id, evidenceId };
}

export async function listFindingsForEngagement(
  engagementId: string,
  userId: string,
  stageId?: string,
  visibility?: "internal" | "client_visible" | "all"
): Promise<Array<{
  id: string;
  title: string;
  severity: string;
  impactArea: string | null;
  createdAt: Date;
}>> {
  // Check engagement access
  await assertEngagementAccess(userId, engagementId);

  const findings = await db.finding.findMany({
    where: {
      engagementId,
    },
    select: {
      id: true,
      title: true,
      severity: true,
      impactArea: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return findings;
}

export async function getFindingDetail(
  findingId: string,
  userId?: string,
  visibility?: "internal" | "client_visible" | "all"
): Promise<{
  id: string;
  engagementId: string;
  title: string;
  description: string | null;
  findingType: string;
  severity: string;
  impactArea: string | null;
  rootCause: string | null;
  linkedEvidence: string[];
  createdAt: Date;
  updatedAt: Date;
  evidenceLinks?: Array<{
    id: string;
    evidenceItemId: string;
    linkType: string;
  }>;
}> {
  const finding = await db.finding.findUnique({
    where: { id: findingId },
    select: { engagementId: true },
  });

  if (!finding) throw new NotFoundError("Finding", findingId);

  // Check engagement access if userId provided
  if (userId) {
    await assertEngagementAccess(userId, finding.engagementId);
  }

  const detailFinding = await db.finding.findUnique({
    where: { id: findingId },
    select: {
      id: true,
      engagementId: true,
      title: true,
      description: true,
      findingType: true,
      severity: true,
      impactArea: true,
      rootCause: true,
      linkedEvidence: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!detailFinding) throw new NotFoundError("Finding", findingId);

  return detailFinding;
}
