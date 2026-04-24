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

// ─── Types ─────────────────────────────────────────────────────────────────

export interface CreateEvidenceInput {
  engagementId: string;
  title: string;
  description?: string;
  evidenceType: "document" | "interview" | "metric" | "observation";
  sourceReference?: string;
  severity?: "low" | "medium" | "high" | "critical";
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
}

// ─── Service ───────────────────────────────────────────────────────────────

export async function createEvidence(
  input: CreateEvidenceInput,
  actorId: string
): Promise<{ id: string }> {
  // Validate engagement exists
  const engagement = await db.engagement.findUnique({
    where: { id: input.engagementId },
  });
  if (!engagement) throw new NotFoundError("Engagement", input.engagementId);

  // Validate evidence type
  const validTypes = ["document", "interview", "metric", "observation"];
  if (!validTypes.includes(input.evidenceType)) {
    throw new ValidationError(
      `Invalid evidence type: ${input.evidenceType}. Must be one of: ${validTypes.join(", ")}`
    );
  }

  const idempotencyKey = `evidence-create:${input.engagementId}:${input.title}:${actorId}`;

  const result = await withIdempotency(
    idempotencyKey,
    "evidence.create",
    async () => {
      // Determine visibility based on evidence type
      const visibility = input.evidenceType === "document" ? "client_visible" : "internal";

      const evidence = await db.evidence.create({
        data: {
          engagementId: input.engagementId,
          title: input.title,
          description: input.description ?? null,
          evidenceType: input.evidenceType,
          sourceReference: input.sourceReference ?? null,
          severity: input.severity ?? null,
          submittedBy: actorId,
          status: "submitted",
          visibility,
        },
      });
      return { id: evidence.id };
    }
  );

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.EVIDENCE_SUBMITTED,
    actorId,
    entityType: "evidence",
    entityId: result.result.id,
    payload: {
      engagementId: input.engagementId,
      evidenceType: input.evidenceType,
      title: input.title,
    },
    visibility: "internal",
  });

  // Trigger re-evaluation due to new evidence
  await triggerReEvaluation({
    changeType: "new_critical_evidence",
    entityType: "evidence",
    entityId: result.result.id,
    engagementId: input.engagementId,
    severity: (input.severity ?? "medium") as "low" | "medium" | "high" | "critical",
    description: `Evidence submitted: ${input.title}`,
    triggeredBy: actorId,
  });

  logger.info("Evidence created", {
    evidenceId: result.result.id,
    engagementId: input.engagementId,
  });

  return { id: result.result.id };
}

export async function updateEvidence(
  evidenceId: string,
  input: UpdateEvidenceInput,
  actorId: string
): Promise<void> {
  const evidence = await db.evidence.findUnique({
    where: { id: evidenceId },
  });
  if (!evidence) throw new NotFoundError("Evidence", evidenceId);

  // Cannot update validated or rejected evidence
  if (evidence.status === "validated" || evidence.status === "rejected") {
    throw new ValidationError(
      `Cannot update evidence with status: ${evidence.status}`
    );
  }

  const { version, ...fields } = input;
  const data: Record<string, unknown> = {};

  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    data[k] = v;
  }

  const statusChanged = input.status && input.status !== evidence.status;

  await optimisticUpdate("evidence", evidenceId, version, () =>
    db.evidence.update({
      where: withVersionCheck({ id: evidenceId }, version),
      data: withVersionIncrement(data),
    })
  );

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.EVIDENCE_SUBMITTED,
    actorId,
    entityType: "evidence",
    entityId: evidenceId,
    payload: data,
    visibility: "internal",
  });

  if (statusChanged && input.status === "validated") {
    await emitAuditEvent({
      eventName: AUDIT_EVENTS.EVIDENCE_VALIDATED,
      actorId,
      entityType: "evidence",
      entityId: evidenceId,
      payload: { previousStatus: evidence.status },
      visibility: "internal",
    });
  } else if (statusChanged && input.status === "rejected") {
    await emitAuditEvent({
      eventName: AUDIT_EVENTS.EVIDENCE_REJECTED,
      actorId,
      entityType: "evidence",
      entityId: evidenceId,
      payload: { previousStatus: evidence.status, reason: input.rejectionReason },
      visibility: "internal",
    });
  }

  logger.info("Evidence updated", { evidenceId });
}

