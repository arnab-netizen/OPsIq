/**
 * QuickBooks Online — READ-ONLY sync persistence: lease, runs, provider mirror records, report observations, webhook ledger.
 *
 * This is (with qbo-connection.service.ts) one of the ONLY two QuickBooks modules allowed to touch the database. It
 * performs NO provider calls and handles NO token material; the sync orchestrator (qbo-sync.service.ts) decides what to
 * read and calls these functions with already-normalized data.
 *
 * Concurrency model — one active lease per connection
 *  - qbo_sync_states carries (leaseToken, leaseRunId, leaseExpiresAt, leaseEpoch). Acquisition is ONE conditional
 *    UPDATE (`lease_token IS NULL OR lease_expires_at <= now`): two concurrent callers cannot both win and the loser
 *    gets a typed BUSY result — nothing runs concurrently.
 *  - Every write a worker performs for a run happens in a transaction whose FIRST statement re-verifies and extends the
 *    lease (token + epoch + not expired). A worker whose lease expired and was taken over ("stale worker") therefore
 *    fails closed with LeaseLostError and writes nothing — it cannot overwrite a newer result.
 *  - Finishing a run releases the lease with a compare-and-set on (token, epoch) in the same transaction as the run and
 *    watermark update. A stale finisher changes nothing.
 *  - An expired lease is recoverable: the next acquirer bumps the epoch and marks the abandoned run ABANDONED.
 *
 * Idempotency
 *  - (connection, idempotency_key) is unique on qbo_sync_runs: a repeated manual request id or scheduler bucket replays
 *    the existing run instead of creating another.
 *  - Provider records are keyed by (connection, entity type, provider id); upserts are conditional on the provider's
 *    own LastUpdatedTime never going backwards and are classified inserted / updated / unchanged / stale from a read
 *    performed under the lease, so re-reading the same page changes nothing but last_seen markers.
 *
 * Tenancy: every statement is scoped by workspace AND business AND connection; the database additionally enforces the
 * composite foreign key (connection_id, workspace_id, business_id). Raw SQL receives tenant ids only as bound parameters.
 */
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError } from "@/infra/errors";
import {
  QBO_SYNC_LEASE_MS,
  computeSyncBackoffMs,
  emptySyncCounts,
  type QboSyncCounts,
  type QboSyncFailureCode,
  type QboSyncMode,
  type QboSyncRunStatus,
  type QboSyncStatusView,
  type QboSyncTrigger,
} from "@/domain/quickbooks/qbo-sync-model";
import type { NormalizedRecord } from "@/domain/quickbooks/qbo-normalize";
import type { QboPersistenceDeps } from "./qbo-connection.service";

type Tx = Prisma.TransactionClient;

/** Page-sized writes (1000 upserts) exceed Prisma's 5s interactive-transaction default on a busy database. */
const TX_OPTIONS = { maxWait: 10_000, timeout: 60_000 } as const;

export interface SyncScope {
  workspaceId: string;
  businessId: string;
  connectionId: string;
}

export interface SyncLease extends SyncScope {
  token: string;
  epoch: number;
  runId: string;
}

export class QboLeaseLostError extends Error {
  constructor() {
    super("QuickBooks sync lease was lost.");
    this.name = "QboLeaseLostError";
  }
}

const clock = (deps?: QboPersistenceDeps) => (deps?.now ?? (() => new Date()))();
const clientOf = (deps?: QboPersistenceDeps) => deps?.client ?? db;

function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: unknown }).code === "P2002";
}

// ─── Sync state ──────────────────────────────────────────────────────────────

export interface QboSyncStateRow {
  connectionId: string;
  workspaceId: string;
  businessId: string;
  leaseToken: string | null;
  leaseRunId: string | null;
  leaseExpiresAt: Date | null;
  leaseEpoch: number;
  lastAttemptedAt: Date | null;
  lastSucceededAt: Date | null;
  lastFullSyncAt: Date | null;
  lastOutcome: string | null;
  lastErrorCode: string | null;
  consecutiveFailures: number;
  nextAttemptNotBefore: Date | null;
  watermarks: unknown;
  lastChangeAt: Date | null;
  webhookHintAt: Date | null;
}

async function ensureState(tx: Pick<Tx, "qboSyncState">, scope: SyncScope): Promise<void> {
  // createMany + skipDuplicates compiles to INSERT ... ON CONFLICT DO NOTHING: a concurrent creator can never abort the
  // surrounding Postgres transaction (a caught P2002 would leave it in the failed state).
  await tx.qboSyncState.createMany({ data: [{ ...scope, watermarks: {} }], skipDuplicates: true });
}

export async function readSyncState(scope: SyncScope, deps?: QboPersistenceDeps): Promise<QboSyncStateRow | null> {
  return (await clientOf(deps).qboSyncState.findFirst({ where: scope })) as QboSyncStateRow | null;
}

/** Watermarks as a plain { entity: Date } map; malformed stored values are ignored (that entity re-reads in full). */
export function parseWatermarks(raw: unknown): Record<string, Date> {
  const out: Record<string, Date> = {};
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v !== "string") continue;
    const t = Date.parse(v);
    if (!Number.isNaN(t)) out[k] = new Date(t);
  }
  return out;
}

