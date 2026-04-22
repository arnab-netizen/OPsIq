import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError, ValidationError } from "@/infra/errors";
import {
  EVIDENCE_CATEGORIES,
  EVIDENCE_SOURCE_TYPES,
  EVIDENCE_CAPTURE_METHODS,
  EVIDENCE_STATUSES,
  EVIDENCE_TRACEABILITY_STATUSES,
  VISIBILITY_LEVELS,
} from "@/domain/constants/statuses";
import type {
  EvidenceCategory,
  EvidenceSourceType,
  EvidenceCaptureMethod,
  EvidenceStatus,
  EvidenceTraceabilityStatus,
  VisibilityLevel,
} from "@/domain/constants/statuses";

export interface CreateEvidenceItemInput {
  engagementId: string;
  stageId?: string;
  category: EvidenceCategory;
  type: string;
  sourceType: EvidenceSourceType;
  sourceLabel: string;
  sourceOwner?: string;
  captureMethod: EvidenceCaptureMethod;
  capturedAt: string;
  statement?: string;
  visibilityClassification?: VisibilityLevel;
}

export interface UpdateEvidenceItemInput {
  statement?: string;
  validationStatus?: EvidenceStatus;
  traceabilityStatus?: EvidenceTraceabilityStatus;
  version: number;
}

export interface CreateFileBlobInput {
  storageKey: string;
  fileName: string;
  mimeType: string;
  size: number;
}

export interface CreateEvidenceBundleInput {
  engagementId: string;
  title: string;
  description?: string;
}

export async function createEvidenceItem(
  input: CreateEvidenceItemInput,
  actorId: string
): Promise<{ id: string; engagementId: string }> {
  // Validate engagement exists
  const engagement = await db.engagement.findUnique({
    where: { id: input.engagementId },
    select: { id: true },
  });
  if (!engagement) throw new NotFoundError("Engagement", input.engagementId);

  // Validate category
  if (!EVIDENCE_CATEGORIES.includes(input.category)) {
    throw new ValidationError(
      `Invalid evidence category: ${input.category}. Must be one of: ${EVIDENCE_CATEGORIES.join(", ")}`
    );
  }

  // Validate source type
  if (!EVIDENCE_SOURCE_TYPES.includes(input.sourceType)) {
    throw new ValidationError(
      `Invalid source type: ${input.sourceType}. Must be one of: ${EVIDENCE_SOURCE_TYPES.join(", ")}`
    );
  }

  // Validate capture method
  if (!EVIDENCE_CAPTURE_METHODS.includes(input.captureMethod)) {
    throw new ValidationError(
      `Invalid capture method: ${input.captureMethod}. Must be one of: ${EVIDENCE_CAPTURE_METHODS.join(", ")}`
    );
  }

  // Validate capturedAt
  const capturedAtDate = new Date(input.capturedAt);
  if (isNaN(capturedAtDate.getTime())) {
    throw new ValidationError("capturedAt must be a valid ISO 8601 date string");
  }

  const visibility = input.visibilityClassification || "internal";
  if (!VISIBILITY_LEVELS.includes(visibility)) {
    throw new ValidationError(
      `Invalid visibility classification: ${visibility}. Must be one of: ${VISIBILITY_LEVELS.join(", ")}`
    );
  }

  const evidenceItem = await db.evidenceItem.create({
    data: {
      engagementId: input.engagementId,
      stageId: input.stageId,
      category: input.category,
      type: input.type,
      sourceType: input.sourceType,
      sourceLabel: input.sourceLabel,
      sourceOwner: input.sourceOwner,
      captureMethod: input.captureMethod,
      capturedAt: capturedAtDate,
      statement: input.statement,
      visibilityClassification: visibility,
      createdBy: actorId,
    },
    select: { id: true, engagementId: true },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.EVIDENCE_ITEM_CREATED,
    actorId,
    entityType: "EvidenceItem",
    entityId: evidenceItem.id,
    payload: {
      engagementId: input.engagementId,
      category: input.category,
      sourceType: input.sourceType,
    },
  });

  return evidenceItem;
}

export async function updateEvidenceItem(
  evidenceItemId: string,
  input: UpdateEvidenceItemInput,
  actorId: string
): Promise<{ id: string }> {
  // Validate evidence item exists
  const existing = await db.evidenceItem.findUnique({
    where: { id: evidenceItemId },
    select: { id: true, version: true },
  });
  if (!existing) throw new NotFoundError("EvidenceItem", evidenceItemId);

  // Version check
  if (existing.version !== input.version) {
    throw new ValidationError(
      `Version conflict: expected ${existing.version}, got ${input.version}`
    );
  }

  // Validate status if provided
  if (input.validationStatus && !EVIDENCE_STATUSES.includes(input.validationStatus)) {
    throw new ValidationError(
      `Invalid validation status: ${input.validationStatus}. Must be one of: ${EVIDENCE_STATUSES.join(", ")}`
    );
  }

  // Validate traceability status if provided
  if (
    input.traceabilityStatus &&
    !EVIDENCE_TRACEABILITY_STATUSES.includes(input.traceabilityStatus)
  ) {
    throw new ValidationError(
      `Invalid traceability status: ${input.traceabilityStatus}. Must be one of: ${EVIDENCE_TRACEABILITY_STATUSES.join(", ")}`
    );
  }

  const updated = await db.evidenceItem.update({
    where: { id: evidenceItemId },
    data: {
      statement: input.statement,
      validationStatus: input.validationStatus,
      traceabilityStatus: input.traceabilityStatus,
      version: { increment: 1 },
    },
    select: { id: true },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.EVIDENCE_ITEM_UPDATED,
    actorId,
    entityType: "EvidenceItem",
    entityId: evidenceItemId,
    payload: {
      validationStatus: input.validationStatus,
      traceabilityStatus: input.traceabilityStatus,
    },
  });

  return { id: updated.id };
}

