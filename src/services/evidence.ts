import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { withIdempotency } from "@/infra/idempotency";
import {
  NotFoundError,
  ValidationError,
  ConflictError,
  PolicyViolationError,
} from "@/infra/errors";
import {
  optimisticUpdate,
  withVersionCheck,
  withVersionIncrement,
} from "@/lib/optimistic-lock";
import { logger } from "@/infra/logger";
import type {
  CreateEvidenceItemInput,
  UploadFileEvidenceInput,
  ValidateEvidenceInput,
  ListEvidenceParams,
  CreateEvidenceBundleInput,
  UpdateEvidenceBundleInput,
  AddEvidenceToBundleInput,
  RemoveEvidenceFromBundleInput,
} from "@/domain/validation/evidence";

// ─── Helpers ──────────────────────────────────────────────────────────────

async function validateEngagementExists(engagementId: string): Promise<void> {
  const engagement = await db.engagement.findUnique({
    where: { id: engagementId },
    select: { id: true, status: true },
  });

  if (!engagement) {
    throw new NotFoundError("Engagement", engagementId);
  }

  if (engagement.status === "cancelled" || engagement.status === "completed") {
    throw new ValidationError(
      "Cannot submit evidence for a closed engagement"
    );
  }
}

async function validateSourceContactExists(
  sourceContactId: string
): Promise<void> {
  const contact = await db.clientContact.findUnique({
    where: { id: sourceContactId },
    select: { id: true, isActive: true },
  });

  if (!contact) {
    throw new NotFoundError("ClientContact", sourceContactId);
  }

  if (!contact.isActive) {
    throw new ValidationError("Cannot reference an inactive contact as source");
  }
}

// ─── Evidence Item Operations ──────────────────────────────────────────────

export async function createEvidenceItem(
  input: CreateEvidenceItemInput,
  actorId: string
): Promise<{ id: string }> {
  // Validate engagement
  await validateEngagementExists(input.engagementId);

  // Enforce rule: sourceContactId required when sourceType is PERSON
  if (input.sourceType === "PERSON" && !input.sourceContactId) {
    throw new PolicyViolationError(
      "EVIDENCE_SOURCE_POLICY",
      "sourceContactId is required when sourceType is PERSON"
    );
  }

  // Validate source contact if provided
  if (input.sourceContactId) {
    await validateSourceContactExists(input.sourceContactId);
  }

  // Enforce rule: FREE_TEXT evidence requires content
  if (input.evidenceType === "FREE_TEXT" && !input.content) {
    throw new ValidationError("FREE_TEXT evidence must include content");
  }

  const idempotencyKey = `evidence-create:${input.engagementId}:${input.title}:${actorId}`;

  const result = await withIdempotency(
    idempotencyKey,
    "evidence_item.create",
    async () => {
      const item = await db.evidenceItem.create({
        data: {
          engagementId: input.engagementId,
          category: input.category as any,
          evidenceType: input.evidenceType as any,
          sourceType: input.sourceType as any,
          sourceLabel: input.sourceLabel,
          sourceContactId: input.sourceContactId ?? null,
          captureMethod: input.captureMethod as any,
          title: input.title,
          description: input.description ?? null,
          content: input.content ?? null,
          traceabilityStatus: input.traceabilityStatus as any,
          visibility: input.visibility as any,
          createdBy: actorId,
          capturedAt: new Date(),
        },
      });
      return { id: item.id };
    }
  );

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.EVIDENCE_SUBMITTED,
    actorId,
    entityType: "evidence_item",
    entityId: result.result.id,
    payload: {
      engagementId: input.engagementId,
      category: input.category,
      evidenceType: input.evidenceType,
      sourceType: input.sourceType,
      title: input.title,
      visibility: input.visibility,
    },
    visibility: "internal",
  });

  logger.info("Evidence item created", {
    evidenceId: result.result.id,
    engagementId: input.engagementId,
    category: input.category,
  });

  return { id: result.result.id };
}

