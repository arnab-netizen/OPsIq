import { db } from "@/lib/db";
import type { ServiceAuthEnvelope } from "@/lib/canonical-route-enforcement";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError, ValidationError, ForbiddenError } from "@/infra/errors";
import { assertEngagementAccess } from "@/lib/visibility";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import {
  FINDING_STATUSES,
} from "@/domain/constants/statuses";
import { triggerReEvaluation } from "@/services/re-evaluation";
import { withIdempotency } from "@/infra/idempotency";
import { logger } from "@/infra/logger";
import { enforceWorkspaceId } from "@/lib/workspace-validation";
import { randomUUID } from "crypto";
import type {
  FindingStatus,
} from "@/domain/constants/statuses";

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

export async function createFinding(
  input: CreateFindingInput,
  auth: ServiceAuthEnvelope
): Promise<{ id: string; engagementId: string }> {
  // Map backward compatibility fields
  const summary = input.summary || input.description || input.statement || "";
  const primaryEvidenceId = input.primaryEvidenceId || (input.linkedEvidenceIds?.[0]) || null;

  // Validate engagement exists
  const engagement = await db.engagement.findUnique({
    where: { id: input.engagementId, workspaceId: auth.verifiedWorkspaceId },
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

  // Infer finding type from impact area
  const findingTypeMap: Record<string, string> = {
    revenue: "market",
    cost: "operational",
    execution: "operational",
    risk: "technical",
  };
  const findingType = findingTypeMap[input.impactArea] || "technical";

  const finding = await db.finding.create({
    data: {
      id: randomUUID(),
      engagementId: input.engagementId,
      title: input.title,
      summary: summary,
      primaryEvidenceId: primaryEvidenceId || "",
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

  // Trigger re-evaluation as side effect
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

  return finding;
}

export async function updateFinding(
  findingId: string,
  input: UpdateFindingInput,
  auth: ServiceAuthEnvelope
): Promise<{ id: string }> {
  // Validate finding exists and check version
  const existing = await db.finding.findUnique({
    where: { id: findingId, workspaceId: auth.verifiedWorkspaceId },
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
    where: { id: findingId, workspaceId: auth.verifiedWorkspaceId },
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
    select: { id: true, engagementId: true, linkedEvidence: true },
  });
  if (!existing) throw new NotFoundError("Finding", findingId);

  if (existing.linkedEvidence && existing.linkedEvidence.length === 0) {
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

  // Create new finding using the new field names
  const findingType = newFindingInput.impactArea === "revenue" ? "market" : "operational";
  const newFinding = await db.finding.create({
    data: {
      engagementId: newFindingInput.engagementId,
      title: newFindingInput.title,
      description: newFindingInput.summary,
      findingType: findingType,
      impactArea: newFindingInput.impactArea,
      severity: newFindingInput.severity,
      rootCause: newFindingInput.rootCause || null,
      linkedEvidence: newFindingInput.primaryEvidenceId || null,
      createdBy: auth.verifiedActorId,
      workspaceId: auth.verifiedWorkspaceId,
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
  let linkType: string | undefined;
  let auth: ServiceAuthEnvelope;

  if (typeof authOrLinkType === "string" && maybeAuth) {
    // New signature: linkEvidenceToFinding(findingId, evidenceId, linkType, auth)
    linkType = authOrLinkType;
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
    select: { id: true, engagementId: true, linkedEvidence: true },
  });
  if (!finding) throw new NotFoundError("Finding", findingId);

  const evidence = await db.evidence.findFirst({
    where: {
      id: evidenceId,
      engagement: { workspaceId: auth.verifiedWorkspaceId },
    },
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

  const updated = await db.$transaction(async (tx: any) => {
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
    select: { id: true, engagementId: true, linkedEvidence: true },
  });
  if (!finding) throw new NotFoundError("Finding", findingId);

  const evidence = await db.evidence.findFirst({
    where: {
      id: evidenceId,
      engagement: { workspaceId: auth.verifiedWorkspaceId },
    },
    select: { id: true, engagementId: true, relatedFindingId: true },
  });
  if (!evidence) throw new NotFoundError("Evidence", evidenceId);

  if (finding.engagementId !== evidence.engagementId) {
    throw new ValidationError("Finding and evidence must belong to the same engagement");
  }

  if (!finding.linkedEvidence.includes(evidenceId)) {
    throw new ValidationError("Evidence is not linked to this finding");
  }

  const updated = await db.$transaction(async (tx: any) => {
    const updatedFinding = await tx.finding.update({
      where: { id: findingId },
      data: {
        linkedEvidence: finding.linkedEvidence.filter((id: any) => id !== evidenceId),
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
      linkedEvidence: true,
    },
    orderBy: { createdAt: "desc" },
  });

  // Filter findings based on visibility of linked evidence
  if (visibility && (visibility === "client_visible" || visibility === "internal")) {
    // Collect all evidence IDs from all findings
    const evidenceIds = new Set<string>();
    findingsWithEvidence.forEach((f: typeof findingsWithEvidence[0]) => {
      let linkedIds: string[] = [];
      if (Array.isArray(f.linkedEvidence)) {
        linkedIds = f.linkedEvidence;
      } else if (typeof f.linkedEvidence === "string" && f.linkedEvidence) {
        linkedIds = [f.linkedEvidence];
      }
      linkedIds.forEach((id: string) => {
        if (id) evidenceIds.add(id);
      });
    });

    // Fetch visibility info for all evidence
    let evidenceVisibilityMap = new Map<string, string>();
    if (evidenceIds.size > 0) {
      const evidence = await db.evidence.findMany({
        where: {
          id: { in: Array.from(evidenceIds) },
          ...(workspaceId && { engagement: { workspaceId } }),
        },
        select: { id: true, visibility: true },
      });

      evidenceVisibilityMap = new Map(
        evidence.map((e: typeof evidence[0]) => [e.id, e.visibility])
      );
    }

    // Filter based on visibility
    const filtered = findingsWithEvidence.filter((finding: typeof findingsWithEvidence[0]) => {
      let linkedIds: string[] = [];
      if (Array.isArray(finding.linkedEvidence)) {
        linkedIds = finding.linkedEvidence;
      } else if (typeof finding.linkedEvidence === "string" && finding.linkedEvidence) {
        linkedIds = [finding.linkedEvidence];
      }

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
    select: { engagementId: true, linkedEvidence: true },
  });

  if (!finding) throw new NotFoundError("Finding", findingId);

  // Check engagement access if userId provided
  if (userId) {
    await assertEngagementAccess(userId, finding.engagementId, workspaceId);
  }

  // Check visibility if visibility filter is provided
  if (visibility === "client_visible") {
    // For client_visible, all linked evidence must be client_visible
    let linkedIds: string[] = [];
    if (Array.isArray(finding.linkedEvidence)) {
      linkedIds = finding.linkedEvidence;
    } else if (typeof finding.linkedEvidence === "string" && finding.linkedEvidence) {
      linkedIds = [finding.linkedEvidence];
    }

    // If no linked evidence or any is internal, deny access
    if (linkedIds.length === 0) {
      throw new NotFoundError("Finding", findingId);
    }

    const evidence = await db.evidence.findMany({
      where: {
        id: { in: linkedIds },
        ...(workspaceId && { engagement: { workspaceId } }),
      },
      select: { id: true, visibility: true },
    });

    const hasInternalEvidence = evidence.some((e: typeof evidence[0]) => e.visibility === "internal");
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
      description: true,
      findingType: true,
      severity: true,
      impactArea: true,
      rootCause: true,
      linkedEvidence: true,
      status: true,
      version: true,
      provisionalFlag: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!detailFinding) throw new NotFoundError("Finding", findingId);

  return detailFinding;
}