export async function listEvidenceForEngagement(
  engagementId: string,
  stageId?: string
): Promise<Array<{
  id: string;
  category: string;
  sourceType: string;
  sourceLabel: string;
  validationStatus: string;
  capturedAt: Date;
  createdAt: Date;
}>> {
  // Validate engagement exists
  const engagement = await db.engagement.findUnique({
    where: { id: engagementId },
    select: { id: true },
  });
  if (!engagement) throw new NotFoundError("Engagement", engagementId);

  return db.evidenceItem.findMany({
    where: {
      engagementId,
      ...(stageId && { stageId }),
    },
    select: {
      id: true,
      category: true,
      sourceType: true,
      sourceLabel: true,
      validationStatus: true,
      capturedAt: true,
      createdAt: true,
    },
    orderBy: { capturedAt: "desc" },
  });
}

export async function getEvidenceItemDetail(
  evidenceItemId: string
): Promise<{
  id: string;
  engagementId: string;
  stageId: string | null;
  category: string;
  type: string;
  sourceType: string;
  sourceLabel: string;
  sourceOwner: string | null;
  captureMethod: string;
  capturedAt: Date;
  validationStatus: string;
  traceabilityStatus: string;
  visibilityClassification: string;
  statement: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}> {
  const item = await db.evidenceItem.findUnique({
    where: { id: evidenceItemId },
    select: {
      id: true,
      engagementId: true,
      stageId: true,
      category: true,
      type: true,
      sourceType: true,
      sourceLabel: true,
      sourceOwner: true,
      captureMethod: true,
      capturedAt: true,
      validationStatus: true,
      traceabilityStatus: true,
      visibilityClassification: true,
      statement: true,
      version: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!item) throw new NotFoundError("EvidenceItem", evidenceItemId);
  return item;
}

export async function createFileBlob(
  input: CreateFileBlobInput,
  actorId: string
): Promise<{ id: string }> {
  // Validate inputs
  if (!input.storageKey || !input.fileName || !input.mimeType || input.size <= 0) {
    throw new ValidationError("Invalid file blob input");
  }

  const fileBlob = await db.fileBlob.create({
    data: {
      storageKey: input.storageKey,
      fileName: input.fileName,
      mimeType: input.mimeType,
      size: input.size,
    },
    select: { id: true },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.FILE_UPLOADED,
    actorId,
    entityType: "FileBlob",
    entityId: fileBlob.id,
    payload: {
      fileName: input.fileName,
      mimeType: input.mimeType,
      size: input.size,
    },
  });

  return fileBlob;
}

export async function linkFileToEvidenceItem(
  evidenceItemId: string,
  fileBlobId: string,
  actorId: string
): Promise<{ id: string }> {
  // Validate evidence item exists
  const item = await db.evidenceItem.findUnique({
    where: { id: evidenceItemId },
    select: { id: true },
  });
  if (!item) throw new NotFoundError("EvidenceItem", evidenceItemId);

  // Validate file blob exists
  const file = await db.fileBlob.findUnique({
    where: { id: fileBlobId },
    select: { id: true },
  });
  if (!file) throw new NotFoundError("FileBlob", fileBlobId);

  const link = await db.evidenceItemFileLink.create({
    data: {
      evidenceItemId,
      fileBlobId,
    },
    select: { id: true },
  });

  return link;
}

export async function createEvidenceBundle(
  input: CreateEvidenceBundleInput,
  actorId: string
): Promise<{ id: string; engagementId: string }> {
  // Validate engagement exists
  const engagement = await db.engagement.findUnique({
    where: { id: input.engagementId },
    select: { id: true },
  });
  if (!engagement) throw new NotFoundError("Engagement", input.engagementId);

  const bundle = await db.evidenceBundle.create({
    data: {
      engagementId: input.engagementId,
      title: input.title,
      description: input.description,
      createdBy: actorId,
    },
    select: { id: true, engagementId: true },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.EVIDENCE_BUNDLE_CREATED,
    actorId,
    entityType: "EvidenceBundle",
    entityId: bundle.id,
    payload: {
      engagementId: input.engagementId,
      title: input.title,
    },
  });

  return bundle;
}

export async function listEvidenceBundlesForEngagement(
  engagementId: string
): Promise<Array<{
  id: string;
  title: string;
  description: string | null;
  createdAt: Date;
}>> {
  // Validate engagement exists
  const engagement = await db.engagement.findUnique({
    where: { id: engagementId },
    select: { id: true },
  });
  if (!engagement) throw new NotFoundError("Engagement", engagementId);

  return db.evidenceBundle.findMany({
    where: { engagementId },
    select: {
      id: true,
      title: true,
      description: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
}