// ─── Lease + run creation ────────────────────────────────────────────────────

export type AcquireResult =
  | { ok: true; lease: SyncLease; recoveredAbandonedRun: boolean; priorState: QboSyncStateRow }
  | { ok: false; reason: "BUSY"; runId: string | null; leaseExpiresAt: Date | null }
  | { ok: false; reason: "REPLAY"; runId: string; runStatus: QboSyncRunStatus; errorCode: string | null };

export interface BeginRunInput extends SyncScope {
  trigger: QboSyncTrigger;
  mode: QboSyncMode;
  idempotencyKey: string;
  requestedById: string | null;
}

/**
 * Atomically: replay check -> take the lease -> record the RUNNING run. All in one transaction, so a lease can never
 * be held without a run row and a duplicate idempotency key never leaves a held lease behind.
 */
export async function beginSyncRun(input: BeginRunInput, deps?: QboPersistenceDeps): Promise<AcquireResult> {
  const now = clock(deps);
  const scope: SyncScope = { workspaceId: input.workspaceId, businessId: input.businessId, connectionId: input.connectionId };

  const replay = async (client: Pick<Tx, "qboSyncRun">): Promise<AcquireResult | null> => {
    const existing = await client.qboSyncRun.findFirst({
      where: { connectionId: input.connectionId, workspaceId: input.workspaceId, idempotencyKey: input.idempotencyKey },
      select: { id: true, status: true, errorCode: true },
    });
    return existing ? { ok: false, reason: "REPLAY", runId: existing.id, runStatus: existing.status as QboSyncRunStatus, errorCode: existing.errorCode } : null;
  };

  const pre = await replay(clientOf(deps));
  if (pre) return pre;

  try {
    return await clientOf(deps).$transaction(async (tx: Tx) => {
      await ensureState(tx, scope);
      const prior = (await tx.qboSyncState.findFirst({ where: scope })) as QboSyncStateRow;
      const token = randomUUID();
      const runId = randomUUID();
      const won = await tx.qboSyncState.updateMany({
        where: { ...scope, OR: [{ leaseToken: null }, { leaseExpiresAt: { lte: now } }] },
        data: {
          leaseToken: token,
          leaseRunId: runId,
          leaseExpiresAt: new Date(now.getTime() + QBO_SYNC_LEASE_MS),
          leaseEpoch: { increment: 1 },
          lastAttemptedAt: now,
          version: { increment: 1 },
        },
      });
      if (won.count !== 1) {
        const holder = await tx.qboSyncState.findFirst({ where: scope, select: { leaseRunId: true, leaseExpiresAt: true } });
        return { ok: false as const, reason: "BUSY" as const, runId: holder?.leaseRunId ?? null, leaseExpiresAt: holder?.leaseExpiresAt ?? null };
      }
      const after = await tx.qboSyncState.findFirst({ where: scope, select: { leaseEpoch: true } });
      const epoch = (after as { leaseEpoch: number }).leaseEpoch;

      let recovered = false;
      if (prior.leaseToken && prior.leaseRunId) {
        const abandoned = await tx.qboSyncRun.updateMany({
          where: { id: prior.leaseRunId, workspaceId: scope.workspaceId, connectionId: scope.connectionId, status: "RUNNING" },
          data: { status: "ABANDONED", finishedAt: now, errorCode: "LEASE_LOST" },
        });
        recovered = abandoned.count > 0;
        if (recovered) {
          await emitAuditEvent({
            eventName: AUDIT_EVENTS.QBO_SYNC_LEASE_RECOVERED, workspaceId: scope.workspaceId, actorType: "system",
            entityType: "qbo_connection", entityId: scope.connectionId, visibility: "internal",
            payload: { businessId: scope.businessId, abandonedRunId: prior.leaseRunId, epoch },
          }, tx);
        }
      }

      await tx.qboSyncRun.create({
        data: {
          id: runId, ...scope, trigger: input.trigger, mode: input.mode, status: "RUNNING", requestedById: input.requestedById,
          idempotencyKey: input.idempotencyKey, leaseEpoch: epoch, startedAt: now, counts: emptySyncCounts() as unknown as Prisma.InputJsonValue,
        },
      });
      await emitAuditEvent({
        eventName: AUDIT_EVENTS.QBO_SYNC_STARTED, workspaceId: scope.workspaceId,
        ...(input.requestedById ? { actorId: input.requestedById } : { actorType: "system" }),
        entityType: "qbo_sync_run", entityId: runId, visibility: "internal",
        payload: { businessId: scope.businessId, connectionId: scope.connectionId, trigger: input.trigger, mode: input.mode, epoch },
      }, tx);
      return { ok: true as const, lease: { ...scope, token, epoch, runId }, recoveredAbandonedRun: recovered, priorState: prior };
    });
  } catch (e) {
    if (isUniqueViolation(e)) {
      // A concurrent request with the same idempotency key won; the transaction (and its lease) rolled back.
      const raced = await replay(clientOf(deps));
      if (raced) return raced;
    }
    throw e;
  }
}

