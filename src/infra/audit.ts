import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { logger } from "@/infra/logger";
import type { AuditEventName } from "@/domain/constants/audit-events";
import { createHash } from "crypto";
import { v4 as uuidv4 } from "uuid";

export type Visibility = "internal" | "client_visible";

export interface AuditEventInput {
  eventName: AuditEventName;
  workspaceId?: string;
  actorId?: string;
  actorType?: string;
  entityType?: string;
  entityId?: string;
  payload?: Record<string, unknown>;
  correlationId?: string;
  visibility?: Visibility;
}

function computeEventHash(eventId: string, workspaceId: string, eventName: string, timestamp: Date): string {
  const hashInput = `${eventId}|${workspaceId}|${eventName}|${timestamp.toISOString()}`;
  return createHash("sha256").update(hashInput).digest("hex");
}

/**
 * Minimal Prisma-client surface used by emitAuditEvent. Both `db` and a
 * `$transaction` tx client satisfy this, so audit writes can participate in a
 * caller's transaction (AUDIT-01: atomic mutation + audit that rolls back together).
 */
export type AuditClient = Pick<Prisma.TransactionClient, "auditEvent">;

/**
 * Read-only, compile-time-typed accessor for AuditEvent. Use this instead of
 * reaching into `db.auditEvent` directly when a service needs to query audit
 * history — `db` (src/lib/db.ts) is exported as an untyped Proxy, so
 * `db.auditEvent.someMethod({ wrongField: ... })` compiles cleanly even when
 * the method is destructive or the field doesn't exist on the real schema.
 * This type has no delete/deleteMany/update/updateMany/upsert members, so a
 * future retention/cleanup-style mutation against governed audit history
 * cannot even be written through it, and every field reference used with it
 * is checked against Prisma's generated AuditEvent shape.
 *
 * Added for P0-04: a retention-cleanup path called
 * `db.auditEvent.deleteMany({ where: { createdAt: ... } })` — `createdAt`
 * does not exist on AuditEvent (only `occurredAt` does) — and the mistake
 * compiled cleanly because `db` is untyped. That delete path has been
 * removed entirely (see src/services/production/retention-cleanup.ts); this
 * accessor exists so the same class of mistake can't recur unnoticed.
 */
export type AuditEventReadOnlyClient = Pick<
  Prisma.TransactionClient["auditEvent"],
  "findFirst" | "findMany" | "findUnique" | "count"
>;

export function getAuditEventReadOnlyClient(): AuditEventReadOnlyClient {
  return (db as unknown as { auditEvent: AuditEventReadOnlyClient }).auditEvent;
}

/**
 * Administration V1 correction: a null/absent workspaceId USED to silently
 * no-op (the "fail-safe" this used to return a sentinel for) — meaning
 * BETA_REQUEST_CREATED, PLATFORM_*_CHANGED, and every other genuinely
 * pre-workspace/platform event never persisted an audit_event row at all.
 *
 * Investigated before changing this (see PR description): the existing
 * workspace-scoped hash chain has NO concurrency protection today — the
 * `findFirst`-then-`create` read-write below is not lock-protected, so two
 * concurrent writers to the SAME workspace can already fork it. Extending
 * that same unlocked chain-lookup pattern to a single GLOBAL null-workspace
 * chain would pool contention across every anonymous pre-account flow
 * platform-wide (far worse than one workspace's traffic) and would braid
 * together causally-unrelated events from unrelated actors into one
 * meaningless "chain."
 *
 * So pre-workspace events are instead persisted as durable, independently
 * timestamped, EXPLICITLY UNCHAINED rows: `workspaceId: null`,
 * `previousHash: null` always, no previous-event lookup at all (no shared
 * mutable pointer exists to race on, so the fork risk above cannot occur for
 * these rows). This makes NO hash-chain / tamper-evidence claim for these
 * events — they are ordinary durable audit rows, not a verified chain.
 * `verifyAuditChainIntegrity` is never called with a null workspaceId and
 * does not cover them (see its own doc comment). The pre-existing
 * concurrency gap in the workspace-scoped chain above is unrelated to this
 * fix and is tracked separately, not fixed by this change (see PR
 * description "known limitations" — a full audit-subsystem redesign is out
 * of scope for Administration V1).
 */
async function createUnchainedPlatformEvent(c: AuditClient, input: AuditEventInput): Promise<string> {
  const eventId = uuidv4();
  const event = await c.auditEvent.create({
    data: {
      id: eventId,
      workspaceId: null,
      eventName: input.eventName,
      actorId: input.actorId ?? null,
      actorType: input.actorType ?? "user",
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      payload: input.payload
        ? (input.payload as Prisma.InputJsonValue)
        : Prisma.DbNull,
      correlationId: input.correlationId ?? null,
      visibility: input.visibility ?? "internal",
      previousHash: null,
    },
  });
  logger.info("Pre-workspace/platform audit event persisted (durable, explicitly unchained)", {
    eventName: input.eventName,
    entityType: input.entityType,
    entityId: input.entityId,
    auditEventId: event.id,
  });
  return event.id;
}

