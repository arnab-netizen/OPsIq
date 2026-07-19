/**
 * Phase 4 — Operating Memory service.
 *
 * Thin write-through aggregate over existing approval memory, DNR rules,
 * self-evaluation, and SOP records. OperatingMemoryEntry is a unified index —
 * it does NOT replace the source models; it surfaces them together.
 *
 * Unique on (workspaceId, memoryType, sourceId) — upsert semantics.
 * Workspace isolation enforced. Audit event emitted atomically.
 */

import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { ValidationError } from "@/infra/errors";
import type { Prisma } from "@/generated/prisma/client";

export type MemoryType =
  | "APPROVAL"       // source: OwnerApprovalMemory
  | "DO_NOT_REPEAT"  // source: OwnerDoNotRepeatRule
  | "SELF_EVALUATION"// source: OwnerSelfEvaluationRecord
  | "SOP"            // source: SOPDocument
  | "CONSTRAINT"     // source: ConstraintResolutionRecord
  | "RISK"           // source: BusinessRiskEntry
  | "KPI_OWNERSHIP"  // source: KPIOwnershipRecord
  | "OBJECTIVE";     // source: BusinessObjective

const VALID_MEMORY_TYPES: MemoryType[] = [
  "APPROVAL", "DO_NOT_REPEAT", "SELF_EVALUATION", "SOP", "CONSTRAINT", "RISK", "KPI_OWNERSHIP", "OBJECTIVE",
];

function validateMemoryType(t: string): asserts t is MemoryType {
  if (!VALID_MEMORY_TYPES.includes(t as MemoryType)) {
    throw new ValidationError(`Invalid memoryType: ${t}`);
  }
}

export interface UpsertMemoryEntryInput {
  workspaceId: string;
  actorId: string;
  memoryType: MemoryType;
  sourceModel: string;
  sourceId: string;
  key: string;
  summary: string;
  data?: Record<string, unknown>;
  validUntil?: Date | null;
}

export async function upsertMemoryEntry(input: UpsertMemoryEntryInput) {
  validateMemoryType(input.memoryType);

  if (input.summary.trim().length === 0) {
    throw new ValidationError("summary cannot be empty");
  }
  if (input.key.trim().length === 0) {
    throw new ValidationError("key cannot be empty");
  }

  return db.$transaction(async (tx: Prisma.TransactionClient) => {
    const entry = await tx.operatingMemoryEntry.upsert({
      where: {
        workspaceId_memoryType_sourceId: {
          workspaceId: input.workspaceId,
          memoryType: input.memoryType,
          sourceId: input.sourceId,
        },
      },
      create: {
        workspaceId: input.workspaceId,
        memoryType: input.memoryType,
        sourceModel: input.sourceModel,
        sourceId: input.sourceId,
        key: input.key.trim(),
        summary: input.summary.trim(),
        data: (input.data ?? {}) as Prisma.InputJsonValue,
        validUntil: input.validUntil ?? null,
      },
      update: {
        key: input.key.trim(),
        summary: input.summary.trim(),
        data: (input.data ?? {}) as Prisma.InputJsonValue,
        validUntil: input.validUntil ?? null,
      },
    });

    await emitAuditEvent(
      {
        eventName: AUDIT_EVENTS.OWNER_OPERATING_MEMORY_UPDATED,
        workspaceId: input.workspaceId,
        actorId: input.actorId,
        entityType: "OperatingMemoryEntry",
        entityId: entry.id,
        payload: {
          memoryType: input.memoryType,
          sourceModel: input.sourceModel,
          sourceId: input.sourceId,
          key: input.key,
        },
      },
      tx,
    );

    return entry;
  });
}

export async function getMemoryEntries(
  workspaceId: string,
  opts: { memoryType?: MemoryType; key?: string } = {},
) {
  return db.operatingMemoryEntry.findMany({
    where: {
      workspaceId,
      ...(opts.memoryType ? { memoryType: opts.memoryType } : {}),
      ...(opts.key ? { key: opts.key } : {}),
      OR: [{ validUntil: null }, { validUntil: { gt: new Date() } }],
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function expireMemoryEntry(
  workspaceId: string,
  memoryType: MemoryType,
  sourceId: string,
) {
  return db.operatingMemoryEntry.updateMany({
    where: { workspaceId, memoryType, sourceId },
    data: { validUntil: new Date() },
  });
}