/**
 * Re-verify and extend the lease inside `tx`. Throws QboLeaseLostError if this worker no longer holds it.
 * The fence is (token, epoch): a takeover REPLACES the token, so a taken-over worker always fails. Expiry itself is not part of
 * the fence — an expired-but-untaken lease may still be extended by its owner (nobody else holds it), which keeps a slow
 * provider call from throwing away work that nobody competed for.
 */
async function assertAndExtendLease(tx: Pick<Tx, "qboSyncState">, lease: SyncLease, now: Date): Promise<void> {
  const r = await tx.qboSyncState.updateMany({
    where: {
      connectionId: lease.connectionId, workspaceId: lease.workspaceId, businessId: lease.businessId,
      leaseToken: lease.token, leaseEpoch: lease.epoch,
    },
    data: { leaseExpiresAt: new Date(now.getTime() + QBO_SYNC_LEASE_MS) },
  });
  if (r.count !== 1) throw new QboLeaseLostError();
}

/** Heartbeat outside a write (e.g. before a long provider call). */
export async function extendSyncLease(lease: SyncLease, deps?: QboPersistenceDeps): Promise<void> {
  const now = clock(deps);
  await clientOf(deps).$transaction(async (tx: Tx) => assertAndExtendLease(tx, lease, now));
}

// ─── Provider mirror records ─────────────────────────────────────────────────

export interface PersistRecordsResult {
  inserted: number;
  updated: number;
  unchanged: number;
  stale: number;
}

/**
 * Persist one page of already-normalized, already-deduplicated records under the lease. Records whose provider
 * timestamp is OLDER than the stored copy are skipped (an out-of-order page can never roll data back).
 */
export async function persistRecordsPage(lease: SyncLease, records: readonly NormalizedRecord[], deps?: QboPersistenceDeps): Promise<PersistRecordsResult> {
  const now = clock(deps);
  const result: PersistRecordsResult = { inserted: 0, updated: 0, unchanged: 0, stale: 0 };
  if (records.length === 0) {
    await extendSyncLease(lease, deps);
    return result;
  }
  await clientOf(deps).$transaction(async (tx: Tx) => {
    await assertAndExtendLease(tx, lease, now);
    const existing = (await tx.qboSyncedRecord.findMany({
      where: {
        connectionId: lease.connectionId, workspaceId: lease.workspaceId, businessId: lease.businessId,
        OR: [...new Set(records.map((r) => r.entityType))].map((entityType) => ({
          entityType, providerEntityId: { in: records.filter((r) => r.entityType === entityType).map((r) => r.providerEntityId) },
        })),
      },
      select: { entityType: true, providerEntityId: true, contentHash: true, providerUpdatedAt: true, recordState: true },
    })) as Array<{ entityType: string; providerEntityId: string; contentHash: string; providerUpdatedAt: Date | null; recordState: string }>;
    const known = new Map(existing.map((e) => [`${e.entityType}:${e.providerEntityId}`, e]));

    const toWrite: NormalizedRecord[] = [];
    const staleSeen: NormalizedRecord[] = [];
    for (const r of records) {
      const prior = known.get(`${r.entityType}:${r.providerEntityId}`);
      if (!prior) { result.inserted++; toWrite.push(r); continue; }
      if (prior.providerUpdatedAt && r.providerUpdatedAt && r.providerUpdatedAt.getTime() < prior.providerUpdatedAt.getTime()) {
        result.stale++;
        staleSeen.push(r);
        continue;
      }
      // A record returning from MISSING (or changing state) is a real change even when its content is identical.
      if (prior.contentHash === r.contentHash && prior.recordState === r.recordState) result.unchanged++;
      else result.updated++;
      toWrite.push(r);
    }
    // A stale copy must not change the stored content, but the provider DID return the record: mark it seen so a FULL
    // sync's missing-record reconciliation does not flag a live record as MISSING.
    if (staleSeen.length > 0) {
      await tx.$executeRaw`
        UPDATE qbo_synced_records SET last_seen_run_id = ${lease.runId}::uuid, fetched_at = ${now}::timestamp
        WHERE connection_id = ${lease.connectionId}::uuid AND workspace_id = ${lease.workspaceId}::uuid AND business_id = ${lease.businessId}::uuid
          AND (entity_type, provider_entity_id) IN (
            SELECT x.entity_type, x.provider_entity_id
            FROM jsonb_to_recordset(${JSON.stringify(staleSeen.map((r) => ({ entity_type: r.entityType, provider_entity_id: r.providerEntityId })))}::jsonb)
              AS x(entity_type text, provider_entity_id text))`;
    }
    if (toWrite.length === 0) return;

    const rows = toWrite.map((r) => ({
      entity_type: r.entityType,
      provider_entity_id: r.providerEntityId,
      provider_sync_token: r.providerSyncToken,
      provider_updated_at: r.providerUpdatedAt ? r.providerUpdatedAt.toISOString() : null,
      record_state: r.recordState,
      normalized: r.normalized,
      content_hash: r.contentHash,
    }));
    await tx.$executeRaw`
      INSERT INTO qbo_synced_records (
        id, workspace_id, business_id, connection_id, entity_type, provider_entity_id, provider_sync_token, provider_updated_at,
        record_state, normalized, content_hash, revision, first_seen_run_id, last_seen_run_id, fetched_at, created_at, updated_at)
      SELECT gen_random_uuid(), ${lease.workspaceId}::uuid, ${lease.businessId}::uuid, ${lease.connectionId}::uuid,
        x.entity_type, x.provider_entity_id, x.provider_sync_token, x.provider_updated_at::timestamp,
        x.record_state, x.normalized, x.content_hash, 1, ${lease.runId}::uuid, ${lease.runId}::uuid, ${now}::timestamp, ${now}::timestamp, ${now}::timestamp
      FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS x(
        entity_type text, provider_entity_id text, provider_sync_token text, provider_updated_at text,
        record_state text, normalized jsonb, content_hash text)
      ON CONFLICT (connection_id, entity_type, provider_entity_id) DO UPDATE SET
        provider_sync_token = EXCLUDED.provider_sync_token,
        provider_updated_at = EXCLUDED.provider_updated_at,
        record_state = EXCLUDED.record_state,
        normalized = EXCLUDED.normalized,
        revision = CASE WHEN qbo_synced_records.content_hash <> EXCLUDED.content_hash OR qbo_synced_records.record_state <> EXCLUDED.record_state THEN qbo_synced_records.revision + 1 ELSE qbo_synced_records.revision END,
        content_hash = EXCLUDED.content_hash,
        last_seen_run_id = EXCLUDED.last_seen_run_id,
        fetched_at = EXCLUDED.fetched_at,
        updated_at = EXCLUDED.updated_at
      WHERE qbo_synced_records.workspace_id = EXCLUDED.workspace_id
        AND qbo_synced_records.business_id = EXCLUDED.business_id
        AND (qbo_synced_records.provider_updated_at IS NULL OR EXCLUDED.provider_updated_at IS NULL
             OR EXCLUDED.provider_updated_at >= qbo_synced_records.provider_updated_at)`;
  }, TX_OPTIONS);
  return result;
}