export async function uploadFileEvidence(
  input: UploadFileEvidenceInput,
  storageKey: string,
  actorId: string
): Promise<{ id: string }> {
  // Validate engagement
  await validateEngagementExists(input.engagementId);

  // Enforce rule: sourceContactId required when sourceType is PERSON
  if (input.sourceType === "PERSON" && !input.sourceContactId) {
    throw new PolicyViolationError(
      "EVIDENCE_SOURCE_POLICY",
      "sourceContactId is required when sourceType is PERSON"
    );
  }

  // Validate source contact if provided
  if (input.sourceContactId) {
    await validateSourceContactExists(input.sourceContactId);
  }

  const idempotencyKey = `file-evidence-create:${input.engagementId}:${input.fileName}:${actorId}`;

  const result = await withIdempotency(
    idempotencyKey,
    "file_evidence.create",
    async () => {
      // Create evidence item
      const item = await db.evidenceItem.create({
        data: {
          engagementId: input.engagementId,
          category: input.category as any,
          evidenceType: input.evidenceType as any,
          sourceType: input.sourceType as any,
          sourceLabel: input.sourceLabel,
          sourceContactId: input.sourceContactId ?? null,
          captureMethod: input.captureMethod as any,
          title: input.title,
          description: input.description ?? null,
          traceabilityStatus: input.traceabilityStatus as any,
          visibility: input.visibility as any,
          createdBy: actorId,
          capturedAt: new Date(),
          fileBlob: {
            create: {
              fileName: input.fileName,
              mimeType: input.mimeType,
              sizeBytes: BigInt(input.sizeBytes),
              storageKey,
              createdBy: actorId,
            },
          },
        },
      });

      return { id: item.id };
    }
  );

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.FILE_UPLOADED,
    actorId,
    entityType: "evidence_item",
    entityId: result.result.id,
    payload: {
      engagementId: input.engagementId,
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      category: input.category,
      evidenceType: input.evidenceType,
      visibility: input.visibility,
    },
    visibility: "internal",
  });

  logger.info("File evidence created", {
    evidenceId: result.result.id,
    engagementId: input.engagementId,
    fileName: input.fileName,
  });

  return { id: result.result.id };
}

export async function validateEvidence(
  input: ValidateEvidenceInput,
  actorId: string
): Promise<void> {
  const evidence = await db.evidenceItem.findUnique({
    where: { id: input.evidenceItemId },
  });

  if (!evidence) {
    throw new NotFoundError("EvidenceItem", input.evidenceItemId);
  }

  if (evidence.version !== input.version) {
    throw new ConflictError(
      "Evidence item has been modified since retrieval",
      {
        expectedVersion: input.version,
        currentVersion: evidence.version,
      }
    );
  }

  const newStatus = input.isValid ? "VALIDATED" : "INVALID";

  await optimisticUpdate("evidence_item", input.evidenceItemId, input.version, () =>
    db.evidenceItem.update({
      where: withVersionCheck({ id: input.evidenceItemId }, input.version),
      data: withVersionIncrement({
        validationStatus: newStatus,
      }),
    })
  );

  const eventName = input.isValid
    ? AUDIT_EVENTS.EVIDENCE_VALIDATED
    : AUDIT_EVENTS.EVIDENCE_REJECTED;

  await emitAuditEvent({
    eventName,
    actorId,
    entityType: "evidence_item",
    entityId: input.evidenceItemId,
    payload: { validationStatus: newStatus },
    visibility: "internal",
  });

  logger.info("Evidence validation updated", {
    evidenceId: input.evidenceItemId,
    status: newStatus,
  });
}

