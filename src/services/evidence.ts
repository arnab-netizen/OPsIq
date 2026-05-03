import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { withIdempotency } from "@/infra/idempotency";
import { NotFoundError, ValidationError } from "@/infra/errors";
import { assertEngagementAccess } from "@/lib/visibility";
import {
  optimisticUpdate,
  withVersionCheck,
  withVersionIncrement,
} from "@/lib/optimistic-lock";
import { logger } from "@/infra/logger";
import { triggerReEvaluation } from "@/services/re-evaluation";
import type { EvidenceStatus } from "@/domain/constants/statuses";
import { EVIDENCE_STATUSES } from "@/domain/constants/statuses";
import { enforceWorkspaceId } from "@/lib/workspace-validation";
import { requireServiceContext } from "@/lib/service-auth";
import type { AuthContext } from "@/lib/auth-guard";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface CreateEvidenceInput {
  engagementId: string;
  title?: string;
  description?: string;
  evidenceType?: "document" | "interview" | "metric" | "observation";
  sourceReference?: string;
  severity?: "low" | "medium" | "high" | "critical";
  // Backward compatibility with old field names
  category?: string;
  type?: string;
  sourceType?: string;
  sourceLabel?: string;
  sourceOwner?: string;
  captureMethod?: string;
  capturedAt?: string;
  statement?: string;
}

export interface UpdateEvidenceInput {
  title?: string;
  description?: string;
  evidenceType?: "document" | "interview" | "metric" | "observation";
  sourceReference?: string;
  severity?: "low" | "medium" | "high" | "critical";
  status?: EvidenceStatus;
  rejectionReason?: string;
  version: number;
  // Backward compatibility
  statement?: string;
  validationStatus?: "submitted" | "validated" | "rejected";
}

// ─── Service ───────────────────────────────────────────────────────────────

export async function createEvidence(
  input: CreateEvidenceInput,
  authContext: AuthContext,
  workspaceId: string
): Promise<{ id: string; engagementId?: string }> {
  const [userId, validatedWorkspaceId] = requireServiceContext(authContext, workspaceId);

  // Map old field names to new ones for backward compatibility
  const title = input.title || input.sourceLabel || "";

  // Map sourceType to evidenceType
  let mappedSourceType = input.sourceType || input.evidenceType || "observation";
  if (mappedSourceType === "client_feedback") {
    mappedSourceType = "observation";
  }

  const evidenceType = (input.evidenceType || mappedSourceType) as "document" | "interview" | "metric" | "observation";
  const sourceReference = input.sourceReference || input.sourceType || null;
  const description = input.description || input.statement || null;

  // Validate category if using old interface
  if (input.category) {
    const validCategories = ["financial", "operational", "human", "resilience", "client", "commercial", "leadership", "execution"];
    if (!validCategories.includes(input.category)) {
      throw new ValidationError(`Invalid evidence category: ${input.category}`);
    }
  }

  // Validate source type if using old interface
  if (input.sourceType && !["document", "interview", "metric", "observation", "client_feedback"].includes(input.sourceType)) {
    throw new ValidationError(`Invalid source type: ${input.sourceType}`);
  }

  // Validate capture method if using old interface
  if (input.captureMethod) {
    const validMethods = ["uploaded", "manual", "extracted", "generated"];
    if (!validMethods.includes(input.captureMethod)) {
      throw new ValidationError(`Invalid capture method: ${input.captureMethod}`);
    }
  }

  // Validate engagement exists
  const engagement = await db.engagement.findUnique({
    where: { id: input.engagementId, workspaceId: validatedWorkspaceId },
  });
  if (!engagement) throw new NotFoundError("Engagement", input.engagementId);

  // Validate evidence type
  const validTypes = ["document", "interview", "metric", "observation"];
  if (!validTypes.includes(evidenceType)) {
    throw new ValidationError(
      `Invalid evidence type: ${evidenceType}. Must be one of: ${validTypes.join(", ")}`
    );
  }

  const idempotencyKey = `evidence-create:${input.engagementId}:${title}:${userId}`;

  const result = await withIdempotency(
    idempotencyKey,
    "evidence.create",
    async () => {
      // Determine visibility based on evidence type
      const visibility = evidenceType === "document" ? "client_visible" : "internal";

      const evidence = await db.evidence.create({
        data: {
          engagementId: input.engagementId,
          title,
          description,
          evidenceType,
          sourceReference,
          severity: input.severity ?? null,
          submittedBy: userId,
          status: "submitted",
          visibility,
          workspaceId: validatedWorkspaceId,
        },
      });
      return { id: evidence.id };
    }
  );

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.EVIDENCE_SUBMITTED,
    actorId: userId,
    entityType: "evidence",
    entityId: result.result.id,
    payload: {
      engagementId: input.engagementId,
      evidenceType,
      title,
    },
    visibility: "internal",
  });

  // Trigger re-evaluation due to new evidence
  await triggerReEvaluation({
    changeType: "new_critical_evidence",
    entityType: "evidence",
    entityId: result.result.id,
    engagementId: input.engagementId,
    workspaceId: validatedWorkspaceId,
    severity: (input.severity ?? "medium") as "low" | "medium" | "high" | "critical",
    description: `Evidence submitted: ${title}`,
    triggeredBy: userId,
  });

  logger.info("Evidence created", {
    evidenceId: result.result.id,
    engagementId: input.engagementId,
  });

  return { id: result.result.id, engagementId: input.engagementId };
}