/**
 * After a FULL sync has read an entity to the end: records of that entity this run did not see are CANDIDATES for "deleted
 * or deactivated at Intuit". The list is capped (limit + 1 to detect overflow). The orchestrator re-reads each candidate by id
 * before anything is flagged, so a record that merely moved out of the query window (edited after the cutoff, paging race)
 * is never mislabeled.
 */
export async function listUnseenRecordIds(lease: SyncLease, entityType: string, limit: number, deps?: QboPersistenceDeps): Promise<string[]> {
  const now = clock(deps);
  return clientOf(deps).$transaction(async (tx: Tx) => {
    await assertAndExtendLease(tx, lease, now);
    const rows = (await tx.qboSyncedRecord.findMany({
      where: {
        connectionId: lease.connectionId, workspaceId: lease.workspaceId, businessId: lease.businessId,
        entityType, recordState: { in: ["ACTIVE", "INACTIVE"] }, lastSeenRunId: { not: lease.runId },
      },
      select: { providerEntityId: true },
      orderBy: { providerEntityId: "asc" },
      take: Math.max(1, limit) + 1,
    })) as Array<{ providerEntityId: string }>;
    return rows.map((r) => r.providerEntityId);
  }, TX_OPTIONS);
}

/** Flag records the provider confirmed absent as MISSING (never a delete; a later sighting flips them back). */
export async function markRecordsMissing(lease: SyncLease, entityType: string, providerEntityIds: readonly string[], deps?: QboPersistenceDeps): Promise<number> {
  if (providerEntityIds.length === 0) return 0;
  const now = clock(deps);
  return clientOf(deps).$transaction(async (tx: Tx) => {
    await assertAndExtendLease(tx, lease, now);
    const r = await tx.qboSyncedRecord.updateMany({
      where: {
        connectionId: lease.connectionId, workspaceId: lease.workspaceId, businessId: lease.businessId,
        entityType, providerEntityId: { in: [...providerEntityIds] }, recordState: { in: ["ACTIVE", "INACTIVE"] }, lastSeenRunId: { not: lease.runId },
      },
      data: { recordState: "MISSING", revision: { increment: 1 }, updatedAt: now },
    });
    return r.count;
  }, TX_OPTIONS);
}

// ─── Report observations ─────────────────────────────────────────────────────

export interface ReportObservationInput {
  reportName: string;
  periodStart: Date;
  periodEnd: Date;
  basis: string;
  currency: string | null;
  metrics: Record<string, string>;
  inconsistencies: readonly string[];
  contentHash: string;
  providerGeneratedAt: Date | null;
}