export async function getEvidenceById(evidenceItemId: string) {
  const evidence = await db.evidenceItem.findUnique({
    where: { id: evidenceItemId },
    include: {
      fileBlob: true,
      sourceContact: { select: { id: true, name: true, role: true } },
      bundleItems: {
        select: { bundleId: true },
      },
    },
  });

  if (!evidence) {
    throw new NotFoundError("EvidenceItem", evidenceItemId);
  }

  return evidence;
}

export async function listEvidenceForEngagement(params: ListEvidenceParams) {
  const {
    engagementId,
    category,
    validationStatus,
    visibility,
    limit = 25,
    offset = 0,
  } = params;

  // Validate engagement exists
  await validateEngagementExists(engagementId);

  const where: Record<string, unknown> = {
    engagementId,
  };
  if (category) where.category = category;
  if (validationStatus) where.validationStatus = validationStatus;
  if (visibility) where.visibility = visibility;

  const [items, total] = await Promise.all([
    db.evidenceItem.findMany({
      where: where as any,
      select: {
        id: true,
        category: true,
        evidenceType: true,
        sourceType: true,
        sourceLabel: true,
        title: true,
        validationStatus: true,
        visibility: true,
        capturedAt: true,
        createdAt: true,
        _count: { select: { bundleItems: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    db.evidenceItem.count({ where: where as any }),
  ]);

  return { items, total, limit, offset };
}

// ─── Evidence Bundle Operations ────────────────────────────────────────────

export async function createEvidenceBundle(
  input: CreateEvidenceBundleInput,
  actorId: string
): Promise<{ id: string }> {
  // Validate engagement
  await validateEngagementExists(input.engagementId);

  const idempotencyKey = `bundle-create:${input.engagementId}:${input.title}:${actorId}`;

  const result = await withIdempotency(
    idempotencyKey,
    "evidence_bundle.create",
    async () => {
      const bundle = await db.evidenceBundle.create({
        data: {
          engagementId: input.engagementId,
          title: input.title,
          description: input.description ?? null,
          createdBy: actorId,
        },
      });
      return { id: bundle.id };
    }
  );

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.EVIDENCE_BUNDLE_CREATED,
    actorId,
    entityType: "evidence_bundle",
    entityId: result.result.id,
    payload: {
      engagementId: input.engagementId,
      title: input.title,
    },
    visibility: "internal",
  });

  logger.info("Evidence bundle created", {
    bundleId: result.result.id,
    engagementId: input.engagementId,
  });

  return { id: result.result.id };
}

export async function updateEvidenceBundle(
  bundleId: string,
  input: UpdateEvidenceBundleInput,
  actorId: string
): Promise<void> {
  const bundle = await db.evidenceBundle.findUnique({
    where: { id: bundleId },
  });

  if (!bundle) {
    throw new NotFoundError("EvidenceBundle", bundleId);
  }

  if (bundle.version !== input.version) {
    throw new ConflictError(
      "Evidence bundle has been modified since retrieval",
      {
        expectedVersion: input.version,
        currentVersion: bundle.version,
      }
    );
  }

  const data: Record<string, unknown> = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.description !== undefined) data.description = input.description;
  if (input.status !== undefined) data.status = input.status;

  await optimisticUpdate("evidence_bundle", bundleId, input.version, () =>
    db.evidenceBundle.update({
      where: withVersionCheck({ id: bundleId }, input.version),
      data: withVersionIncrement(data),
    })
  );

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.EVIDENCE_BUNDLE_UPDATED,
    actorId,
    entityType: "evidence_bundle",
    entityId: bundleId,
    payload: data,
    visibility: "internal",
  });

  logger.info("Evidence bundle updated", { bundleId });
}

