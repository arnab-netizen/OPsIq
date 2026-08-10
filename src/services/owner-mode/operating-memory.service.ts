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
import type { Prisma } from "@/generated/prisma/client";

// Documented well-known values (stored as plain strings in the DB; any string is accepted):
// APPROVAL | DO_NOT_REPEAT | SELF_EVALUATION | SOP | CONSTRAINT | RISK | KPI_OWNERSHIP | OBJECTIVE
export type MemoryType = string;

export interface WriteMemoryEntryInput {
  workspaceId: string;
  actorId: string;
  memoryType: string;
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
 *
 * Pass outerTx when called inside an existing db.$transaction to avoid nested
 * transaction contention (P2028). Without it a new transaction is opened, which
 * competes for a DB connection and fails when the pool is exhausted by the caller.
 */
export async function writeMemoryEntry(
  input: WriteMemoryEntryInput,
  outerTx?: Prisma.TransactionClient,
) {
  const run = async (tx: Prisma.TransactionClient) => {
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
  };

  if (outerTx) {
    return run(outerTx);
  }
  return db.$transaction(run, { timeout: 30000, maxWait: 10000 });
}

/** Backward-compatible alias for write. */
export const upsertMemoryEntry = writeMemoryEntry;

/**
 * Get current (non-superseded) operating memory entries.
 * Filters out expired entries (validUntil in the past).
 */
export async function getMemoryEntries(
  workspaceId: string,
  opts: { memoryType?: string; key?: string } = {},
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
  memoryType: string,
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
  memoryType: string,
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
