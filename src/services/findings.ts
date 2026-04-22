import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError, ValidationError } from "@/infra/errors";
import { assertEngagementAccess } from "@/lib/visibility";
import {
  FINDING_STATUSES,
  CONFIDENCE_LABELS,
  VISIBILITY_LEVELS,
  RISK_SEVERITIES,
  FINDING_EVIDENCE_LINK_TYPES,
} from "@/domain/constants/statuses";
import { triggerReEvaluation } from "@/services/re-evaluation";
import type {
  FindingStatus,
  ConfidenceLabel,
  VisibilityLevel,
  RiskSeverity,
  FindingEvidenceLinkType,
} from "@/domain/constants/statuses";

export interface CreateFindingInput {
  engagementId: string;
  stageId?: string;
  title: string;
  statement: string;
  severity: RiskSeverity;
  confidenceLabel: ConfidenceLabel;
  provisionalFlag?: boolean;
  clientVisibilityStatus?: VisibilityLevel;
}

export interface UpdateFindingInput {
  title?: string;
  statement?: string;
  severity?: RiskSeverity;
  status?: FindingStatus;
  confidenceLabel?: ConfidenceLabel;
  provisionalFlag?: boolean;
  clientVisibilityStatus?: VisibilityLevel;
  version: number;
}

export interface LinkEvidenceToFindingInput {
  findingId: string;
  evidenceItemId: string;
  linkType?: FindingEvidenceLinkType;
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
  if (!RISK_SEVERITIES.includes(input.severity)) {
    throw new ValidationError(
      `Invalid severity: ${input.severity}. Must be one of: ${RISK_SEVERITIES.join(", ")}`
    );
  }

  // Validate confidence label
  if (!CONFIDENCE_LABELS.includes(input.confidenceLabel)) {
    throw new ValidationError(
      `Invalid confidence label: ${input.confidenceLabel}. Must be one of: ${CONFIDENCE_LABELS.join(", ")}`
    );
  }

  // Validate title and statement not empty
  if (!input.title || input.title.trim().length === 0) {
    throw new ValidationError("title is required");
  }
  if (!input.statement || input.statement.trim().length === 0) {
    throw new ValidationError("statement is required");
  }

  const visibility = input.clientVisibilityStatus || "internal";
  if (!VISIBILITY_LEVELS.includes(visibility)) {
    throw new ValidationError(
      `Invalid visibility: ${visibility}. Must be one of: ${VISIBILITY_LEVELS.join(", ")}`
    );
  }