export async function addEvidenceToBundle(
  input: AddEvidenceToBundleInput,
  actorId: string
): Promise<void> {
  // Validate bundle exists
  const bundle = await db.evidenceBundle.findUnique({
    where: { id: input.bundleId },
  });

  if (!bundle) {
    throw new NotFoundError("EvidenceBundle", input.bundleId);
  }

  // Validate evidence exists and belongs to same engagement
  const evidence = await db.evidenceItem.findUnique({
    where: { id: input.evidenceItemId },
    select: { engagementId: true },
  });

  if (!evidence) {
    throw new NotFoundError("EvidenceItem", input.evidenceItemId);
  }

  if (evidence.engagementId !== bundle.engagementId) {
    throw new ValidationError(
      "Evidence and bundle must belong to the same engagement"
    );
  }

  // Check if already in bundle
  const existing = await db.evidenceBundleItem.findUnique({
    where: {
      bundleId_evidenceItemId: {
        bundleId: input.bundleId,
        evidenceItemId: input.evidenceItemId,
      },
    },
  });

  if (existing && !existing.removedAt) {
    throw new ConflictError(
      "Evidence is already in this bundle"
    );
  }

  if (existing && existing.removedAt) {
    // Re-add if previously removed
    await db.evidenceBundleItem.update({
      where: {
        id: existing.id,
      },
      data: {
        removedAt: null,
        addedAt: new Date(),
        addedBy: actorId,
      },
    });
  } else {
    // Create new membership
    await db.evidenceBundleItem.create({
      data: {
        bundleId: input.bundleId,
        evidenceItemId: input.evidenceItemId,
        addedBy: actorId,
      },
    });
  }

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.EVIDENCE_BUNDLE_ITEM_ADDED,
    actorId,
    entityType: "evidence_bundle",
    entityId: input.bundleId,
    payload: {
      evidenceItemId: input.evidenceItemId,
    },
    visibility: "internal",
  });

  logger.info("Evidence added to bundle", {
    bundleId: input.bundleId,
    evidenceItemId: input.evidenceItemId,
  });
}

export async function removeEvidenceFromBundle(
  input: RemoveEvidenceFromBundleInput,
  actorId: string
): Promise<void> {
  // Validate membership exists
  const bundleItem = await db.evidenceBundleItem.findUnique({
    where: {
      bundleId_evidenceItemId: {
        bundleId: input.bundleId,
        evidenceItemId: input.evidenceItemId,
      },
    },
  });

  if (!bundleItem) {
    throw new NotFoundError(
      "EvidenceBundleItem",
      `${input.bundleId}:${input.evidenceItemId}`
    );
  }

  if (bundleItem.removedAt) {
    throw new ValidationError("Evidence is already removed from this bundle");
  }

  // Soft delete
  await db.evidenceBundleItem.update({
    where: { id: bundleItem.id },
    data: { removedAt: new Date() },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.EVIDENCE_BUNDLE_ITEM_REMOVED,
    actorId,
    entityType: "evidence_bundle",
    entityId: input.bundleId,
    payload: {
      evidenceItemId: input.evidenceItemId,
    },
    visibility: "internal",
  });

  logger.info("Evidence removed from bundle", {
    bundleId: input.bundleId,
    evidenceItemId: input.evidenceItemId,
  });
}

export async function getEvidenceBundleById(bundleId: string) {
  const bundle = await db.evidenceBundle.findUnique({
    where: { id: bundleId },
    include: {
      items: {
        where: { removedAt: null },
        include: {
          evidenceItem: {
            select: {
              id: true,
              title: true,
              category: true,
              validationStatus: true,
              visibility: true,
            },
          },
        },
      },
      _count: { select: { items: { where: { removedAt: null } } } },
    },
  });

  if (!bundle) {
    throw new NotFoundError("EvidenceBundle", bundleId);
  }

  return bundle;
}

export async function listEvidenceBundles(engagementId: string) {
  // Validate engagement exists
  await validateEngagementExists(engagementId);

  const bundles = await db.evidenceBundle.findMany({
    where: {
      engagementId,
      status: "active",
    },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      createdAt: true,
      _count: { select: { items: { where: { removedAt: null } } } },
    },
    orderBy: { createdAt: "desc" },
  });

  return bundles;
}