export async function persistReportObservation(lease: SyncLease, input: ReportObservationInput, deps?: QboPersistenceDeps): Promise<{ changed: boolean; created: boolean }> {
  const now = clock(deps);
  return clientOf(deps).$transaction(async (tx: Tx) => {
    await assertAndExtendLease(tx, lease, now);
    const key = {
      connectionId: lease.connectionId, workspaceId: lease.workspaceId, businessId: lease.businessId,
      reportName: input.reportName, periodStart: input.periodStart, periodEnd: input.periodEnd, basis: input.basis,
    };
    const existing = await tx.qboReportObservation.findFirst({ where: key, select: { id: true, contentHash: true, revision: true, metrics: true } });
    if (!existing) {
      await tx.qboReportObservation.create({
        data: {
          id: randomUUID(), ...key, currency: input.currency, metrics: input.metrics as Prisma.InputJsonValue,
          inconsistencies: [...input.inconsistencies] as Prisma.InputJsonValue, contentHash: input.contentHash,
          providerGeneratedAt: input.providerGeneratedAt, firstSeenRunId: lease.runId, lastSeenRunId: lease.runId, fetchedAt: now,
        },
      });
      return { changed: true, created: true };
    }
    const changed = existing.contentHash !== input.contentHash;
    await tx.qboReportObservation.update({
      where: { id: existing.id },
      data: changed
        ? {
            currency: input.currency, metrics: input.metrics as Prisma.InputJsonValue,
            inconsistencies: [...input.inconsistencies] as Prisma.InputJsonValue, contentHash: input.contentHash,
            providerGeneratedAt: input.providerGeneratedAt, revision: existing.revision + 1, lastSeenRunId: lease.runId, fetchedAt: now,
            previousMetrics: existing.metrics as Prisma.InputJsonValue, previousContentHash: existing.contentHash,
          }
        : { lastSeenRunId: lease.runId, fetchedAt: now },
    });
    return { changed, created: false };
  }, TX_OPTIONS);
}

// ─── Finish ──────────────────────────────────────────────────────────────────

export interface FinishSuccessInput {
  lease: SyncLease;
  mode: QboSyncMode;
  startedAt: Date;
  counts: QboSyncCounts;
  changed: boolean;
  /** New watermarks for entities fully read this run (ISO instants). Merged over the stored map. */
  watermarks: Record<string, string>;
  actorId: string | null;
}

/** Release the lease and record success, atomically. A stale finisher (lease taken over) rolls back and gets LeaseLostError. */
export async function finishSyncRunSuccess(input: FinishSuccessInput, deps?: QboPersistenceDeps): Promise<void> {
  const now = clock(deps);
  const { lease } = input;
  await clientOf(deps).$transaction(async (tx: Tx) => {
    const current = (await tx.qboSyncState.findFirst({
      where: { connectionId: lease.connectionId, workspaceId: lease.workspaceId, businessId: lease.businessId, leaseToken: lease.token, leaseEpoch: lease.epoch },
      select: { watermarks: true },
    })) as { watermarks: unknown } | null;
    if (!current) throw new QboLeaseLostError();
    // Watermarks only move forward: a run that started from a stale read can never regress a newer one.
    const stored = parseWatermarks(current.watermarks);
    const merged: Record<string, string> = Object.fromEntries(Object.entries(stored).map(([k, v]) => [k, v.toISOString()]));
    for (const [k, v] of Object.entries(input.watermarks)) {
      const prior = stored[k];
      if (!prior || Date.parse(v) > prior.getTime()) merged[k] = v;
    }
    const released = await tx.qboSyncState.updateMany({
      where: { connectionId: lease.connectionId, workspaceId: lease.workspaceId, businessId: lease.businessId, leaseToken: lease.token, leaseEpoch: lease.epoch },
      data: {
        leaseToken: null, leaseRunId: null, leaseExpiresAt: null, lastSucceededAt: now, lastOutcome: "SUCCEEDED", lastErrorCode: null,
        consecutiveFailures: 0, nextAttemptNotBefore: null, watermarks: merged as Prisma.InputJsonValue,
        ...(input.mode === "FULL" ? { lastFullSyncAt: now } : {}), ...(input.changed ? { lastChangeAt: now } : {}),
        version: { increment: 1 },
      },
    });
    if (released.count !== 1) throw new QboLeaseLostError();
    // A hint received before this run started has now been served.
    await tx.qboSyncState.updateMany({
      where: { connectionId: lease.connectionId, workspaceId: lease.workspaceId, webhookHintAt: { lte: input.startedAt } },
      data: { webhookHintAt: null },
    });
    const closed = await tx.qboSyncRun.updateMany({
      where: { id: lease.runId, workspaceId: lease.workspaceId, connectionId: lease.connectionId, status: "RUNNING" },
      data: { status: "SUCCEEDED", finishedAt: now, counts: input.counts as unknown as Prisma.InputJsonValue, changed: input.changed },
    });
    if (closed.count !== 1) throw new QboLeaseLostError();
    await emitAuditEvent({
      eventName: AUDIT_EVENTS.QBO_SYNC_COMPLETED, workspaceId: lease.workspaceId,
      ...(input.actorId ? { actorId: input.actorId } : { actorType: "system" }),
      entityType: "qbo_sync_run", entityId: lease.runId, visibility: "internal",
      payload: {
        businessId: lease.businessId, connectionId: lease.connectionId, mode: input.mode, changed: input.changed,
        inserted: input.counts.inserted, updated: input.counts.updated, unchanged: input.counts.unchanged, skipped: input.counts.skipped,
        reportsStored: input.counts.reportsStored, reportsChanged: input.counts.reportsChanged,
        // Governed re-evaluation marker: provider evidence changed. Adoption into owner snapshots (and the
        // business-condition / intervention re-evaluation it triggers) is a separate reviewed slice; see qbo-provenance-policy.
        reevaluationCandidate: input.changed,
      },
    }, tx);
  });
}

export interface FinishFailureInput {
  lease: SyncLease;
  code: QboSyncFailureCode;
  counts: QboSyncCounts;
  retryAfterMs: number | null;
  actorId: string | null;
}