export async function getEvidenceById(
  evidenceId: string,
  userIdOrVisibility?: string
) {
  // Detect if param is visibility or userId
  let userId: string | undefined;
  let visibility: "internal" | "client_visible" | "all" | undefined;

  if (userIdOrVisibility && ["internal", "client_visible", "all"].includes(userIdOrVisibility)) {
    visibility = userIdOrVisibility as "internal" | "client_visible" | "all";
  } else {
    userId = userIdOrVisibility;
  }

  const evidence = await db.evidence.findUnique({
    where: { id: evidenceId },
  });

  if (!evidence) throw new NotFoundError("Evidence", evidenceId);

  // Check visibility if visibility filter is provided
  if (visibility === "client_visible" && evidence.visibility === "internal") {
    throw new NotFoundError("Evidence", evidenceId);
  }

  // Check engagement access if userId provided
  if (userId) {
    await assertEngagementAccess(userId, evidence.engagementId);
  }

  const fullEvidence = await db.evidence.findUnique({
    where: { id: evidenceId },
    include: {
      engagement: { select: { id: true, code: true, title: true } },
      submitter: { select: { id: true, name: true, email: true } },
      validator: { select: { id: true, name: true, email: true } },
    },
  });

  if (!fullEvidence) throw new NotFoundError("Evidence", evidenceId);
  return fullEvidence;
}

export async function listEvidence(
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

  // Check engagement access if engagementId provided
  if (engagementId && userId) {
    await assertEngagementAccess(userId, engagementId);
  }

  const where = {
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
  actorId?: string
) {
  // Handle both function signatures for backward compatibility
  const evidenceId = typeof input === "string" ? input : input.evidenceItemId;
  const actor = typeof input === "string" ? actorId : actorId;

  if (!actor) throw new Error("actorId is required");

  const evidence = await db.evidence.findUnique({
    where: { id: evidenceId },
  });
  if (!evidence) throw new NotFoundError("Evidence", evidenceId);

  if (evidence.status === "validated") {
    throw new ValidationError("Evidence is already validated");
  }

  const updated = await db.evidence.update({
    where: { id: evidenceId },
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
  actorId: string
) {
  const engagement = await db.engagement.findUnique({
    where: { id: input.engagementId },
  });
  if (!engagement) throw new NotFoundError("Engagement", input.engagementId);

  const bundle = await db.evidenceBundle.create({
    data: {
      engagementId: input.engagementId,
      title: input.title,
      description: input.description ?? null,
      createdBy: actorId,
    },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.EVIDENCE_BUNDLE_CREATED,
    actorId,
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

export async function getEvidenceBundleById(bundleId: string) {
  const bundle = await db.evidenceBundle.findUnique({
    where: { id: bundleId },
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

export async function listEvidenceBundles(engagementId: string) {
  return db.evidenceBundle.findMany({
    where: { engagementId, status: "active" },
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
  actorId: string
) {
  const bundle = await db.evidenceBundle.findUnique({
    where: { id: input.bundleId },
  });
  if (!bundle) throw new NotFoundError("EvidenceBundle", input.bundleId);

  const evidence = await db.evidence.findUnique({
    where: { id: input.evidenceItemId },
  });
  if (!evidence) throw new NotFoundError("Evidence", input.evidenceItemId);

  const existing = await db.evidenceBundleItem.findFirst({
    where: {
      bundleId: input.bundleId,
      evidenceId: input.evidenceItemId,
      removedAt: null,
    },
  });
  if (existing) {
    throw new ValidationError("Evidence is already in this bundle");
  }

  const item = await db.evidenceBundleItem.create({
    data: {
      bundleId: input.bundleId,
      evidenceId: input.evidenceItemId,
      addedBy: actorId,
    },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.EVIDENCE_BUNDLE_ITEM_ADDED,
    actorId,
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
  actorId: string
) {
  const item = await db.evidenceBundleItem.findFirst({
    where: {
      bundleId: input.bundleId,
      evidenceId: input.evidenceItemId,
    },
  });
  if (!item) throw new NotFoundError("EvidenceBundleItem", "notfound");

  if (item.removedAt !== null) {
    throw new ValidationError("Item is already removed from bundle");
  }

  const updated = await db.evidenceBundleItem.update({
    where: { id: item.id },
    data: { removedAt: new Date() },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.EVIDENCE_BUNDLE_ITEM_REMOVED,
    actorId,
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
  actorId: string
) {
  const bundle = await db.evidenceBundle.findUnique({
    where: { id: bundleId },
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
    where: { id: bundleId },
    data: updates,
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.EVIDENCE_BUNDLE_UPDATED,
    actorId,
    entityType: "evidence_bundle",
    entityId: bundleId,
    payload: updates,
    visibility: "internal",
  });

  return updated;
}
