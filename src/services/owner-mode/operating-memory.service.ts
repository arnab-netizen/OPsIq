/**
 * Phase 4 — Operating Memory service.
 *
 * Append-only versioned index over all memory sources (approval, DNR, learning,
 * SOP, constraint, risk, KPI ownership, objective). Each write creates a new
 * version; the prior version is superseded (its supersededById is set, createdAt
 * preserved, supersededAt stamped). Queries return only current (non-superseded)
 * entries unless historyMode is requested.
 *
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

export interface WriteMemoryEntryInput {
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

/**
 * Write a new version of an operating memory entry (append-only).
 * The previous version is superseded atomically within the same transaction.
 * Returns the new entry.
 */
export async function writeMemoryEntry(input: WriteMemoryEntryInput) {
  validateMemoryType(input.memoryType);

  if (input.summary.trim().length === 0) {
    throw new ValidationError("summary cannot be empty");
  }
  if (input.key.trim().length === 0) {
    throw new ValidationError("key cannot be empty");
  }

  return db.$transaction(async (tx: Prisma.TransactionClient) => {
    // Find current (non-superseded) entry for this source, if any
    const existing = await tx.operatingMemoryEntry.findFirst({
      where: {
        workspaceId: input.workspaceId,
        memoryType: input.memoryType,
        sourceId: input.sourceId,
        supersededById: null,
      },
      orderBy: { version: "desc" },
    });

    const nextVersion = existing ? existing.version + 1 : 1;

    // Create new versioned entry
    const newEntry = await tx.operatingMemoryEntry.create({
      data: {
        workspaceId: input.workspaceId,
        memoryType: input.memoryType,
        sourceModel: input.sourceModel,
        sourceId: input.sourceId,
        version: nextVersion,
        key: input.key.trim(),
        summary: input.summary.trim(),
        data: (input.data ?? {}) as Prisma.InputJsonValue,
        validUntil: input.validUntil ?? null,
      },
    });

    // Supersede the previous version (if any)
    if (existing) {
      await tx.operatingMemoryEntry.update({
        where: { id: existing.id },
        data: {
          supersededById: newEntry.id,
          supersededAt: new Date(),
        },
      });
    }

    await emitAuditEvent(
      {
        eventName: AUDIT_EVENTS.OWNER_OPERATING_MEMORY_UPDATED,
        workspaceId: input.workspaceId,
        actorId: input.actorId,
        entityType: "OperatingMemoryEntry",
        entityId: newEntry.id,
        payload: {
          memoryType: input.memoryType,
          sourceModel: input.sourceModel,
          sourceId: input.sourceId,
          version: nextVersion,
          key: input.key,
          supersededPrior: existing?.id ?? null,
        },
      },
      tx,
    );

    return newEntry;
  });
}

/** Backward-compatible alias for write. */
export const upsertMemoryEntry = writeMemoryEntry;

/**
 * Get current (non-superseded) operating memory entries.
 * Filters out expired entries (validUntil in the past).
 */
export async function getMemoryEntries(
  workspaceId: string,
  opts: { memoryType?: MemoryType; key?: string } = {},
) {
  return db.operatingMemoryEntry.findMany({
    where: {
      workspaceId,
      supersededById: null, // current version only
      ...(opts.memoryType ? { memoryType: opts.memoryType } : {}),
      ...(opts.key ? { key: opts.key } : {}),
      OR: [{ validUntil: null }, { validUntil: { gt: new Date() } }],
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Get the full version history for a specific source record.
 * Returns all versions in ascending version order.
 */
export async function getMemoryHistory(
  workspaceId: string,
  memoryType: MemoryType,
  sourceId: string,
) {
  return db.operatingMemoryEntry.findMany({
    where: { workspaceId, memoryType, sourceId },
    orderBy: { version: "asc" },
  });
}

/**
 * Expire the current version of a memory entry (marks it invalid without creating a new version).
 * Used when the source record is deleted or invalidated.
 */
export async function expireMemoryEntry(
  workspaceId: string,
  memoryType: MemoryType,
  sourceId: string,
) {
  return db.operatingMemoryEntry.updateMany({
    where: {
      workspaceId,
      memoryType,
      sourceId,
      supersededById: null,
      validUntil: null, // only expire if not already time-limited
    },
    data: { validUntil: new Date() },
  });
}