export async function updateEvidence(
  evidenceId: string,
  input: UpdateEvidenceInput,
  authContext: AuthContext,
  workspaceId: string
): Promise<{ id: string }> {
  const [userId, validatedWorkspaceId] = requireServiceContext(authContext, workspaceId);

  const evidence = await db.evidence.findUnique({
    where: { id: evidenceId, workspaceId: validatedWorkspaceId },
  });
  if (!evidence) throw new NotFoundError("Evidence", evidenceId);

  // Check version first
  if (evidence.version !== input.version) {
    throw new ValidationError(
      `Version conflict: current version is ${evidence.version}, expected ${input.version}`
    );
  }

  // Cannot update validated or rejected evidence
  if (evidence.status === "validated" || evidence.status === "rejected") {
    throw new ValidationError(
      `Cannot update evidence with status: ${evidence.status}`
    );
  }

  const { version, statement, validationStatus, ...fields } = input;
  const data: Record<string, unknown> = {};

  // Map backward compatibility fields
  const actualStatus = input.status || validationStatus;
  const actualDescription = input.description || statement;

  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    data[k] = v;
  }

  // Add mapped fields
  if (actualDescription !== undefined) data.description = actualDescription;
  if (actualStatus !== undefined) data.status = actualStatus;

  const statusChanged = actualStatus && actualStatus !== evidence.status;

  await optimisticUpdate("evidence", evidenceId, version, () =>
    db.evidence.update({
      where: withVersionCheck({ id: evidenceId, workspaceId: validatedWorkspaceId }, version),
      data: withVersionIncrement(data),
    })
  );

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.EVIDENCE_SUBMITTED,
    actorId: userId,
    entityType: "evidence",
    entityId: evidenceId,
    workspaceId: validatedWorkspaceId,
    payload: data,
    visibility: "internal",
  });

  if (statusChanged && input.status === "validated") {
    await emitAuditEvent({
      eventName: AUDIT_EVENTS.EVIDENCE_VALIDATED,
      actorId: userId,
      entityType: "evidence",
      entityId: evidenceId,
      workspaceId: validatedWorkspaceId,
      payload: { previousStatus: evidence.status },
      visibility: "internal",
    });
  } else if (statusChanged && input.status === "rejected") {
    await emitAuditEvent({
      eventName: AUDIT_EVENTS.EVIDENCE_REJECTED,
      actorId: userId,
      entityType: "evidence",
      entityId: evidenceId,
      workspaceId: validatedWorkspaceId,
      payload: { previousStatus: evidence.status, reason: input.rejectionReason },
      visibility: "internal",
    });
  }

  logger.info("Evidence updated", { evidenceId });
  return { id: evidenceId };
}