/** Release the lease and record a sanitized failure with its back-off. Returns the earliest next attempt (null = terminal). */
export async function finishSyncRunFailure(input: FinishFailureInput, deps?: QboPersistenceDeps): Promise<{ nextAttemptNotBefore: Date | null }> {
  const now = clock(deps);
  const { lease } = input;
  return clientOf(deps).$transaction(async (tx: Tx) => {
    const current = (await tx.qboSyncState.findFirst({
      where: { connectionId: lease.connectionId, workspaceId: lease.workspaceId, businessId: lease.businessId, leaseToken: lease.token, leaseEpoch: lease.epoch },
      select: { consecutiveFailures: true },
    })) as { consecutiveFailures: number } | null;
    if (!current) throw new QboLeaseLostError();
    const failures = current.consecutiveFailures + 1;
    const delay = computeSyncBackoffMs(input.code, failures, input.retryAfterMs);
    const next = delay === null ? null : new Date(now.getTime() + delay);
    const released = await tx.qboSyncState.updateMany({
      where: { connectionId: lease.connectionId, workspaceId: lease.workspaceId, businessId: lease.businessId, leaseToken: lease.token, leaseEpoch: lease.epoch },
      data: {
        leaseToken: null, leaseRunId: null, leaseExpiresAt: null, lastOutcome: "FAILED", lastErrorCode: input.code,
        consecutiveFailures: failures, nextAttemptNotBefore: next, version: { increment: 1 },
      },
    });
    if (released.count !== 1) throw new QboLeaseLostError();
    const closed = await tx.qboSyncRun.updateMany({
      where: { id: lease.runId, workspaceId: lease.workspaceId, connectionId: lease.connectionId, status: "RUNNING" },
      data: { status: "FAILED", finishedAt: now, errorCode: input.code, counts: input.counts as unknown as Prisma.InputJsonValue },
    });
    if (closed.count !== 1) throw new QboLeaseLostError();
    await emitAuditEvent({
      eventName: AUDIT_EVENTS.QBO_SYNC_FAILED, workspaceId: lease.workspaceId,
      ...(input.actorId ? { actorId: input.actorId } : { actorType: "system" }),
      entityType: "qbo_sync_run", entityId: lease.runId, visibility: "internal",
      payload: { businessId: lease.businessId, connectionId: lease.connectionId, code: input.code, consecutiveFailures: failures, retryScheduled: next !== null },
    }, tx);
    return { nextAttemptNotBefore: next };
  });
}

// ─── Status ──────────────────────────────────────────────────────────────────

/** Token-free status for a business. Selects explicit columns only; never the token table, ciphertext or realm. */
export async function readSyncStatusForBusiness(
  input: { workspaceId: string; businessId: string },
  deps?: QboPersistenceDeps,
): Promise<QboSyncStatusView> {
  const client = clientOf(deps);
  const now = clock(deps);
  // A business of another workspace is a uniform NotFound (no existence oracle).
  const owned = await client.ownerBusiness.findFirst({ where: { id: input.businessId, workspaceId: input.workspaceId }, select: { id: true } });
  if (!owned) throw new NotFoundError("OwnerBusiness", input.businessId);
  const conn = (await client.qboConnection.findFirst({
    where: { workspaceId: input.workspaceId, businessId: input.businessId, status: { not: "DISCONNECTED" } },
    orderBy: { connectedAt: "desc" },
    select: { id: true, environment: true, status: true },
  })) as { id: string; environment: string; status: string } | null;
  if (!conn) {
    return {
      connected: false, connectionId: null, environment: null, connectionStatus: null, reauthorizationRequired: false, syncRunning: false,
      lastAttemptedAt: null, lastSucceededAt: null, lastOutcome: null, lastErrorCode: null, nextAttemptNotBefore: null,
      consecutiveFailures: 0, recordCounts: {}, reportObservationCount: 0,
    };
  }
  const state = (await client.qboSyncState.findFirst({
    where: { connectionId: conn.id, workspaceId: input.workspaceId, businessId: input.businessId },
    select: {
      leaseToken: true, leaseExpiresAt: true, lastAttemptedAt: true, lastSucceededAt: true, lastOutcome: true, lastErrorCode: true,
      nextAttemptNotBefore: true, consecutiveFailures: true,
    },
  })) as Pick<QboSyncStateRow, "leaseToken" | "leaseExpiresAt" | "lastAttemptedAt" | "lastSucceededAt" | "lastOutcome" | "lastErrorCode" | "nextAttemptNotBefore" | "consecutiveFailures"> | null;
  const grouped = (await client.qboSyncedRecord.groupBy({
    by: ["entityType"],
    where: { connectionId: conn.id, workspaceId: input.workspaceId, businessId: input.businessId, recordState: { not: "MISSING" } },
    _count: { _all: true },
  })) as Array<{ entityType: string; _count: { _all: number } }>;
  const observations = (await client.qboReportObservation.count({
    where: { connectionId: conn.id, workspaceId: input.workspaceId, businessId: input.businessId },
  })) as number;
  return {
    connected: conn.status === "ACTIVE",
    connectionId: conn.id,
    environment: conn.environment as "sandbox" | "production",
    connectionStatus: conn.status as QboSyncStatusView["connectionStatus"],
    reauthorizationRequired: conn.status === "REAUTH_REQUIRED",
    syncRunning: Boolean(state?.leaseToken && state.leaseExpiresAt && state.leaseExpiresAt.getTime() > now.getTime()),
    lastAttemptedAt: state?.lastAttemptedAt ?? null,
    lastSucceededAt: state?.lastSucceededAt ?? null,
    lastOutcome: (state?.lastOutcome as "SUCCEEDED" | "FAILED" | null) ?? null,
    lastErrorCode: (state?.lastErrorCode as QboSyncFailureCode | null) ?? null,
    nextAttemptNotBefore: state?.nextAttemptNotBefore ?? null,
    consecutiveFailures: state?.consecutiveFailures ?? 0,
    recordCounts: Object.fromEntries(grouped.map((g) => [g.entityType, g._count._all])),
    reportObservationCount: observations,
  };
}

