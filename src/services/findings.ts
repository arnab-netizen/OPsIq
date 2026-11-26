import { db } from "@/lib/db";
import type { ServiceAuthEnvelope } from "@/lib/canonical-route-enforcement";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError, ValidationError, ForbiddenError } from "@/infra/errors";
import { assertEngagementAccess } from "@/lib/visibility";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { triggerReEvaluation } from "@/services/re-evaluation";
import { randomUUID } from "crypto";

export interface CreateFindingInput {
  engagementId: string;
  stageId?: string;
  primaryEvidenceId?: string;
  title: string;
  summary?: string;
  severity: string;
  impactArea: string;
  confidenceScore?: number;
  hypothesis?: string;
  rootCause?: string;
  consequence?: string;
  ownerId?: string;
  dueAt?: string;
  // Backward compatibility
  description?: string;
  findingType?: string;
  linkedEvidenceIds?: string[];
  statement?: string;
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

// ── Phase 6A: linked-evidence & derived fields ───────────────────────────────
// The Finding model has NO `linkedEvidence`/`description`/`findingType`/`provisionalFlag`
// columns and Evidence has no `relatedFindingId`/`visibility` column. Selecting them threw
// PrismaClientValidationError → raw 500 on the owner-facing findings endpoints. Linked evidence
// is persisted in the REAL `Finding.metadata` JSON column; derived DTO fields are computed from
// real columns. No schema change, no fake fields.
type FindingMetadata = { linkedEvidenceIds?: unknown } & Record<string, unknown>;

function readLinkedEvidenceIds(metadata: unknown): string[] {
  const md = (metadata ?? {}) as FindingMetadata;
  return Array.isArray(md.linkedEvidenceIds)
    ? md.linkedEvidenceIds.filter((x): x is string => typeof x === "string")
    : [];
}

function withLinkedEvidenceIds(metadata: unknown, ids: string[]): Record<string, unknown> {
  const md = (metadata ?? {}) as FindingMetadata;
  return { ...md, linkedEvidenceIds: ids };
}

const FINDING_TYPE_BY_IMPACT: Record<string, string> = {
  revenue: "market",
  cost: "operational",
  execution: "operational",
  risk: "technical",
};
function deriveFindingType(impactArea: string | null): string {
  return (impactArea && FINDING_TYPE_BY_IMPACT[impactArea]) || "technical";
}

// Evidence "visibility" is not a column; when present it lives under Evidence.metadata.visibility.
// Absent/unknown defaults to "internal" (fail-closed for client-visible filtering).
function readEvidenceVisibility(metadata: unknown): string {
  const md = (metadata ?? {}) as Record<string, unknown>;
  return typeof md.visibility === "string" ? md.visibility : "internal";
}

export async function createFinding(
  input: CreateFindingInput,
  auth: ServiceAuthEnvelope
): Promise<{ id: string; engagementId: string }> {
  // Map backward compatibility fields
  const summary = input.summary || input.description || input.statement || "";
  const primaryEvidenceId = input.primaryEvidenceId || (input.linkedEvidenceIds?.[0]);

  // Validate engagement exists
  const engagement = await db.engagement.findUnique({
    where: { id: input.engagementId, workspaceId: auth.verifiedWorkspaceId },
    select: { id: true },
  });
  if (!engagement) throw new NotFoundError("Engagement", input.engagementId);

  // Validate primaryEvidenceId is provided (required by schema)
  if (!primaryEvidenceId) {
    throw new ValidationError(
      "primaryEvidenceId is required. Evidence must be created before Finding."
    );
  }

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
  if (!summary || summary.trim().length === 0) {
    throw new ValidationError("summary is required");
  }

  // Validate impactArea
  const validImpacts = ["revenue", "cost", "execution", "risk"];
  if (!validImpacts.includes(input.impactArea)) {
    throw new ValidationError(
      `Invalid impact area: ${input.impactArea}. Must be one of: ${validImpacts.join(", ")}`
    );
  }

  const finding = await db.finding.create({
    data: {
      id: randomUUID(),
      engagementId: input.engagementId,
      title: input.title,
      summary: summary,
      primaryEvidenceId: primaryEvidenceId,
      impactArea: input.impactArea,
      severity: input.severity,
      rootCause: input.rootCause || null,
      updatedAt: new Date(),
    },
    select: { id: true, engagementId: true },
  });

  // Emit audit event as side effect
  await emitAuditEvent({
    eventName: AUDIT_EVENTS.FINDING_CREATED,
    actorId: auth.verifiedActorId,
    entityType: "Finding",
    entityId: finding.id,
    workspaceId: auth.verifiedWorkspaceId,
    payload: {
      engagementId: input.engagementId,
      severity: input.severity,
      title: input.title,
    },
  });

  // Check if this is the first finding for the engagement (indicates initial diagnosis)
  const previousFindingsCount = await db.finding.count({
    where: { engagementId: input.engagementId },
  });

  // Only trigger re-evaluation if there are already findings
  // First finding creation is part of initial diagnosis, which should not re-evaluate
  if (previousFindingsCount > 1) {
    await triggerReEvaluation({
      changeType: "new_critical_evidence",
      entityType: "Finding",
      entityId: finding.id,
      engagementId: input.engagementId,
      workspaceId: auth.verifiedWorkspaceId,
      severity: (input.severity === "critical" ? "critical" : input.severity === "high" ? "high" : "medium") as "low" | "medium" | "high" | "critical",
      description: `Finding created: ${input.title}`,
      triggeredBy: auth.verifiedActorId,
    });
  }

  return finding;
}

export async function updateFinding(
  findingId: string,
  input: UpdateFindingInput,
  auth: ServiceAuthEnvelope
): Promise<{ id: string }> {
  // Validate finding exists and check version
  const existing = await db.finding.findUnique({
    where: { id: findingId, engagement: { workspaceId: auth.verifiedWorkspaceId } },
    select: { id: true, engagementId: true, version: true },
  });
  if (!existing) throw new NotFoundError("Finding", findingId);

  // Check for version conflict
  if (existing.version !== input.version) {
    throw new ValidationError(
      `Version conflict: current version is ${existing.version}, expected ${input.version}`
    );
  }

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
  // Increment version on update
  data.version = existing.version + 1;

  const updated = await db.finding.update({
    where: { id: findingId },
    data,
    select: { id: true, engagementId: true },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.FINDING_UPDATED,
    actorId: auth.verifiedActorId,
    entityType: "Finding",
    entityId: findingId,
    workspaceId: auth.verifiedWorkspaceId,
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
    workspaceId: auth.verifiedWorkspaceId,
    severity: updateSeverity as "low" | "medium" | "high" | "critical",
    description: `Finding updated: ${input.title || "finding"}`,
    triggeredBy: auth.verifiedActorId,
  });

  return { id: updated.id };
}

export async function validateFinding(
  findingId: string,
  auth: ServiceAuthEnvelope
): Promise<{ id: string }> {
  // Validate capability
  if (!auth.verifiedCapabilities.has(CAPABILITIES.FINDING_VALIDATE)) {
    throw new ForbiddenError(`${CAPABILITIES.FINDING_VALIDATE} capability required`);
  }

  const existing = await db.finding.findUnique({
    where: { id: findingId, engagement: { workspaceId: auth.verifiedWorkspaceId } },
    select: { id: true, engagementId: true, primaryEvidenceId: true, metadata: true },
  });
  if (!existing) throw new NotFoundError("Finding", findingId);

  const linkedIds = readLinkedEvidenceIds(existing.metadata);
  if (!existing.primaryEvidenceId && linkedIds.length === 0) {
    throw new ValidationError("Finding must have at least one linked evidence before validation");
  }

  // Update finding status to validated
  await db.finding.update({
    where: { id: findingId },
    data: { status: "validated" },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.FINDING_VALIDATED,
    actorId: auth.verifiedActorId,
    entityType: "Finding",
    entityId: findingId,
    workspaceId: auth.verifiedWorkspaceId,
    payload: {
      engagementId: existing.engagementId,
    },
    visibility: "internal",
  });

  // Trigger re-evaluation due to finding validation
  await triggerReEvaluation({
    changeType: "new_critical_evidence",
    entityType: "Finding",
    entityId: findingId,
    engagementId: existing.engagementId,
    workspaceId: auth.verifiedWorkspaceId,
    severity: "high",
    description: "Finding validated",
    triggeredBy: auth.verifiedActorId,
  });

  return { id: existing.id };
}

export async function disputeFinding(
  findingId: string,
  auth: ServiceAuthEnvelope
): Promise<{ id: string }> {
  // Validate capability
  if (!auth.verifiedCapabilities.has(CAPABILITIES.FINDING_VALIDATE)) {
    throw new ForbiddenError(`${CAPABILITIES.FINDING_VALIDATE} capability required`);
  }

  const existing = await db.finding.findUnique({
    where: { id: findingId, engagement: { workspaceId: auth.verifiedWorkspaceId } },
    select: { id: true, engagementId: true },
  });
  if (!existing) throw new NotFoundError("Finding", findingId);

  // Update finding status to disputed
  await db.finding.update({
    where: { id: findingId },
    data: { status: "disputed" },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.FINDING_DISPUTED,
    actorId: auth.verifiedActorId,
    entityType: "Finding",
    entityId: findingId,
    workspaceId: auth.verifiedWorkspaceId,
    payload: {
      engagementId: existing.engagementId,
    },
  });

  return { id: existing.id };
}

export async function supersedeFinding(
  oldFindingId: string,
  newFindingInput: CreateFindingInput,
  auth: ServiceAuthEnvelope
): Promise<{ id: string; supersededFindingId: string }> {
  // Validate capability
  if (!auth.verifiedCapabilities.has(CAPABILITIES.FINDING_VALIDATE)) {
    throw new ForbiddenError(`${CAPABILITIES.FINDING_VALIDATE} capability required`);
  }

  // Validate old finding exists with workspace scope
  const oldFinding = await db.finding.findFirst({
    where: {
      id: oldFindingId,
      engagement: { workspaceId: auth.verifiedWorkspaceId },
    },
    select: { id: true, engagementId: true },
  });
  if (!oldFinding) throw new NotFoundError("Finding", oldFindingId);

  // Create the superseding finding using REAL schema columns only. The prior implementation wrote
  // phantom columns (description/findingType/linkedEvidence/createdBy/workspaceId) and omitted the
  // required primaryEvidenceId → PrismaClientValidationError. Finding scopes via engagement; linked
  // evidence lives in metadata; findingType/description are derived, not stored.
  const newPrimaryEvidenceId =
    newFindingInput.primaryEvidenceId || newFindingInput.linkedEvidenceIds?.[0];
  if (!newPrimaryEvidenceId) {
    throw new ValidationError(
      "primaryEvidenceId is required. Evidence must be created before Finding."
    );
  }
  const newSummary = newFindingInput.summary || newFindingInput.description || newFindingInput.statement || "";
  const newFinding = await db.finding.create({
    data: {
      id: randomUUID(),
      engagementId: newFindingInput.engagementId,
      title: newFindingInput.title,
      summary: newSummary,
      primaryEvidenceId: newPrimaryEvidenceId,
      impactArea: newFindingInput.impactArea,
      severity: newFindingInput.severity,
      rootCause: newFindingInput.rootCause || null,
      ...(newFindingInput.linkedEvidenceIds?.length
        ? { metadata: { linkedEvidenceIds: newFindingInput.linkedEvidenceIds } }
        : {}),
      updatedAt: new Date(),
    },
    select: { id: true, engagementId: true },
  });

  // Update old finding status to superseded
  await db.finding.update({
    where: { id: oldFindingId },
    data: { status: "superseded" },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.FINDING_SUPERSEDED,
    actorId: auth.verifiedActorId,
    entityType: "Finding",
    entityId: newFinding.id,
    workspaceId: auth.verifiedWorkspaceId,
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
  authOrLinkType: ServiceAuthEnvelope | string,
  maybeAuth?: ServiceAuthEnvelope
): Promise<{ id?: string; findingId: string; evidenceId: string }> {
  // Handle both calling conventions
  let auth: ServiceAuthEnvelope;

  if (typeof authOrLinkType === "string" && maybeAuth) {
    // New signature: linkEvidenceToFinding(findingId, evidenceId, linkType, auth)
    auth = maybeAuth;
  } else if (typeof authOrLinkType === "object") {
    // Signature: linkEvidenceToFinding(findingId, evidenceId, auth)
    auth = authOrLinkType as ServiceAuthEnvelope;
  } else {
    throw new Error("Invalid arguments to linkEvidenceToFinding");
  }

  const finding = await db.finding.findFirst({
    where: {
      id: findingId,
      engagement: { workspaceId: auth.verifiedWorkspaceId },
    },
    select: { id: true, engagementId: true, metadata: true },
  });
  if (!finding) throw new NotFoundError("Finding", findingId);

  const evidence = await db.evidence.findFirst({
    where: {
      id: evidenceId,
      engagement: { workspaceId: auth.verifiedWorkspaceId },
    },
    select: { id: true, engagementId: true, status: true },
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

  const linkedIds = readLinkedEvidenceIds(finding.metadata);
  if (linkedIds.includes(evidenceId)) {
    throw new ValidationError("Evidence is already linked to this finding");
  }

  const updated = await db.finding.update({
    where: { id: findingId },
    data: {
      metadata: withLinkedEvidenceIds(finding.metadata, [...linkedIds, evidenceId]),
      updatedAt: new Date(),
    },
    select: { id: true, engagementId: true },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.FINDING_EVIDENCE_LINKED,
    actorId: auth.verifiedActorId,
    entityType: "Finding",
    entityId: findingId,
    workspaceId: auth.verifiedWorkspaceId,
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
  auth: ServiceAuthEnvelope
): Promise<{ findingId: string; evidenceId: string }> {
  const finding = await db.finding.findFirst({
    where: {
      id: findingId,
      engagement: { workspaceId: auth.verifiedWorkspaceId },
    },
    select: { id: true, engagementId: true, metadata: true },
  });
  if (!finding) throw new NotFoundError("Finding", findingId);

  const evidence = await db.evidence.findFirst({
    where: {
      id: evidenceId,
      engagement: { workspaceId: auth.verifiedWorkspaceId },
    },
    select: { id: true, engagementId: true },
  });
  if (!evidence) throw new NotFoundError("Evidence", evidenceId);

  if (finding.engagementId !== evidence.engagementId) {
    throw new ValidationError("Finding and evidence must belong to the same engagement");
  }

  const linkedIds = readLinkedEvidenceIds(finding.metadata);
  if (!linkedIds.includes(evidenceId)) {
    throw new ValidationError("Evidence is not linked to this finding");
  }

  const updated = await db.finding.update({
    where: { id: findingId },
    data: {
      metadata: withLinkedEvidenceIds(
        finding.metadata,
        linkedIds.filter((id) => id !== evidenceId)
      ),
      updatedAt: new Date(),
    },
    select: { id: true },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.FINDING_EVIDENCE_UNLINKED,
    actorId: auth.verifiedActorId,
    entityType: "Finding",
    entityId: findingId,
    workspaceId: auth.verifiedWorkspaceId,
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
  userId?: string,
  visibility?: "internal" | "client_visible" | "all",
  workspaceId?: string
): Promise<Array<{
  id: string;
  title: string;
  severity: string;
  impactArea: string | null;
  createdAt: Date;
}>> {
  // Check engagement access if userId provided
  if (userId && workspaceId) {
    await assertEngagementAccess(userId, engagementId, workspaceId);
  }

  const findingsWithEvidence = await db.finding.findMany({
    where: {
      engagementId,
      ...(workspaceId && { engagement: { workspaceId } }),
    },
    select: {
      id: true,
      title: true,
      severity: true,
      impactArea: true,
      createdAt: true,
      metadata: true,
    },
    orderBy: { createdAt: "desc" },
  });

  // Filter findings based on visibility of linked evidence
  if (visibility && (visibility === "client_visible" || visibility === "internal")) {
    // Collect all evidence IDs from all findings
    const evidenceIds = new Set<string>();
    findingsWithEvidence.forEach((f: typeof findingsWithEvidence[0]) => {
      readLinkedEvidenceIds(f.metadata).forEach((id: string) => {
        if (id) evidenceIds.add(id);
      });
    });

    // Fetch visibility info for all evidence (from the real Evidence.metadata JSON)
    let evidenceVisibilityMap = new Map<string, string>();
    if (evidenceIds.size > 0) {
      const evidence = await db.evidence.findMany({
        where: {
          id: { in: Array.from(evidenceIds) },
          ...(workspaceId && { engagement: { workspaceId } }),
        },
        select: { id: true, metadata: true },
      });

      evidenceVisibilityMap = new Map(
        evidence.map((e: typeof evidence[0]) => [e.id, readEvidenceVisibility(e.metadata)])
      );
    }

    // Filter based on visibility
    const filtered = findingsWithEvidence.filter((finding: typeof findingsWithEvidence[0]) => {
      const linkedIds = readLinkedEvidenceIds(finding.metadata);

      if (visibility === "client_visible") {
        // All linked evidence must be client_visible
        // If no linked evidence, don't show (default to internal)
        if (linkedIds.length === 0) {
          return false;
        }

        return linkedIds.every(
          (id: string) => evidenceVisibilityMap.get(id) === "client_visible"
        );
      }
      // visibility === "internal": show all
      return true;
    });

    return filtered.map((f: typeof findingsWithEvidence[0]) => ({
      id: f.id,
      title: f.title,
      severity: f.severity,
      impactArea: f.impactArea,
      createdAt: f.createdAt,
    }));
  }

  // No visibility filter, return all
  return findingsWithEvidence.map((f: typeof findingsWithEvidence[0]) => ({
    id: f.id,
    title: f.title,
    severity: f.severity,
    impactArea: f.impactArea,
    createdAt: f.createdAt,
  }));
}

export async function getFindingDetail(
  findingId: string,
  userIdOrVisibility?: string,
  maybeVisibility?: "internal" | "client_visible" | "all",
  workspaceId?: string
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
  status: string;
  version: number;
  provisionalFlag: boolean;
  createdAt: Date;
  updatedAt: Date;
  evidenceLinks?: Array<{
    id: string;
    evidenceItemId: string;
    linkType: string;
  }>;
}> {
  // Detect if param is visibility or userId
  let userId: string | undefined;
  let visibility: "internal" | "client_visible" | "all" | undefined;

  if (userIdOrVisibility && ["internal", "client_visible", "all"].includes(userIdOrVisibility)) {
    visibility = userIdOrVisibility as "internal" | "client_visible" | "all";
  } else {
    userId = userIdOrVisibility;
    visibility = maybeVisibility;
  }

  if (!workspaceId) {
    throw new Error("workspaceId is required for workspace isolation");
  }

  const finding = await db.finding.findFirst({
    where: {
      id: findingId,
      engagement: { workspaceId },
    },
    select: { engagementId: true, metadata: true },
  });

  if (!finding) throw new NotFoundError("Finding", findingId);

  // Check engagement access if userId provided
  if (userId) {
    await assertEngagementAccess(userId, finding.engagementId, workspaceId);
  }

  // Check visibility if visibility filter is provided
  if (visibility === "client_visible") {
    // For client_visible, all linked evidence must be client_visible
    const linkedIds = readLinkedEvidenceIds(finding.metadata);

    // If no linked evidence or any is internal, deny access
    if (linkedIds.length === 0) {
      throw new NotFoundError("Finding", findingId);
    }

    const evidence = await db.evidence.findMany({
      where: {
        id: { in: linkedIds },
        ...(workspaceId && { engagement: { workspaceId } }),
      },
      select: { id: true, metadata: true },
    });

    const hasInternalEvidence = evidence.some(
      (e: typeof evidence[0]) => readEvidenceVisibility(e.metadata) === "internal"
    );
    if (hasInternalEvidence) {
      throw new NotFoundError("Finding", findingId);
    }
  }

  const detailFinding = await db.finding.findFirst({
    where: {
      id: findingId,
      engagement: { workspaceId },
    },
    select: {
      id: true,
      engagementId: true,
      title: true,
      summary: true,
      severity: true,
      impactArea: true,
      rootCause: true,
      status: true,
      version: true,
      metadata: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!detailFinding) throw new NotFoundError("Finding", findingId);

  // Map real schema columns to the response DTO: description←summary, findingType←impactArea,
  // linkedEvidence←metadata.linkedEvidenceIds, provisionalFlag←status. No phantom columns selected.
  return {
    id: detailFinding.id,
    engagementId: detailFinding.engagementId,
    title: detailFinding.title,
    description: detailFinding.summary ?? null,
    findingType: deriveFindingType(detailFinding.impactArea),
    severity: detailFinding.severity,
    impactArea: detailFinding.impactArea,
    rootCause: detailFinding.rootCause,
    linkedEvidence: readLinkedEvidenceIds(detailFinding.metadata),
    status: detailFinding.status,
    version: detailFinding.version,
    provisionalFlag: detailFinding.status === "provisional",
    createdAt: detailFinding.createdAt,
    updatedAt: detailFinding.updatedAt,
  };
}