export async function getEvidenceById(
  evidenceId: string,
  workspaceId: string,
  userIdOrVisibility?: string
) {
  enforceWorkspaceId(workspaceId, "getEvidenceById", "evidence");

  // Detect if param is visibility or userId
  let userId: string | undefined;
  let visibility: "internal" | "client_visible" | "all" | undefined;

  if (userIdOrVisibility && ["internal", "client_visible", "all"].includes(userIdOrVisibility)) {
    visibility = userIdOrVisibility as "internal" | "client_visible" | "all";
  } else {
    userId = userIdOrVisibility;
  }

  const evidence = await db.evidence.findUnique({
    where: { id: evidenceId, workspaceId },
  });

  if (!evidence) throw new NotFoundError("Evidence", evidenceId);

  // Check visibility if visibility filter is provided
  if (visibility === "client_visible" && evidence.visibility === "internal") {
    throw new NotFoundError("Evidence", evidenceId);
  }

  // Check engagement access if userId provided
  if (userId) {
    await assertEngagementAccess(userId, evidence.engagementId, workspaceId);
  }

  const fullEvidence = await db.evidence.findUnique({
    where: { id: evidenceId, workspaceId },
    include: {
      engagement: { select: { id: true, code: true, title: true } },
      submitter: { select: { id: true, name: true, email: true } },
      validator: { select: { id: true, name: true, email: true } },
    },
  });

  if (!fullEvidence) throw new NotFoundError("Evidence", evidenceId);

  // Add backward compatibility fields for old interface
  const result: any = fullEvidence;
  result.category = fullEvidence.evidenceType === "document" ? "financial" : "operational";
  result.type = fullEvidence.evidenceType;
  result.sourceType = fullEvidence.evidenceType;
  result.sourceLabel = fullEvidence.title;
  result.statement = fullEvidence.description;
  result.validationStatus = fullEvidence.status;

  return result;
}