// ─── Scheduler / webhook support ─────────────────────────────────────────────

export interface SchedulableConnection {
  workspaceId: string;
  businessId: string;
  connectionId: string;
}

/**
 * ACTIVE connections of the configured environment that may be synced now: no live lease and not inside a back-off
 * window. Bounded; ordered by oldest success first so no connection starves.
 */
export async function listSchedulableConnections(
  input: { environment: "sandbox" | "production"; limit: number },
  deps?: QboPersistenceDeps,
): Promise<SchedulableConnection[]> {
  const now = clock(deps);
  const rows = (await clientOf(deps).qboConnection.findMany({
    where: {
      environment: input.environment,
      status: "ACTIVE",
      business: { isActive: true, isFixtureBusiness: false },
      OR: [
        { syncState: null },
        { syncState: { AND: [
          { OR: [{ leaseToken: null }, { leaseExpiresAt: { lte: now } }] },
          { OR: [{ nextAttemptNotBefore: null }, { nextAttemptNotBefore: { lte: now } }] },
        ] } },
      ],
    },
    select: { id: true, workspaceId: true, businessId: true },
    orderBy: [{ syncState: { lastSucceededAt: { sort: "asc", nulls: "first" } } }, { id: "asc" }],
    take: Math.max(1, Math.min(input.limit, 500)),
  })) as Array<{ id: string; workspaceId: string; businessId: string }>;
  return rows.map((r) => ({ workspaceId: r.workspaceId, businessId: r.businessId, connectionId: r.id }));
}

export type WebhookHintResolution =
  | { kind: "ACTIVE"; workspaceId: string; businessId: string; connectionId: string }
  | { kind: "NOT_ACTIVE" }
  | { kind: "UNKNOWN_REALM" };

/** Resolve a realm to its ONE live connection in the configured environment. A realm held by nobody is UNKNOWN. */
export async function resolveRealmForWebhook(input: { environment: "sandbox" | "production"; realmId: string }, deps?: QboPersistenceDeps): Promise<WebhookHintResolution> {
  const row = (await clientOf(deps).qboConnection.findFirst({
    where: { environment: input.environment, realmId: input.realmId, status: { not: "DISCONNECTED" } },
    select: { id: true, workspaceId: true, businessId: true, status: true },
  })) as { id: string; workspaceId: string; businessId: string; status: string } | null;
  if (!row) return { kind: "UNKNOWN_REALM" };
  if (row.status !== "ACTIVE") return { kind: "NOT_ACTIVE" };
  return { kind: "ACTIVE", workspaceId: row.workspaceId, businessId: row.businessId, connectionId: row.id };
}

export interface WebhookLedgerInput {
  eventKey: string;
  format: string;
  realmId: string;
  entityName: string;
  entityId: string;
  operation: string;
  providerEventTime: Date | null;
  disposition: "HINT_RECORDED" | "IGNORED_UNKNOWN_REALM" | "IGNORED_NOT_ACTIVE";
  resolution: { workspaceId: string; businessId: string; connectionId: string } | null;
}

export type WebhookRecordResult = "NEW" | "RETRY_PENDING" | "DUPLICATE";

/**
 * Insert-if-absent into the dedup ledger. NEW: this call recorded it. DUPLICATE: already seen and fully handled.
 * RETRY_PENDING: seen before but its hint/task was never completed (the earlier delivery crashed mid-way), so the
 * redelivery must finish the job — a recorded-but-unserved hint can never be lost. Never overwrites a recorded disposition.
 * Hints are written unprocessed (processed_at NULL) and completed by markWebhookEventsProcessed(); ignored events need no work.
 */
export async function recordWebhookEvent(input: WebhookLedgerInput, deps?: QboPersistenceDeps): Promise<WebhookRecordResult> {
  const now = clock(deps);
  try {
    await clientOf(deps).qboWebhookEvent.create({
      data: {
        id: randomUUID(), eventKey: input.eventKey, format: input.format, realmId: input.realmId, entityName: input.entityName.slice(0, 64),
        entityId: input.entityId.slice(0, 128), operation: input.operation, providerEventTime: input.providerEventTime, receivedAt: now,
        disposition: input.disposition, processedAt: input.disposition === "HINT_RECORDED" ? null : now,
        workspaceId: input.resolution?.workspaceId ?? null, businessId: input.resolution?.businessId ?? null, connectionId: input.resolution?.connectionId ?? null,
      },
    });
    return "NEW";
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
    const existing = (await clientOf(deps).qboWebhookEvent.findFirst({ where: { eventKey: input.eventKey }, select: { processedAt: true, disposition: true } })) as { processedAt: Date | null; disposition: string } | null;
    return existing && existing.disposition === "HINT_RECORDED" && existing.processedAt === null ? "RETRY_PENDING" : "DUPLICATE";
  }
}