export async function emitAuditEvent(
  input: AuditEventInput,
  client?: AuditClient,
): Promise<string> {
  // Typed explicitly (rather than left to inference) so every `c.auditEvent.*`
  // call below is checked against Prisma's generated AuditEvent shape even
  // when no transaction client is passed in and `client ?? db` would
  // otherwise collapse to `any` (db.ts's `db` export is an untyped Proxy).
  const c: AuditClient = client ?? (db as unknown as AuditClient);
  if (!input.workspaceId) {
    return createUnchainedPlatformEvent(c, input);
  }

  // Fetch the last audit event for this workspace to chain hashes.
  // Fetch eventName and occurredAt so the hash binds to actual event content
  // (using only the eventId twice was incorrect — fixed here).
  const lastEvent = await c.auditEvent.findFirst({
    where: { workspaceId: input.workspaceId },
    orderBy: { occurredAt: "desc" },
    select: { id: true, previousHash: true, eventName: true, occurredAt: true },
  });

  const eventId = uuidv4();
  const event = await c.auditEvent.create({
    data: {
      id: eventId,
      workspaceId: input.workspaceId,
      eventName: input.eventName,
      actorId: input.actorId ?? null,
      actorType: input.actorType ?? "user",
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      payload: input.payload
        ? (input.payload as Prisma.InputJsonValue)
        : Prisma.DbNull,
      correlationId: input.correlationId ?? null,
      visibility: input.visibility ?? "internal",
      previousHash: lastEvent
        ? computeEventHash(lastEvent.id, input.workspaceId, lastEvent.eventName, lastEvent.occurredAt)
        : null,
    },
  });

  logger.info("Audit event emitted with hash chain", {
    eventName: input.eventName,
    entityType: input.entityType,
    entityId: input.entityId,
    auditEventId: event.id,
    hashChainLinked: !!lastEvent,
  });

  return event.id;
}

/**
 * `workspaceId` is REQUIRED and explicit, not optional — a caller must
 * choose one of two distinct query modes, never get both silently merged:
 *   - a real workspace id: the normal, hash-chained, workspace-scoped query.
 *   - `null`: pre-workspace/platform events only (see
 *     createUnchainedPlatformEvent's doc comment) — these carry no chain, so
 *     `queryAuditEvents(null, ...)` results should never be presented to a
 *     reader as tamper-evident/verified, only as durable records.
 */
export async function queryAuditEvents(filter: {
  workspaceId: string | null;
  entityType?: string;
  entityId?: string;
  eventName?: string;
  actorId?: string;
  from?: Date;
  to?: Date;
  visibility?: Visibility;
  limit?: number;
  offset?: number;
}) {
  return db.auditEvent.findMany({
    where: {
      workspaceId: filter.workspaceId,
      ...(filter.entityType && { entityType: filter.entityType }),
      ...(filter.entityId && { entityId: filter.entityId }),
      ...(filter.eventName && { eventName: filter.eventName }),
      ...(filter.actorId && { actorId: filter.actorId }),
      ...(filter.visibility && { visibility: filter.visibility }),
      ...(filter.from || filter.to
        ? {
            occurredAt: {
              ...(filter.from && { gte: filter.from }),
              ...(filter.to && { lte: filter.to }),
            },
          }
        : {}),
    },
    orderBy: { occurredAt: "desc" },
    take: Math.min(filter.limit ?? 50, 100),
    skip: filter.offset ?? 0,
  });
}

/**
 * Verifies the hash chain for ONE workspace's scoped events only. Never call
 * this with a null/pre-workspace scope: those events are deliberately
 * unchained (no previousHash chain exists for them to verify) — see
 * createUnchainedPlatformEvent's doc comment in this file. `workspaceId`
 * here is intentionally required as a non-null `string`, not widened
 * alongside queryAuditEvents, to keep that constraint enforced at the type
 * level.
 */
export async function verifyAuditChainIntegrity(
  workspaceId: string,
  opts: { since?: Date } = {}
): Promise<{ isValid: boolean; tamperedAt?: number; eventsChecked: number }> {
  const events = await db.auditEvent.findMany({
    where: {
      workspaceId,
      ...(opts.since ? { occurredAt: { gte: opts.since } } : {}),
    },
    orderBy: { occurredAt: "asc" },
    // Fetch eventName and occurredAt so hash recomputation uses the same inputs
    // that were used when the chain was written. Using `new Date()` at verify
    // time was non-deterministic and always-failing — fixed here.
    select: { id: true, previousHash: true, eventName: true, occurredAt: true },
  });

  for (let i = 1; i < events.length; i++) {
    const currentEvent = events[i];
    const previousEvent = events[i - 1];
    const expectedHash = computeEventHash(
      previousEvent.id,
      workspaceId,
      previousEvent.eventName,
      previousEvent.occurredAt
    );

    if (currentEvent.previousHash !== expectedHash) {
      return { isValid: false, tamperedAt: i, eventsChecked: i };
    }
  }

  return { isValid: true, eventsChecked: Math.max(0, events.length - 1) };
}