export async function listEvidence(
  workspaceId: string,
  engagementIdOrParams?: string | {
    engagementId?: string;
    status?: string;
    limit?: number;
    offset?: number;
    userId?: string;
  },
  userIdOrUndefined?: string,
  visibilityFilter?: "internal" | "client_visible" | "all"
) {
  enforceWorkspaceId(workspaceId, "listEvidence", "evidence");

  // Handle both calling conventions
  let engagementId: string | undefined;
  let userId: string | undefined;
  let visibility: string | undefined;
  let status: string | undefined;
  let limit = 25;
  let offset = 0;

  if (typeof engagementIdOrParams === "string") {
    // Positional arguments: listEvidence(engagementId, userId?, visibility?)
    engagementId = engagementIdOrParams;
    userId = userIdOrUndefined;
    visibility = visibilityFilter;
  } else if (typeof engagementIdOrParams === "object" && engagementIdOrParams) {
    // Object argument: listEvidence({ engagementId, status, ... })
    engagementId = engagementIdOrParams.engagementId;
    userId = engagementIdOrParams.userId;
    status = engagementIdOrParams.status;
    limit = engagementIdOrParams.limit ?? 25;
    offset = engagementIdOrParams.offset ?? 0;
  }

  // Check engagement exists if provided
  if (engagementId) {
    const engagement = await db.engagement.findUnique({
      where: { id: engagementId, workspaceId },
      select: { id: true },
    });
    if (!engagement) throw new NotFoundError("Engagement", engagementId);
  }

  // Check engagement access if userId provided
  if (engagementId && userId) {
    await assertEngagementAccess(userId, engagementId, workspaceId);
  }

  const where = {
    workspaceId,
    ...(engagementId && { engagementId }),
    ...(status && { status }),
    ...(visibility === "internal" && { visibility: "internal" }),
    ...(visibility === "client_visible" && { visibility: "client_visible" }),
  };

  const [evidence, total] = await Promise.all([
    db.evidence.findMany({
      where,
      select: {
        id: true,
        title: true,
        evidenceType: true,
        status: true,
        severity: true,
        createdAt: true,
        engagement: { select: { id: true, code: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    db.evidence.count({ where }),
  ]);

  // Return array for positional argument calls, object for backward compatibility
  if (typeof engagementIdOrParams === "string") {
    return evidence;
  }
  return { evidence, total, limit, offset };
}

export async function validateEvidence(
  input: { evidenceItemId: string; isValid: boolean; version: number } | string,
  authContextOrActorId?: AuthContext | string,
  workspaceIdOrUndefined?: string
) {
  // Handle both function signatures: new (AuthContext) and old (actorId) for backward compatibility
  let userId: string;
  let workspaceId: string;

  if (typeof authContextOrActorId === "string") {
    // Old signature: validateEvidence(input, actorId, workspaceId)
    userId = authContextOrActorId;
    workspaceId = workspaceIdOrUndefined || "";
  } else if (authContextOrActorId) {
    // New signature: validateEvidence(input, authContext, workspaceId)
    const [uid, wid] = requireServiceContext(authContextOrActorId, workspaceIdOrUndefined || "");
    userId = uid;
    workspaceId = wid;
  } else {
    throw new Error("authContext or actorId is required");
  }

  if (!workspaceId) throw new Error("workspaceId is required");
  enforceWorkspaceId(workspaceId, "validateEvidence", "evidence");

  // Handle both function signatures for backward compatibility
  const evidenceId = typeof input === "string" ? input : input.evidenceItemId;
  const actor = userId;

  if (!actor) throw new Error("userId is required");

  const evidence = await db.evidence.findUnique({
    where: { id: evidenceId, workspaceId },
  });
  if (!evidence) throw new NotFoundError("Evidence", evidenceId);

  if (evidence.status === "validated") {
    throw new ValidationError("Evidence is already validated");
  }

  const updated = await db.evidence.update({
    where: { id: evidenceId, workspaceId },
    data: {
      status: "validated" as EvidenceStatus,
      version: { increment: 1 },
    },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.EVIDENCE_VALIDATED,
    actorId: actor,
    entityType: "evidence",
    entityId: evidenceId,
    workspaceId,
    payload: {
      engagementId: evidence.engagementId,
    },
    visibility: "internal",
  });

  return updated;
}

export interface CreateEvidenceBundleInput {
  engagementId: string;
  title: string;
  description?: string;
}

export interface UpdateEvidenceBundleInput {
  title?: string;
  description?: string;
  status?: "active" | "archived";
  version: number;
}

export interface AddEvidenceToBundleInput {
  bundleId: string;
  evidenceItemId: string;
}

export interface RemoveEvidenceFromBundleInput {
  bundleId: string;
  evidenceItemId: string;
}

export async function createEvidenceBundle(
  input: CreateEvidenceBundleInput,
  authContext: AuthContext,
  workspaceId: string
) {
  const [userId, validatedWorkspaceId] = requireServiceContext(authContext, workspaceId);

  const engagement = await db.engagement.findUnique({
    where: { id: input.engagementId, workspaceId: validatedWorkspaceId },
  });
  if (!engagement) throw new NotFoundError("Engagement", input.engagementId);

  const bundle = await db.evidenceBundle.create({
    data: {
      engagementId: input.engagementId,
      title: input.title,
      description: input.description ?? null,
      createdBy: userId,
      workspaceId: validatedWorkspaceId,
    },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.EVIDENCE_BUNDLE_CREATED,
    actorId: userId,
    entityType: "evidence_bundle",
    entityId: bundle.id,
    payload: {
      engagementId: input.engagementId,
      title: input.title,
    },
    visibility: "internal",
  });

  return bundle;
}

export async function getEvidenceBundleById(bundleId: string, workspaceId: string) {
  enforceWorkspaceId(workspaceId, "getEvidenceBundleById", "evidence_bundle");

  const bundle = await db.evidenceBundle.findUnique({
    where: { id: bundleId, workspaceId },
    include: {
      items: {
        where: { removedAt: null },
        include: { evidence: true },
      },
    },
  });
  if (!bundle) throw new NotFoundError("EvidenceBundle", bundleId);
  return bundle;
}

export async function listEvidenceBundles(engagementId: string, workspaceId: string) {
  enforceWorkspaceId(workspaceId, "listEvidenceBundles", "evidence_bundle");

  // Check engagement exists
  const engagement = await db.engagement.findUnique({
    where: { id: engagementId, workspaceId },
    select: { id: true },
  });
  if (!engagement) throw new NotFoundError("Engagement", engagementId);

  return db.evidenceBundle.findMany({
    where: { engagementId, workspaceId, status: "active" },
    include: {
      items: {
        where: { removedAt: null },
        select: { id: true, evidenceId: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function addEvidenceToBundle(
  input: AddEvidenceToBundleInput,
  authContext: AuthContext,
  workspaceId: string
) {
  const [userId, validatedWorkspaceId] = requireServiceContext(authContext, workspaceId);

  const bundle = await db.evidenceBundle.findUnique({
    where: { id: input.bundleId, workspaceId: validatedWorkspaceId },
  });
  if (!bundle) throw new NotFoundError("EvidenceBundle", input.bundleId);

  const evidence = await db.evidence.findUnique({
    where: { id: input.evidenceItemId, workspaceId: validatedWorkspaceId },
  });
  if (!evidence) throw new NotFoundError("Evidence", input.evidenceItemId);

  const existing = await db.evidenceBundleItem.findFirst({
    where: {
      bundleId: input.bundleId,
      evidenceId: input.evidenceItemId,
      removedAt: null,
      workspaceId: validatedWorkspaceId,
    },
  });
  if (existing) {
    throw new ValidationError("Evidence is already in this bundle");
  }

  const item = await db.evidenceBundleItem.create({
    data: {
      bundleId: input.bundleId,
      evidenceId: input.evidenceItemId,
      addedBy: userId,
      workspaceId: validatedWorkspaceId,
    },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.EVIDENCE_BUNDLE_ITEM_ADDED,
    actorId: userId,
    entityType: "evidence_bundle_item",
    entityId: item.id,
    payload: {
      bundleId: input.bundleId,
      evidenceId: input.evidenceItemId,
    },
    visibility: "internal",
  });

  return item;
}

export async function removeEvidenceFromBundle(
  input: RemoveEvidenceFromBundleInput,
  authContext: AuthContext,
  workspaceId: string
) {
  const [userId, validatedWorkspaceId] = requireServiceContext(authContext, workspaceId);

  const item = await db.evidenceBundleItem.findFirst({
    where: {
      bundleId: input.bundleId,
      evidenceId: input.evidenceItemId,
      workspaceId: validatedWorkspaceId,
    },
  });
  if (!item) throw new NotFoundError("EvidenceBundleItem", "notfound");

  if (item.removedAt !== null) {
    throw new ValidationError("Item is already removed from bundle");
  }

  const updated = await db.evidenceBundleItem.update({
    where: { id: item.id, workspaceId: validatedWorkspaceId },
    data: { removedAt: new Date() },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.EVIDENCE_BUNDLE_ITEM_REMOVED,
    actorId: userId,
    entityType: "evidence_bundle_item",
    entityId: item.id,
    payload: {
      bundleId: item.bundleId,
      evidenceId: item.evidenceId,
    },
    visibility: "internal",
  });

  return updated;
}

export async function updateEvidenceBundle(
  bundleId: string,
  input: UpdateEvidenceBundleInput,
  authContext: AuthContext,
  workspaceId: string
) {
  const [userId, validatedWorkspaceId] = requireServiceContext(authContext, workspaceId);

  const bundle = await db.evidenceBundle.findUnique({
    where: { id: bundleId, workspaceId: validatedWorkspaceId },
  });
  if (!bundle) throw new NotFoundError("EvidenceBundle", bundleId);

  if (bundle.version !== input.version) {
    throw new Error("Bundle was modified. Please refresh and try again.");
  }

  const updates: any = { version: { increment: 1 } };
  if (input.title) updates.title = input.title;
  if (input.description !== undefined) updates.description = input.description;
  if (input.status) updates.status = input.status;

  const updated = await db.evidenceBundle.update({
    where: { id: bundleId, workspaceId: validatedWorkspaceId },
    data: updates,
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.EVIDENCE_BUNDLE_UPDATED,
    actorId: userId,
    entityType: "evidence_bundle",
    entityId: bundleId,
    workspaceId: validatedWorkspaceId,
    payload: updates,
    visibility: "internal",
  });

  return updated;
}