  const finding = await db.$transaction(async (tx) => {
    const newFinding = await tx.finding.create({
      data: {
        engagementId: input.engagementId,
        stageId: input.stageId,
        title: input.title,
        statement: input.statement,
        severity: input.severity,
        confidenceLabel: input.confidenceLabel,
        provisionalFlag: input.provisionalFlag ?? false,
        clientVisibilityStatus: visibility,
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
      severity: input.severity,
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
    select: { id: true, engagementId: true, version: true, status: true },
  });
  if (!existing) throw new NotFoundError("Finding", findingId);

  // Version check
  if (existing.version !== input.version) {
    throw new ValidationError(
      `Version conflict: expected ${existing.version}, got ${input.version}`
    );
  }

  // Validate status if provided
  if (input.status && !FINDING_STATUSES.includes(input.status)) {
    throw new ValidationError(
      `Invalid finding status: ${input.status}. Must be one of: ${FINDING_STATUSES.join(", ")}`
    );
  }

  // Validate severity if provided
  if (input.severity && !RISK_SEVERITIES.includes(input.severity)) {
    throw new ValidationError(
      `Invalid severity: ${input.severity}. Must be one of: ${RISK_SEVERITIES.join(", ")}`
    );
  }

  // Validate confidence label if provided
  if (input.confidenceLabel && !CONFIDENCE_LABELS.includes(input.confidenceLabel)) {
    throw new ValidationError(
      `Invalid confidence label: ${input.confidenceLabel}. Must be one of: ${CONFIDENCE_LABELS.join(", ")}`
    );
  }

  if (input.clientVisibilityStatus && !VISIBILITY_LEVELS.includes(input.clientVisibilityStatus)) {
    throw new ValidationError(
      `Invalid visibility: ${input.clientVisibilityStatus}. Must be one of: ${VISIBILITY_LEVELS.join(", ")}`
    );
  }

  const updated = await db.finding.update({
    where: { id: findingId },
    data: {
      title: input.title,
      statement: input.statement,
      severity: input.severity,
      status: input.status,
      confidenceLabel: input.confidenceLabel,
      provisionalFlag: input.provisionalFlag,
      clientVisibilityStatus: input.clientVisibilityStatus,
      version: { increment: 1 },
    },
    select: { id: true, engagementId: true },
  });

  const eventName = input.status === "validated"
    ? AUDIT_EVENTS.FINDING_VALIDATED
    : input.status === "disputed"
    ? AUDIT_EVENTS.FINDING_DISPUTED
    : AUDIT_EVENTS.FINDING_UPDATED;

  await emitAuditEvent({
    eventName,
    actorId,
    entityType: "Finding",
    entityId: findingId,
    payload: {
      engagementId: updated.engagementId,
      status: input.status,
      severity: input.severity,
    },
  });

  // Trigger re-evaluation due to finding update
  await triggerReEvaluation({
    changeType: "new_critical_evidence",
    entityType: "Finding",
    entityId: findingId,
    engagementId: existing.engagementId,
    severity: input.severity || "medium",
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
    select: { id: true, engagementId: true, status: true },
  });
  if (!existing) throw new NotFoundError("Finding", findingId);

  const updated = await db.finding.update({
    where: { id: findingId },
    data: { status: "validated" },
    select: { id: true, engagementId: true },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.FINDING_VALIDATED,
    actorId,
    entityType: "Finding",
    entityId: findingId,
    payload: {
      engagementId: updated.engagementId,
    },
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

  const updated = await db.finding.update({
    where: { id: findingId },
    data: { status: "disputed" },
    select: { id: true },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.FINDING_DISPUTED,
    actorId,
    entityType: "Finding",
    entityId: findingId,
    payload: {
      engagementId: existing.engagementId,
    },
  });

  // Trigger re-evaluation due to finding dispute
  await triggerReEvaluation({
    changeType: "new_critical_evidence",
    entityType: "Finding",
    entityId: findingId,
    engagementId: existing.engagementId,
    severity: "medium",
    description: "Finding disputed",
    triggeredBy: actorId,
  });

  return { id: updated.id };
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

  // Create new finding
  const newFinding = await db.finding.create({
    data: {
      engagementId: newFindingInput.engagementId,
      stageId: newFindingInput.stageId,
      title: newFindingInput.title,
      statement: newFindingInput.statement,
      severity: newFindingInput.severity,
      confidenceLabel: newFindingInput.confidenceLabel,
      provisionalFlag: newFindingInput.provisionalFlag ?? false,
      clientVisibilityStatus: newFindingInput.clientVisibilityStatus || "internal",
      supersedesFindingId: oldFindingId,
      createdBy: actorId,
    },
    select: { id: true, engagementId: true },
  });

  // Mark old finding as superseded
  await db.finding.update({
    where: { id: oldFindingId },
    data: { status: "superseded" },
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

  // Trigger re-evaluation due to supersession
  await triggerReEvaluation({
    changeType: "new_critical_evidence",
    entityType: "Finding",
    entityId: newFinding.id,
    engagementId: newFinding.engagementId,
    severity: newFindingInput.severity,
    description: `Finding superseded (old: ${oldFindingId})`,
    triggeredBy: actorId,
  });

  return { id: newFinding.id, supersededFindingId: oldFindingId };
}

export async function linkEvidenceToFinding(
  findingId: string,
  evidenceItemId: string,
  linkType: FindingEvidenceLinkType,
  actorId: string
): Promise<{ id: string }> {
  // Validate finding exists
  const finding = await db.finding.findUnique({
    where: { id: findingId },
    select: { id: true, engagementId: true },
  });
  if (!finding) throw new NotFoundError("Finding", findingId);

  // Validate evidence item exists
  const evidence = await db.evidenceItem.findUnique({
    where: { id: evidenceItemId },
    select: { id: true, engagementId: true },
  });
  if (!evidence) throw new NotFoundError("EvidenceItem", evidenceItemId);

  // Validate they're in the same engagement
  if (finding.engagementId !== evidence.engagementId) {
    throw new ValidationError("Finding and evidence must belong to the same engagement");
  }

  // Validate link type
  if (!FINDING_EVIDENCE_LINK_TYPES.includes(linkType)) {
    throw new ValidationError(
      `Invalid link type: ${linkType}. Must be one of: ${FINDING_EVIDENCE_LINK_TYPES.join(", ")}`
    );
  }

  const link = await db.findingEvidenceLink.create({
    data: {
      findingId,
      evidenceItemId,
      linkType,
    },
    select: { id: true },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.FINDING_EVIDENCE_LINKED,
    actorId,
    entityType: "FindingEvidenceLink",
    entityId: link.id,
    payload: {
      findingId,
      evidenceItemId,
      linkType,
    },
  });

  return link;
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
  status: string;
  confidenceLabel: string;
  provisionalFlag: boolean;
  createdAt: Date;
}>> {
  // Check engagement access
  await assertEngagementAccess(userId, engagementId);

  const findings = await db.finding.findMany({
    where: {
      engagementId,
      ...(stageId && { stageId }),
    },
    select: {
      id: true,
      title: true,
      severity: true,
      status: true,
      confidenceLabel: true,
      provisionalFlag: true,
      createdAt: true,
      clientVisibilityStatus: true,
    },
    orderBy: { createdAt: "desc" },
  });

  // Filter by visibility if not requesting all
  if (visibility && visibility !== "all") {
    return findings
      .filter((f) => f.clientVisibilityStatus === visibility)
      .map(({ clientVisibilityStatus, ...f }) => f);
  }

  return findings.map(({ clientVisibilityStatus, ...f }) => f);
}

export async function getFindingDetail(
  findingId: string,
  userId: string,
  visibility?: "internal" | "client_visible" | "all"
): Promise<{
  id: string;
  engagementId: string;
  stageId: string | null;
  title: string;
  statement: string;
  severity: string;
  status: string;
  confidenceLabel: string;
  provisionalFlag: boolean;
  supersedesFindingId: string | null;
  version: number;
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

  // Check engagement access
  await assertEngagementAccess(userId, finding.engagementId);

  const detailFinding = await db.finding.findUnique({
    where: { id: findingId },
    select: {
      id: true,
      engagementId: true,
      stageId: true,
      title: true,
      statement: true,
      severity: true,
      status: true,
      confidenceLabel: true,
      provisionalFlag: true,
      clientVisibilityStatus: true,
      supersedesFindingId: true,
      version: true,
      createdAt: true,
      updatedAt: true,
      evidenceLinks: {
        select: {
          id: true,
          evidenceItemId: true,
          linkType: true,
        },
      },
    },
  });

  if (!detailFinding) throw new NotFoundError("Finding", findingId);

  // Filter by visibility if not requesting all
  if (
    visibility &&
    visibility !== "all" &&
    detailFinding.clientVisibilityStatus !== visibility
  ) {
    throw new NotFoundError("Finding", findingId);
  }

  const { clientVisibilityStatus, ...rest } = detailFinding;
  return rest;
}