/** Mark hints as served (their sync hint + task exist). Idempotent. */
export async function markWebhookEventsProcessed(eventKeys: readonly string[], deps?: QboPersistenceDeps): Promise<void> {
  if (eventKeys.length === 0) return;
  const now = clock(deps);
  await clientOf(deps).qboWebhookEvent.updateMany({ where: { eventKey: { in: [...eventKeys] }, processedAt: null }, data: { processedAt: now } });
}

/** Remember that a verified hint arrived (cleared by the next successful run that started after it). */
export async function markWebhookHint(scope: SyncScope, deps?: QboPersistenceDeps): Promise<void> {
  const now = clock(deps);
  await clientOf(deps).$transaction(async (tx: Tx) => {
    await ensureState(tx, scope);
    await tx.qboSyncState.updateMany({ where: scope, data: { webhookHintAt: now } });
  });
}

// ─── Connection resolution (tenant-safe) ─────────────────────────────────────

export interface SyncableConnection {
  id: string;
  workspaceId: string;
  businessId: string;
  environment: "sandbox" | "production";
  realmId: string;
  status: "ACTIVE" | "REAUTH_REQUIRED" | "ERROR" | "DISCONNECTED";
  businessEligible: boolean;
}

/**
 * Resolve a connection ONLY by the full (workspace, business, connection) triple. A connection of another workspace or
 * business is indistinguishable from a missing one (null). `businessEligible` is false for archived / fixture businesses.
 */
export async function resolveSyncableConnection(scope: SyncScope, deps?: QboPersistenceDeps): Promise<SyncableConnection | null> {
  const row = (await clientOf(deps).qboConnection.findFirst({
    where: { id: scope.connectionId, workspaceId: scope.workspaceId, businessId: scope.businessId },
    select: {
      id: true, workspaceId: true, businessId: true, environment: true, realmId: true, status: true,
      business: { select: { isActive: true, isFixtureBusiness: true } },
    },
  })) as (Omit<SyncableConnection, "businessEligible"> & { business: { isActive: boolean; isFixtureBusiness: boolean } }) | null;
  if (!row) return null;
  const { business, ...rest } = row;
  return { ...rest, businessEligible: business.isActive && !business.isFixtureBusiness };
}

/** Business of a connection, looked up by the CLAIMED workspace + connection id only (scheduler payloads never carry a business). */
export async function resolveConnectionScope(input: { workspaceId: string; connectionId: string }, deps?: QboPersistenceDeps): Promise<SyncScope | null> {
  const row = (await clientOf(deps).qboConnection.findFirst({
    where: { id: input.connectionId, workspaceId: input.workspaceId },
    select: { businessId: true },
  })) as { businessId: string } | null;
  return row ? { workspaceId: input.workspaceId, businessId: row.businessId, connectionId: input.connectionId } : null;
}

// ─── Token refresh claim ─────────────────────────────────────────────────────

/** How long one refresher may hold the claim (the token endpoint call has a 15s deadline). A crashed holder simply expires. */
export const QBO_REFRESH_CLAIM_MS = 45_000;

/**
 * Try to become THE refresher of this connection. One conditional UPDATE on the sync-state row (no transaction is held open
 * while the token endpoint is called, so the connection pool cannot be exhausted by waiters). The connection's business is
 * recovered from the connection row for the caller's workspace; a foreign connection id claims nothing.
 */
export async function tryClaimTokenRefresh(input: { workspaceId: string; connectionId: string }, deps?: QboPersistenceDeps): Promise<{ claimed: true; token: string } | { claimed: false }> {
  const scope = await resolveConnectionScope(input, deps);
  if (!scope) return { claimed: false };
  const now = clock(deps);
  const token = randomUUID();
  return clientOf(deps).$transaction(async (tx: Tx) => {
    await ensureState(tx, scope);
    const won = await tx.qboSyncState.updateMany({
      where: { ...scope, OR: [{ refreshClaimToken: null }, { refreshClaimExpiresAt: { lte: now } }] },
      data: { refreshClaimToken: token, refreshClaimExpiresAt: new Date(now.getTime() + QBO_REFRESH_CLAIM_MS) },
    });
    return won.count === 1 ? { claimed: true as const, token } : { claimed: false as const };
  });
}

/** Release the claim iff this holder still owns it (idempotent). */
export async function releaseTokenRefreshClaim(input: { workspaceId: string; connectionId: string; token: string }, deps?: QboPersistenceDeps): Promise<void> {
  await clientOf(deps).qboSyncState.updateMany({
    where: { connectionId: input.connectionId, workspaceId: input.workspaceId, refreshClaimToken: input.token },
    data: { refreshClaimToken: null, refreshClaimExpiresAt: null },
  });
}
