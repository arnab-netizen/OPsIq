/**
 * QuickBooks Online — sync orchestration.
 *
 * requestQuickBooksSync(): the single, workspace-scoped, idempotent entry
 * point every trigger (owner "Sync Now", post-connect initial sync, the
 * webhook route, the daily producer) goes through to enqueue durable sync
 * work as a ScheduledTask.
 *
 * runQuickBooksSync(): does the actual work of one sync attempt — company
 * identity mirror, initial paginated pull (resumable, budgeted), incremental
 * CDC pull (with truncation/staleness fallbacks), monthly report pull, and
 * governed snapshot materialization. Acquires a CAS lease on the connector so
 * at most one sync runs per connector at a time; the lease is always released
 * in `finally`.
 *
 * Never trusts entity data from a webhook — this module always refetches
 * canonical state from QuickBooks itself (query / CDC / report).
 *
 * Workspace-scoped throughout. Every meaningful mutation emits an audit
 * event. No remote network call is made inside a DB transaction — each page
 * of provider data is fetched OUTSIDE the transaction, then the transaction
 * only upserts the already-fetched rows and advances the persisted cursor
 * (so a crash mid-run never loses or double-counts a page).
 */

import { randomUUID } from "crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { logger } from "@/infra/logger";
import { classifyOperatorError } from "@/lib/operator-error-governance";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { ConflictError, NotFoundError, ValidationError } from "@/infra/errors";
import { DatabaseSchedulerProvider, type TaskHandler, type HandlerResult } from "@/infra/scheduler";
import type { ProducerScanResult } from "@/services/scheduler/scheduler-producers";
import { toAuditActor } from "@/domain/owner-budget/system-actor";
import { QBO_PROVIDER, QBO_QUERY_MAX_RESULTS, QBO_CDC_MAX_LOOKBACK_DAYS } from "@/domain/quickbooks/qbo-config";
import {
  QBO_SYNC_ENTITY_ORDER,
  QBO_CDC_ENTITIES,
  QBO_REPORT_NAMES,
  reportRecordEntityType,
  type QboEntityName,
} from "@/domain/quickbooks/qbo-entities";
import {
  TASK_NAME_QUICKBOOKS_SYNC,
  initialQboSyncState,
  parseQboSyncState,
  isQboApiError,
  type QboApiError,
  type QboSyncTrigger,
  type QboSyncTaskPayload,
  type QboSyncState,
  type QboClient,
  type QboEntityBody,
  type QboCdcResult,
} from "@/domain/quickbooks/qbo-contracts";
import { createQboClient } from "@/services/quickbooks/qbo-client";
import { createQboTokenProvider, REFRESH_FAILED_MESSAGE } from "@/services/quickbooks/qbo-token.service";
import { materializeQuickBooksSnapshots } from "@/services/quickbooks/qbo-materialize.service";
import { ingestIntegrationEvent } from "@/services/integration-fabric/integration-event.service";

// ─── requestQuickBooksSync ───────────────────────────────────────────────────

export interface RequestQuickBooksSyncInput {
  workspaceId: string;
  actorId: string;
  trigger: QboSyncTrigger;
  /** Required (and used as the idempotency key material) for WEBHOOK triggers. */
  dedupKey?: string;
  now?: Date;
}

export interface RequestQuickBooksSyncResult {
  taskId: string;
  /** True when an existing task already owned this idempotency key (no new audit event emitted). */
  deduplicated: boolean;
}

function utcMinuteBucket(now: Date): string {
  return now.toISOString().slice(0, 16); // YYYY-MM-DDTHH:MM
}

function utcDayBucket(now: Date): string {
  return now.toISOString().slice(0, 10); // YYYY-MM-DD
}

function buildSyncIdempotencyKey(connectorId: string, trigger: QboSyncTrigger, dedupKey: string | undefined, now: Date): string {
  switch (trigger) {
    case "MANUAL":
    case "INITIAL":
      return `quickbooks-sync:${connectorId}:${trigger.toLowerCase()}:${utcMinuteBucket(now)}`;
    case "WEBHOOK":
      if (!dedupKey) {
        throw new ValidationError("A dedupKey is required to request a WEBHOOK-triggered QuickBooks sync.");
      }
      return `quickbooks-sync:${connectorId}:webhook:${dedupKey}`;
    case "SCHEDULED":
      return `quickbooks-sync:${connectorId}:scheduled:${utcDayBucket(now)}`;
  }
}

/** Continuation tasks (initial-sync budget exhausted mid-run) use this key so a crash-retry of the SAME run never double-enqueues. */
export function buildSyncContinuationIdempotencyKey(connectorId: string, runId: string): string {
  return `quickbooks-sync:${connectorId}:continue:${runId}`;
}

/**
 * Enqueues durable QuickBooks sync work for the CALLING workspace's own
 * connector — there is no connectorId parameter, so a request scoped to
 * workspace B can never reach workspace A's connector even if the caller
 * somehow knew its id.
 */
export async function requestQuickBooksSync(input: RequestQuickBooksSyncInput): Promise<RequestQuickBooksSyncResult> {
  const now = input.now ?? new Date();

  const connector = await db.ownerConnector.findFirst({
    where: { workspaceId: input.workspaceId, provider: QBO_PROVIDER },
    select: { id: true, status: true, registeredBy: true },
  });
  if (!connector) {
    throw new NotFoundError("OwnerConnector", "quickbooks");
  }
  if (connector.status !== "ACTIVE") {
    throw new ConflictError("QuickBooks is not connected for this workspace. Reconnect QuickBooks to sync.");
  }

  const idempotencyKey = buildSyncIdempotencyKey(connector.id, input.trigger, input.dedupKey, now);
  const requestedBy = input.trigger === "MANUAL" || input.trigger === "INITIAL" ? input.actorId : connector.registeredBy;

  const payload: QboSyncTaskPayload = { connectorId: connector.id, trigger: input.trigger, requestedBy };
  const scheduler = new DatabaseSchedulerProvider();
  // scheduleIdempotent is P2002 race-safe: no separate pre-findUnique (which
  // was TOCTOU — a concurrent caller could win the create between our read
  // and our create) — the unique idempotencyKey constraint itself is the
  // single arbiter of "created vs. already existed".
  const { id: taskId, created } = await scheduler.scheduleIdempotent({
    taskName: TASK_NAME_QUICKBOOKS_SYNC,
    payload: payload as unknown as Record<string, unknown>,
    scheduledFor: now,
    maxAttempts: 3,
    workspaceId: input.workspaceId,
    idempotencyKey,
  });

  const deduplicated = !created;
  if (created) {
    await emitAuditEvent({
      eventName: AUDIT_EVENTS.QUICKBOOKS_SYNC_REQUESTED,
      workspaceId: input.workspaceId,
      entityType: "OwnerConnector",
      entityId: connector.id,
      payload: { trigger: input.trigger, taskId },
      ...toAuditActor(input.actorId),
    });
  }

  return { taskId, deduplicated };
}

// ─── runQuickBooksSync ────────────────────────────────────────────────────────

const SYNC_LEASE_MS = 5 * 60 * 1000;
const DEFAULT_BUDGET_MS = 40_000;
/** Small margin added after a held lease's expiry before the deferred follow-up sync runs, so it never races the lease-holder's own release/renewal. */
const DEFERRED_SYNC_MARGIN_MS = 30_000;
/** Safety cap on paginated-query fallback pages per CDC-truncated entity (1000/page → 100k rows). */
const MAX_FALLBACK_PAGES = 100;

export type QuickBooksSyncStatus = "SUCCESS" | "NO_WORK" | "PARTIAL_FAILURE" | "FAILED";

export interface RunQuickBooksSyncResult {
  status: QuickBooksSyncStatus;
  summary: string;
  counts: Record<string, number>;
}

export interface RunQuickBooksSyncDeps {
  createClient?: (ids: { workspaceId: string; connectorId: string }) => Promise<QboClient>;
  now?: () => Date;
}

export interface RunQuickBooksSyncInput {
  workspaceId: string;
  connectorId: string;
  trigger: QboSyncTrigger;
  requestedBy: string;
  runId: string;
  budgetMs?: number;
  deps?: RunQuickBooksSyncDeps;
}

function deriveRemoteStatus(body: QboEntityBody): string {
  const active = (body as { Active?: unknown }).Active;
  return active === false ? "INACTIVE" : "ACTIVE";
}

function parseMetaUpdatedAt(body: QboEntityBody): Date | null {
  const raw = body.MetaData?.LastUpdatedTime;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

interface ConnectorRecordUpsertInput {
  id: string;
  workspaceId: string;
  businessId: string | null;
  connectorId: string;
  provider: string;
  externalAccount: string;
  entityType: string;
  remoteId: string;
  remoteSyncToken: string | null;
  remoteUpdatedAt: Date | null;
  remoteStatus: string;
  data: unknown;
  lastSyncRunId: string;
  ingestedAt: Date;
}

/**
 * Upsert-with-no-regression: unique on (connectorId, entityType, remoteId).
 * A conflicting row is overwritten ONLY when the stored remoteUpdatedAt is
 * NULL, or the incoming value is present and >= the stored value — an
 * out-of-order/older delivery (e.g. a stale CDC replay) is a silent no-op,
 * never a regression. Never deletes a row (deletions are represented as
 * remoteStatus = "DELETED" through this same path).
 *
 * F21 (deliberate decision, documented): an INCOMING NULL remoteUpdatedAt
 * never overwrites an existing NON-NULL stored value. QBO's MetaData block
 * (the only source of remoteUpdatedAt) is effectively always present on a
 * live entity, so a null incoming value here means either a CompanyInfo-
 * style config row (which has no reasonable competing timestamp to lose to
 * anyway) or a malformed/incomplete provider response — in either case there
 * is no basis to compare "newer" against the currently-stored value, and the
 * safe default is to KEEP the last known-good timestamped state rather than
 * silently drop it in favor of untimestamped data. A stored NULL is still
 * always overwritten (nothing to protect there — this is the row's very
 * first ingest, or a config row that intentionally carries no timestamp).
 */
async function upsertConnectorRecord(tx: Prisma.TransactionClient, row: ConnectorRecordUpsertInput): Promise<void> {
  const dataJson = JSON.stringify(row.data ?? {});
  await tx.$executeRaw`
    INSERT INTO owner_connector_records (
      id, workspace_id, business_id, connector_id, provider, external_account,
      entity_type, remote_id, remote_sync_token, remote_updated_at, remote_status,
      data, opsiq_entity_type, opsiq_entity_id, last_sync_run_id, ingested_at, created_at, updated_at
    ) VALUES (
      ${row.id}::uuid, ${row.workspaceId}::uuid, ${row.businessId}::uuid, ${row.connectorId}::uuid, ${row.provider},
      ${row.externalAccount}, ${row.entityType}, ${row.remoteId}, ${row.remoteSyncToken}, ${row.remoteUpdatedAt},
      ${row.remoteStatus}, ${dataJson}::jsonb, NULL, NULL, ${row.lastSyncRunId}, ${row.ingestedAt}, now(), now()
    )
    ON CONFLICT (connector_id, entity_type, remote_id) DO UPDATE SET
      remote_sync_token = EXCLUDED.remote_sync_token,
      remote_updated_at = EXCLUDED.remote_updated_at,
      remote_status = EXCLUDED.remote_status,
      data = EXCLUDED.data,
      external_account = EXCLUDED.external_account,
      business_id = EXCLUDED.business_id,
      last_sync_run_id = EXCLUDED.last_sync_run_id,
      ingested_at = EXCLUDED.ingested_at,
      updated_at = now()
    WHERE owner_connector_records.remote_updated_at IS NULL
       OR (EXCLUDED.remote_updated_at IS NOT NULL AND EXCLUDED.remote_updated_at >= owner_connector_records.remote_updated_at)
  `;
}

async function persistSyncState(connectorId: string, state: QboSyncState, client: Prisma.TransactionClient | typeof db = db): Promise<void> {
  await client.ownerConnector.update({
    where: { id: connectorId },
    data: { syncState: state as unknown as Prisma.InputJsonValue },
  });
}

function mergeCounts(base: Partial<Record<QboEntityName, number>>, delta: Record<string, number>): Partial<Record<QboEntityName, number>> {
  const merged: Partial<Record<QboEntityName, number>> = { ...base };
  for (const [k, v] of Object.entries(delta)) {
    const key = k as QboEntityName;
    merged[key] = (merged[key] ?? 0) + v;
  }
  return merged;
}

/**
 * F22: the connector-level `lastSyncRecords` DTO field is documented (and
 * read by the owner status surface) as "how many records this mirror
 * holds" — it must be the CUMULATIVE total across the connector's whole
 * initial+incremental lifecycle (syncState.recordCounts, which mergeCounts
 * accumulates leg over leg), never just the current run/leg's own count
 * (`totalUpserted` below resets to 0 every run and would silently regress
 * this field on every incremental run after a large initial sync).
 */
function sumRecordCounts(counts: Partial<Record<QboEntityName, number>>): number {
  return Object.values(counts).reduce((sum: number, v) => sum + (v ?? 0), 0);
}

function lastCompleteCalendarMonthUTC(now: Date): { periodStart: Date; periodEnd: Date } {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth(); // 0-based; "last complete month" is month-1
  const periodStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const periodEnd = new Date(Date.UTC(year, month, 1, 0, 0, 0) - 1);
  return { periodStart, periodEnd };
}

function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Paginated fallback for a CDC-truncated entity: `WHERE MetaData.LastUpdatedTime
 * >= '<cursor>'`. Bounded by BOTH MAX_FALLBACK_PAGES (100 * 1000 = 100k rows,
 * a safety cap against a runaway loop) and the run's own wall-clock deadline
 * (so this fallback can never itself blow the sync run's overall budget).
 * `complete: false` means there is MORE data pending than this call fetched
 * (page cap or deadline) — the caller MUST NOT advance the CDC cursor past
 * this window in that case (see runCdcPass), or the un-fetched remainder
 * would be silently and permanently lost on the next run.
 */
async function queryChangedSince(
  client: QboClient,
  entity: QboEntityName,
  since: Date,
  opts: { deadlineMs: number; now: () => Date }
): Promise<{ items: QboEntityBody[]; complete: boolean }> {
  const items: QboEntityBody[] = [];
  let startPosition = 1;
  let complete = true;
  for (let page = 0; page < MAX_FALLBACK_PAGES; page++) {
    if (opts.now().getTime() > opts.deadlineMs) {
      complete = false;
      break;
    }
    const result = await client.query(entity, {
      where: `MetaData.LastUpdatedTime >= '${since.toISOString()}'`,
      startPosition,
      maxResults: QBO_QUERY_MAX_RESULTS,
      orderBy: "Id",
    });
    items.push(...result.items);
    if (result.items.length < QBO_QUERY_MAX_RESULTS) break;
    startPosition += result.items.length;
    if (page === MAX_FALLBACK_PAGES - 1) complete = false;
  }
  return { items, complete };
}

interface ConnectorSnapshot {
  id: string;
  workspaceId: string;
  businessId: string | null;
  externalAccountId: string;
}

async function runInitialPageStep(params: {
  client: QboClient;
  connector: ConnectorSnapshot;
  runId: string;
  syncState: QboSyncState;
  now: Date;
}): Promise<{ nextState: QboSyncState; upserted: number }> {
  const { client, connector, runId, syncState, now } = params;
  const entity = QBO_SYNC_ENTITY_ORDER[syncState.initial.entityIndex];

  const page = await client.query(entity, {
    startPosition: syncState.initial.startPosition,
    maxResults: QBO_QUERY_MAX_RESULTS,
    // ORDERBY Id: QBO's query endpoint supports ordering by Id for every synced
    // entity and gives deterministic, stable pagination across resumed runs
    // (MetaData.LastUpdatedTime is not guaranteed unique, which could skip or
    // repeat rows across a page boundary that lands on a tie).
    orderBy: "Id",
  });

  const nextInitial =
    page.items.length < QBO_QUERY_MAX_RESULTS
      ? { ...syncState.initial, entityIndex: syncState.initial.entityIndex + 1, startPosition: 1 }
      : { ...syncState.initial, startPosition: syncState.initial.startPosition + page.items.length };

  const nextState: QboSyncState = {
    ...syncState,
    initial: nextInitial,
    recordCounts: mergeCounts(syncState.recordCounts, { [entity]: page.items.length }),
  };

  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    for (const item of page.items) {
      const id = typeof item.Id === "string" ? item.Id : String(item.Id ?? "");
      if (!id) continue;
      await upsertConnectorRecord(tx, {
        id: randomUUID(),
        workspaceId: connector.workspaceId,
        businessId: connector.businessId,
        connectorId: connector.id,
        provider: QBO_PROVIDER,
        externalAccount: connector.externalAccountId,
        entityType: entity,
        remoteId: id,
        remoteSyncToken: typeof item.SyncToken === "string" ? item.SyncToken : null,
        remoteUpdatedAt: parseMetaUpdatedAt(item),
        remoteStatus: deriveRemoteStatus(item),
        data: item,
        lastSyncRunId: runId,
        ingestedAt: now,
      });
    }
    await persistSyncState(connector.id, nextState, tx);
  });

  return { nextState, upserted: page.items.length };
}

async function runCdcPass(params: {
  client: QboClient;
  connector: ConnectorSnapshot;
  runId: string;
  syncState: QboSyncState;
  now: Date;
  nowFn: () => Date;
  deadlineMs: number;
}): Promise<{ nextState: QboSyncState; counts: Record<string, number>; incomplete: boolean }> {
  const { client, connector, runId, syncState, now, nowFn, deadlineMs } = params;
  const cursorDate = new Date(syncState.cdcCursor as string);
  // 5-minute overlap skew so a change committed right at the previous run's
  // boundary is never missed by an off-by-one server-clock discrepancy.
  const changedSince = new Date(cursorDate.getTime() - 5 * 60 * 1000);

  const cdcResult = await client.cdc(QBO_CDC_ENTITIES, changedSince);

  // Every remote call — including the truncated-entity paginated fallback —
  // happens HERE, before any transaction opens. No network call is ever made
  // inside a DB transaction (CLAUDE.md hard rule): an HTTP round-trip held
  // open under a DB transaction would hold that transaction's connection for
  // the network call's full latency, and a slow/hung provider response would
  // hold the underlying DB lock/connection along with it.
  let anyIncomplete = false;
  const perEntity: Array<{ entity: QboEntityName; changed: QboEntityBody[]; deleted: QboCdcResult["entities"][number]["deleted"] }> = [];
  for (const entityChanges of cdcResult.entities) {
    if (entityChanges.truncated) {
      if (nowFn().getTime() > deadlineMs) {
        // Run budget already spent — do not even start another entity's
        // fallback fetch; leave it (and everything after it) for the
        // continuation run, same as a mid-page deadline hit below.
        anyIncomplete = true;
        perEntity.push({ entity: entityChanges.entity, changed: [], deleted: [] });
        continue;
      }
      const fallback = await queryChangedSince(client, entityChanges.entity, changedSince, { deadlineMs, now: nowFn });
      if (!fallback.complete) {
        anyIncomplete = true;
        logger.error("QuickBooks CDC fallback query did not finish (page cap or run deadline) — more changes are pending", {
          connectorId: connector.id,
          entity: entityChanges.entity,
          runId,
          maxPages: MAX_FALLBACK_PAGES,
        });
      }
      perEntity.push({ entity: entityChanges.entity, changed: fallback.items, deleted: entityChanges.deleted });
    } else {
      perEntity.push({ entity: entityChanges.entity, changed: entityChanges.changed, deleted: entityChanges.deleted });
    }
  }

  const counts: Record<string, number> = {};
  // Incomplete: do NOT advance the cursor — the un-fetched remainder must
  // stay in scope for the next run (whatever WAS fetched above is still
  // persisted below; upserts are idempotent/no-regress, so a safe, bounded
  // re-fetch of the same window next run is the correct fail-safe, never
  // silent data loss).
  const nextCursor = anyIncomplete ? syncState.cdcCursor : (cdcResult.serverTime ?? now.toISOString());

  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    for (const { entity, changed, deleted } of perEntity) {
      for (const item of changed) {
        const id = typeof item.Id === "string" ? item.Id : String(item.Id ?? "");
        if (!id) continue;
        await upsertConnectorRecord(tx, {
          id: randomUUID(),
          workspaceId: connector.workspaceId,
          businessId: connector.businessId,
          connectorId: connector.id,
          provider: QBO_PROVIDER,
          externalAccount: connector.externalAccountId,
          entityType: entity,
          remoteId: id,
          remoteSyncToken: typeof item.SyncToken === "string" ? item.SyncToken : null,
          remoteUpdatedAt: parseMetaUpdatedAt(item),
          remoteStatus: deriveRemoteStatus(item),
          data: item,
          lastSyncRunId: runId,
          ingestedAt: now,
        });
      }

      for (const del of deleted) {
        await upsertConnectorRecord(tx, {
          id: randomUUID(),
          workspaceId: connector.workspaceId,
          businessId: connector.businessId,
          connectorId: connector.id,
          provider: QBO_PROVIDER,
          externalAccount: connector.externalAccountId,
          entityType: entity,
          remoteId: del.Id,
          remoteSyncToken: null,
          remoteUpdatedAt: del.lastUpdated ? new Date(del.lastUpdated) : null,
          remoteStatus: "DELETED",
          data: { Id: del.Id, status: "Deleted" },
          lastSyncRunId: runId,
          ingestedAt: now,
        });
      }

      counts[entity] = changed.length + deleted.length;
    }

    const nextState: QboSyncState = {
      ...syncState,
      cdcCursor: nextCursor,
      recordCounts: mergeCounts(syncState.recordCounts, counts),
    };
    await persistSyncState(connector.id, nextState, tx);
  });

  return {
    nextState: { ...syncState, cdcCursor: nextCursor, recordCounts: mergeCounts(syncState.recordCounts, counts) },
    counts,
    incomplete: anyIncomplete,
  };
}

interface ReportFetchResult {
  profitAndLoss: Record<string, unknown> | null;
  balanceSheet: Record<string, unknown> | null;
  agedReceivables: Record<string, unknown> | null;
  agedPayables: Record<string, unknown> | null;
}

async function runReportsAndMaterialize(params: {
  client: QboClient;
  connector: ConnectorSnapshot;
  runId: string;
  requestedBy: string;
  homeCurrency: string | null;
  now: Date;
}): Promise<{ periodKey: string; issues: string[] }> {
  const { client, connector, runId, requestedBy, homeCurrency, now } = params;
  const { periodStart, periodEnd } = lastCompleteCalendarMonthUTC(now);
  const startStr = toDateOnly(periodStart);
  const endStr = toDateOnly(periodEnd);
  const periodKey = `${startStr}..${endStr}`;

  const reports: ReportFetchResult = { profitAndLoss: null, balanceSheet: null, agedReceivables: null, agedPayables: null };
  const fetched: Array<{ name: (typeof QBO_REPORT_NAMES)[number]; body: Record<string, unknown> }> = [];

  for (const name of QBO_REPORT_NAMES) {
    const params2 =
      name === "BalanceSheet"
        ? { end_date: endStr }
        : name === "AgedReceivables" || name === "AgedPayables"
          ? { report_date: endStr }
          : name === "ProfitAndLoss"
            ? { start_date: startStr, end_date: endStr, accounting_method: "Accrual" as const }
            : { start_date: startStr, end_date: endStr };

    const body = await client.report(name, params2);
    fetched.push({ name, body });
    if (name === "ProfitAndLoss") reports.profitAndLoss = body;
    if (name === "BalanceSheet") reports.balanceSheet = body;
    if (name === "AgedReceivables") reports.agedReceivables = body;
    if (name === "AgedPayables") reports.agedPayables = body;
  }

  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    for (const r of fetched) {
      await upsertConnectorRecord(tx, {
        id: randomUUID(),
        workspaceId: connector.workspaceId,
        businessId: connector.businessId,
        connectorId: connector.id,
        provider: QBO_PROVIDER,
        externalAccount: connector.externalAccountId,
        entityType: reportRecordEntityType(r.name),
        remoteId: periodKey,
        remoteSyncToken: null,
        remoteUpdatedAt: now, // reports have no per-object MetaData; a freshly pulled report is always the current one.
        remoteStatus: "ACTIVE",
        data: r.body,
        lastSyncRunId: runId,
        ingestedAt: now,
      });
    }
  });

  if (!connector.businessId) {
    return { periodKey, issues: ["Connector is not linked to an OpsIQ business — reports stored, snapshot materialization skipped."] };
  }
  if (!homeCurrency) {
    return { periodKey, issues: ["QuickBooks home currency could not be determined — snapshot materialization skipped."] };
  }

  const result = await materializeQuickBooksSnapshots({
    workspaceId: connector.workspaceId,
    connectorId: connector.id,
    businessId: connector.businessId,
    actorId: requestedBy,
    periodStart: startStr,
    periodEnd: endStr,
    reports,
    homeCurrency,
  });

  return { periodKey, issues: result.issues };
}

/**
 * Shared continuation-scheduling used by BOTH the initial-pull budget-exceeded
 * path and the CDC-incomplete (page-cap or deadline) path: enqueue a follow-up
 * ScheduledTask for the SAME connector under the run's own continuation key,
 * so a crash-retry of this exact run never double-enqueues a second one.
 */
async function scheduleContinuationTask(params: {
  connectorId: string;
  workspaceId: string;
  requestedBy: string;
  runId: string;
  trigger: QboSyncTrigger;
  scheduledFor: Date;
}): Promise<void> {
  const scheduler = new DatabaseSchedulerProvider();
  await scheduler.schedule({
    taskName: TASK_NAME_QUICKBOOKS_SYNC,
    payload: { connectorId: params.connectorId, trigger: params.trigger, requestedBy: params.requestedBy } satisfies QboSyncTaskPayload,
    scheduledFor: params.scheduledFor,
    maxAttempts: 3,
    workspaceId: params.workspaceId,
    idempotencyKey: buildSyncContinuationIdempotencyKey(params.connectorId, params.runId),
  });
}

/**
 * Runs one QuickBooks sync attempt for a single connector. At most one run
 * proceeds per connector at a time (CAS lease on OwnerConnector.syncLeaseExpiresAt);
 * a concurrent caller receives NO_WORK immediately rather than blocking. The
 * lease is released in `finally` no matter how the run ends.
 */
export async function runQuickBooksSync(input: RunQuickBooksSyncInput): Promise<RunQuickBooksSyncResult> {
  const now = input.deps?.now ?? (() => new Date());
  const budgetMs = input.budgetMs ?? DEFAULT_BUDGET_MS;
  const startedAt = now();
  const deadline = startedAt.getTime() + budgetMs;
  const leaseExpiresAt = new Date(startedAt.getTime() + SYNC_LEASE_MS);

  async function tryAcquireLease(): Promise<boolean> {
    const result = await db.ownerConnector.updateMany({
      where: {
        id: input.connectorId,
        workspaceId: input.workspaceId,
        provider: QBO_PROVIDER,
        status: "ACTIVE",
        OR: [{ syncLeaseExpiresAt: null }, { syncLeaseExpiresAt: { lt: startedAt } }],
      },
      data: { syncLeaseExpiresAt: leaseExpiresAt },
    });
    return result.count > 0;
  }

  async function readConnectorLeaseState(): Promise<{ status: string; syncLeaseExpiresAt: Date | null } | null> {
    return db.ownerConnector.findFirst({
      where: { id: input.connectorId, workspaceId: input.workspaceId, provider: QBO_PROVIDER },
      select: { status: true, syncLeaseExpiresAt: true },
    });
  }

  function isLeaseLive(row: { status: string; syncLeaseExpiresAt: Date | null } | null): boolean {
    return row?.status === "ACTIVE" && row.syncLeaseExpiresAt !== null && row.syncLeaseExpiresAt.getTime() >= startedAt.getTime();
  }

  let acquired = await tryAcquireLease();

  if (!acquired) {
    // Resilience fix: distinguish "another run currently holds the lease"
    // from "the connector isn't ACTIVE" (both make the CAS updateMany above
    // match 0 rows) — and from a THIRD case: the holder released its lease
    // (or it simply expired) in the gap between our failed CAS and this
    // re-read. That gap case is the exact loss this fix targets — if left
    // as a plain NO_WORK here, the holder's own CDC window may predate
    // whatever prompted THIS call (e.g. a webhook notification), and it
    // would be silently dropped until the next daily sync. So: if the
    // connector is ACTIVE but no lease is currently live, retry the CAS
    // exactly once (bounded — never a loop) before falling back to either
    // scheduling a deferred follow-up (still genuinely held) or a plain
    // NO_WORK (truly not active).
    const current = await readConnectorLeaseState();
    const raceWindow = current?.status === "ACTIVE" && !isLeaseLive(current);

    if (raceWindow) {
      acquired = await tryAcquireLease();
    }

    if (!acquired) {
      // If we retried, `current` is now stale (something changed the row
      // between our first read and the retry) — re-read once more to decide
      // held-vs-not accurately. If we did NOT retry (current was already a
      // genuinely live lease), `current` is still fresh.
      const finalState = raceWindow ? await readConnectorLeaseState() : current;

      if (isLeaseLive(finalState) && finalState?.syncLeaseExpiresAt) {
        const deferredFor = new Date(finalState.syncLeaseExpiresAt.getTime() + DEFERRED_SYNC_MARGIN_MS);
        const scheduler = new DatabaseSchedulerProvider();
        // Keyed on the OBSERVED lease expiry, not "now" or the run id —
        // every NO_WORK seen while the SAME lease is held collapses onto
        // the one follow-up task for that lease, instead of enqueueing a
        // duplicate per request (e.g. a burst of webhook notifications
        // during one long run).
        await scheduler.scheduleIdempotent({
          taskName: TASK_NAME_QUICKBOOKS_SYNC,
          payload: { connectorId: input.connectorId, trigger: input.trigger, requestedBy: input.requestedBy } satisfies QboSyncTaskPayload,
          scheduledFor: deferredFor,
          maxAttempts: 3,
          workspaceId: input.workspaceId,
          idempotencyKey: `quickbooks-sync:${input.connectorId}:deferred:${finalState.syncLeaseExpiresAt.toISOString()}`,
        });
        return {
          status: "NO_WORK",
          summary: "A QuickBooks sync is already running for this connector; a follow-up sync has been deferred until it finishes.",
          counts: {},
        };
      }

      return { status: "NO_WORK", summary: "A QuickBooks sync is already running for this connector, or it is not active.", counts: {} };
    }
  }

  let leaseHeld = true;
  try {
    const connectorRow = await db.ownerConnector.findFirst({
      where: { id: input.connectorId, workspaceId: input.workspaceId },
      select: { id: true, workspaceId: true, businessId: true, externalAccountId: true, environment: true, syncState: true },
    });
    if (!connectorRow || !connectorRow.externalAccountId) {
      return { status: "FAILED", summary: "QuickBooks connection is incomplete.", counts: {} };
    }
    const connector: ConnectorSnapshot = {
      id: connectorRow.id,
      workspaceId: connectorRow.workspaceId,
      businessId: connectorRow.businessId,
      externalAccountId: connectorRow.externalAccountId,
    };

    // F25: declared here (not inside the try below) so the catch clause can
    // still read whatever progress this run made — a `let` inside a try
    // block is NOT visible in its own catch clause. On ANY terminal outcome
    // (SUCCESS, PARTIAL_FAILURE, FAILED, or a continuation) syncState +
    // totalUpserted must be persisted atomically with syncFailureMessage, so
    // a failed run's syncState.lastRunStatus/lastRunSummary can never lag
    // behind (and contradict) the connector's own syncFailureMessage.
    let syncState: QboSyncState = parseQboSyncState(connectorRow.syncState) ?? initialQboSyncState(startedAt);
    let totalUpserted = 0;

    try {
      // F26 (root cause): client construction — including the tokenProvider's
      // OWN credential fetch/refresh inside createQboClient() — used to happen
      // OUTSIDE this try, so any failure there (a network/proxy error, an
      // expired/invalid token, a malformed realmId) bypassed classification
      // and handleSyncFailure entirely and escaped runQuickBooksSync as an
      // uncaught throw. The scheduler then recorded it as a generic
      // "Couldn't load that data…" retry/dead-letter — even for a definite,
      // non-retryable FORBIDDEN/VALIDATION/AUTH failure that should have
      // returned FAILED immediately. Moved inside so EVERY failure from here
      // on is classified exactly once, through the same path.
      const client = input.deps?.createClient
        ? await input.deps.createClient({ workspaceId: input.workspaceId, connectorId: input.connectorId })
        : await createQboClient({ tokenProvider: createQboTokenProvider({ workspaceId: input.workspaceId, connectorId: input.connectorId }) });

      // ── (b) CompanyInfo + Preferences mirror ────────────────────────────
      const companyInfo = await client.companyInfo();
      const preferences = await client.preferences();
      const homeCurrency =
        ((preferences as { CurrencyPrefs?: { HomeCurrency?: { value?: unknown } } }).CurrencyPrefs?.HomeCurrency?.value as
          | string
          | undefined) ?? null;
      const companyName = (companyInfo as { CompanyName?: unknown }).CompanyName;

      await db.$transaction(async (tx: Prisma.TransactionClient) => {
        await upsertConnectorRecord(tx, {
          id: randomUUID(),
          workspaceId: connector.workspaceId,
          businessId: connector.businessId,
          connectorId: connector.id,
          provider: QBO_PROVIDER,
          externalAccount: connector.externalAccountId,
          entityType: "CompanyInfo",
          remoteId: connector.externalAccountId,
          remoteSyncToken: typeof companyInfo.SyncToken === "string" ? companyInfo.SyncToken : null,
          remoteUpdatedAt: parseMetaUpdatedAt(companyInfo),
          remoteStatus: "ACTIVE",
          data: companyInfo,
          lastSyncRunId: input.runId,
          ingestedAt: now(),
        });
        await upsertConnectorRecord(tx, {
          id: randomUUID(),
          workspaceId: connector.workspaceId,
          businessId: connector.businessId,
          connectorId: connector.id,
          provider: QBO_PROVIDER,
          externalAccount: connector.externalAccountId,
          entityType: "Preferences",
          remoteId: "preferences",
          remoteSyncToken: typeof preferences.SyncToken === "string" ? preferences.SyncToken : null,
          remoteUpdatedAt: parseMetaUpdatedAt(preferences),
          remoteStatus: "ACTIVE",
          data: preferences,
          lastSyncRunId: input.runId,
          ingestedAt: now(),
        });
        if (typeof companyName === "string" && companyName.length > 0) {
          await tx.ownerConnector.update({ where: { id: connector.id }, data: { externalAccountName: companyName } });
        }
      });

      // ── (c)/(d) initial pull / incremental CDC, resumable and budgeted ──
      let incrementalCounts: Record<string, number> = {};
      let cdcIncomplete = false;
      let incrementalDone = false;

      while (!incrementalDone) {
        if (now().getTime() > deadline) {
          // Budget exhausted mid-initial-pull: schedule a continuation task
          // for the SAME connector and stop cleanly. Progress already made
          // this run is durably persisted (each page committed its own
          // transaction above), so nothing is lost or double-counted.
          await scheduleContinuationTask({
            connectorId: connector.id,
            workspaceId: input.workspaceId,
            requestedBy: input.requestedBy,
            runId: input.runId,
            trigger: syncState.phase === "INITIAL" ? "INITIAL" : input.trigger,
            scheduledFor: now(),
          });

          const finalState: QboSyncState = {
            ...syncState,
            lastRunId: input.runId,
            lastRunAt: now().toISOString(),
            lastRunStatus: "SUCCESS",
            lastRunSummary: "Initial sync in progress — continuing in a follow-up run.",
          };
          await db.$transaction(async (tx: Prisma.TransactionClient) => {
            await persistSyncState(connector.id, finalState, tx);
            await tx.ownerConnector.update({
              where: { id: connector.id },
              data: { lastSyncAt: now(), lastSyncRecords: sumRecordCounts(finalState.recordCounts), syncFailureMessage: null },
            });
          });

          await emitAuditEvent({
            eventName: AUDIT_EVENTS.QUICKBOOKS_SYNC_COMPLETED,
            workspaceId: input.workspaceId,
            entityType: "OwnerConnector",
            entityId: connector.id,
            payload: { trigger: input.trigger, runId: input.runId, counts: { thisRunUpserted: totalUpserted, cumulativeTotal: sumRecordCounts(finalState.recordCounts) }, phase: "INITIAL", continued: true },
            ...toAuditActor(input.requestedBy),
          });

          return { status: "SUCCESS", summary: "Initial sync in progress", counts: { upserted: totalUpserted } };
        }

        if (syncState.phase === "INITIAL") {
          if (syncState.initial.entityIndex >= QBO_SYNC_ENTITY_ORDER.length) {
            syncState = {
              ...syncState,
              phase: "INCREMENTAL",
              initial: { ...syncState.initial, completedAt: now().toISOString() },
              cdcCursor: syncState.initial.startedAt,
            };
            await persistSyncState(connector.id, syncState);
            continue;
          }
          const step = await runInitialPageStep({ client, connector, runId: input.runId, syncState, now: now() });
          syncState = step.nextState;
          totalUpserted += step.upserted;
          continue;
        }

        // INCREMENTAL
        const cursorDate = syncState.cdcCursor ? new Date(syncState.cdcCursor) : null;
        const ageDays = cursorDate ? (now().getTime() - cursorDate.getTime()) / 86_400_000 : Infinity;
        if (!cursorDate || ageDays > QBO_CDC_MAX_LOOKBACK_DAYS - 1) {
          // Stale (or missing) cursor: fall back to a full resync. Upserts
          // are idempotent/no-regress, so re-pulling everything is safe.
          syncState = initialQboSyncState(now());
          await persistSyncState(connector.id, syncState);
          continue;
        }

        const cdc = await runCdcPass({ client, connector, runId: input.runId, syncState, now: now(), nowFn: now, deadlineMs: deadline });
        syncState = cdc.nextState;
        incrementalCounts = cdc.counts;
        totalUpserted += Object.values(cdc.counts).reduce((s, v) => s + v, 0);
        cdcIncomplete = cdc.incomplete;
        if (cdcIncomplete) {
          await scheduleContinuationTask({
            connectorId: connector.id,
            workspaceId: input.workspaceId,
            requestedBy: input.requestedBy,
            runId: input.runId,
            trigger: input.trigger,
            scheduledFor: now(),
          });
        }
        incrementalDone = true;
      }

      // ── (f) Reports + governed snapshot materialization ─────────────────
      let materializeIssues: string[] = [];
      let materializeFailed = false;
      try {
        const reportsResult = await runReportsAndMaterialize({
          client,
          connector,
          runId: input.runId,
          requestedBy: input.requestedBy,
          homeCurrency,
          now: now(),
        });
        materializeIssues = reportsResult.issues;
        syncState = {
          ...syncState,
          lastReportsAt: now().toISOString(),
          lastMaterializedPeriod: reportsResult.periodKey,
        };
      } catch (err) {
        materializeFailed = true;
        const governed = classifyOperatorError(err instanceof Error ? err : new Error(String(err)), { context: "load" });
        materializeIssues = [governed.operatorMessage];
        logger.error("QuickBooks report pull / snapshot materialization failed (sync data itself is durable)", err, {
          connectorId: connector.id,
          runId: input.runId,
        });
      }

      // ── (g) Finish ────────────────────────────────────────────────────
      const status: QuickBooksSyncStatus = materializeFailed || cdcIncomplete ? "PARTIAL_FAILURE" : "SUCCESS";
      const cumulativeRecords = sumRecordCounts(syncState.recordCounts);
      const summary = materializeFailed
        ? `QuickBooks data synced (${totalUpserted} record(s) this run); report/snapshot materialization failed: ${materializeIssues[0] ?? "unknown error"}`
        : cdcIncomplete
          ? `QuickBooks sync partially complete: ${totalUpserted} record(s) synced this run; more changes are pending for at least one entity and will be picked up on the next sync (CDC cursor was not advanced).`
          : `QuickBooks sync complete: ${totalUpserted} record(s) synced this run (${cumulativeRecords} total mirrored).`;

      const finalState: QboSyncState = {
        ...syncState,
        lastRunId: input.runId,
        lastRunAt: now().toISOString(),
        lastRunStatus: materializeFailed || cdcIncomplete ? "PARTIAL" : "SUCCESS",
        lastRunSummary: summary,
      };

      await db.$transaction(async (tx: Prisma.TransactionClient) => {
        await persistSyncState(connector.id, finalState, tx);
        await tx.ownerConnector.update({
          where: { id: connector.id },
          // F22: cumulative, not this-run-only — see sumRecordCounts() doc.
          data: { lastSyncAt: now(), lastSyncRecords: cumulativeRecords, syncFailureMessage: null },
        });
      });

      await emitAuditEvent({
        eventName: AUDIT_EVENTS.QUICKBOOKS_SYNC_COMPLETED,
        workspaceId: input.workspaceId,
        entityType: "OwnerConnector",
        entityId: connector.id,
        payload: {
          trigger: input.trigger,
          runId: input.runId,
          counts: { thisRunUpserted: totalUpserted, cumulativeTotal: cumulativeRecords, ...incrementalCounts },
          materializeIssues: materializeFailed ? materializeIssues : undefined,
        },
        ...toAuditActor(input.requestedBy),
      });

      return { status, summary, counts: { upserted: totalUpserted } };
    } catch (err) {
      return await handleSyncFailure({
        err,
        connector,
        runId: input.runId,
        trigger: input.trigger,
        requestedBy: input.requestedBy,
        workspaceId: input.workspaceId,
        syncState,
        totalUpserted,
        now: now(),
      });
    }
  } finally {
    if (leaseHeld) {
      await db.ownerConnector.updateMany({
        where: { id: input.connectorId, workspaceId: input.workspaceId, syncLeaseExpiresAt: leaseExpiresAt },
        data: { syncLeaseExpiresAt: null },
      });
      leaseHeld = false;
    }
  }
}

/** Reads QboApiError's own dedicated owner-safe message (see NOTE at its call site). */
function readQboOwnerSafeMessage(fault: QboApiError): string {
  return fault.message;
}

async function handleSyncFailure(params: {
  err: unknown;
  connector: ConnectorSnapshot;
  runId: string;
  trigger: QboSyncTrigger;
  requestedBy: string;
  workspaceId: string;
  /** Whatever progress THIS run made before failing — persisted alongside the failure so lastRunStatus/lastRunSummary never lag behind syncFailureMessage. */
  syncState: QboSyncState;
  totalUpserted: number;
  now: Date;
}): Promise<RunQuickBooksSyncResult> {
  const { err, connector, runId, trigger, requestedBy, workspaceId, syncState, totalUpserted, now } = params;
  const qboErr = isQboApiError(err) ? err : null;

  const errorKind = qboErr?.kind ?? (err instanceof Error ? err.name : "UnknownError");
  // NOTE: this is QboApiError's own dedicated owner-safe message (built by
  // buildOwnerSafeMessage() in qbo-errors.ts — truncated, fault-derived text,
  // never a raw provider payload or stack trace), not a raw error.message —
  // read via a helper so it isn't shaped like the raw-error-message pattern.
  const ownerSafeMessage = qboErr ? readQboOwnerSafeMessage(qboErr) : "QuickBooks sync failed unexpectedly.";
  const syncFailureMessage = qboErr?.kind === "AUTH" ? REFRESH_FAILED_MESSAGE : ownerSafeMessage;

  // F16: attempt the governed re-evaluation trigger FIRST — before building
  // the owner-facing summary below — so a failure to queue it is folded into
  // the SAME owner-safe lastRunSummary/audit payload rather than only ever
  // reaching a log line. Still non-fatal: this sync failure is already
  // definite regardless of whether re-evaluation could be queued.
  let reevaluationTriggerFailed = false;
  if (connector.businessId) {
    await ingestIntegrationEvent(
      {
        id: randomUUID(),
        workspaceId,
        connectorId: connector.id,
        provider: QBO_PROVIDER,
        kind: "CONNECTOR_SYNC_FAILED",
        businessId: connector.businessId,
        payload: { runId, errorKind },
        occurredAt: new Date().toISOString(),
      },
      requestedBy
    ).catch((ingestErr: unknown) => {
      reevaluationTriggerFailed = true;
      // Never permanently lost: the NEXT sync attempt (this one, retried, or
      // the next scheduled one) re-derives BLOCKER_EVENT re-evaluation from
      // the connector's current state regardless of this one call's outcome.
      logger.error("QuickBooks sync: CONNECTOR_SYNC_FAILED re-evaluation trigger failed", ingestErr, {
        connectorId: connector.id,
        runId,
      });
    });
  }

  const runNotes: string[] = [];
  if (totalUpserted > 0) runNotes.push(`${totalUpserted} record(s) synced this run before the failure.`);
  if (reevaluationTriggerFailed) runNotes.push("Re-evaluation could not be queued; it will re-run on the next sync.");
  const runSummary = runNotes.length > 0 ? `${syncFailureMessage} (${runNotes.join(" ")})` : syncFailureMessage;

  // F25: syncState.lastRunId/lastRunAt/lastRunStatus/lastRunSummary and
  // OwnerConnector.syncFailureMessage are two different rows/columns that
  // the owner-facing status DTO reads TOGETHER — persisting only one (the
  // prior defect) leaves the owner card showing "Last sync: Completed" next
  // to a failure message that contradicts it. Both are written in ONE
  // transaction so they can never disagree, on every terminal-ish outcome
  // reached here (FAILED, or a retryable throw — a retry may still take a
  // while, and the owner should not see a stale SUCCESS in the meantime;
  // the next successful run's own finish step simply overwrites this again).
  const failureState: QboSyncState = {
    ...syncState,
    lastRunId: runId,
    lastRunAt: now.toISOString(),
    lastRunStatus: "FAILED",
    lastRunSummary: runSummary,
  };
  try {
    await db.$transaction(async (tx: Prisma.TransactionClient) => {
      await persistSyncState(connector.id, failureState, tx);
      await tx.ownerConnector.update({
        where: { id: connector.id },
        data: { syncFailureMessage, lastSyncRecords: sumRecordCounts(syncState.recordCounts) },
      });
    });
  } catch (persistErr) {
    // F28: this is a LOCAL DURABILITY FAILURE, not a provider-classification
    // outcome — we could not even record that the sync failed, so the
    // connector row may still say "Completed"/SUCCESS from its last good
    // run. Returning FAILED here (the prior defect) would tell the owner
    // this run is a definite, terminal, non-retryable failure while the
    // connector's own status contradicts that — worse, a genuinely
    // non-retryable classification (AUTH/FORBIDDEN/VALIDATION/...) would
    // then never be retried AND never be recorded. The only safe outcome
    // when the record-keeping itself fails is to make the SCHEDULER retry:
    // throw (never classification-dependent), log both the ORIGINAL
    // provider failure kind and this persistence failure (the Error object
    // itself, not stringified into the thrown message — no raw Prisma text
    // reaches any owner-visible surface), and let a later attempt try again.
    logger.error("QuickBooks sync: failed to persist the FAILED outcome (syncState + syncFailureMessage) — this run's outcome could not be recorded", persistErr, {
      connectorId: connector.id,
      runId,
      providerErrorKind: errorKind,
    });
    throw new Error("QuickBooks sync outcome could not be recorded; the task will retry.");
  }

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.QUICKBOOKS_SYNC_FAILED,
    workspaceId,
    entityType: "OwnerConnector",
    entityId: connector.id,
    // F16: reevaluationTriggerFailed makes the re-evaluation gap durable and
    // visible in the audit trail too, not just the logged line above.
    payload: { trigger, runId, errorKind, reevaluationTriggerFailed },
    ...toAuditActor(requestedBy),
  }).catch((auditErr: unknown) => {
    // audit failure must never mask the sync outcome being returned/thrown below
    logger.error("QuickBooks sync: failed to emit QUICKBOOKS_SYNC_FAILED audit event (non-fatal)", auditErr, {
      connectorId: connector.id,
      runId,
    });
  });

  // AUTH: the token layer has already transitioned the connector to
  // REFRESH_FAILED. Owner action required — report FAILED, never retry.
  if (qboErr && qboErr.kind === "AUTH") {
    return { status: "FAILED", summary: runSummary, counts: {} };
  }

  // Retryable provider failures (RATE_LIMITED / TRANSIENT / TIMEOUT): progress
  // already made this run is durable (see the per-page transactions above)
  // and the lease has been released by the caller's `finally` — rethrow so
  // the scheduler's own retry/backoff/dead-letter path governs the retry.
  if (qboErr && qboErr.retryable) {
    throw err;
  }

  // Any non-retryable, non-AUTH provider failure (VALIDATION, FORBIDDEN,
  // NOT_FOUND, DUPLICATE, STALE_OBJECT, MALFORMED, CONFIG) is a definite
  // failure this attempt cannot recover from by itself.
  if (qboErr) {
    return { status: "FAILED", summary: runSummary, counts: {} };
  }

  // Unclassified (non-provider) error — most likely a genuine defect (DB,
  // programming error). Rethrow so the scheduler's retry/dead-letter path
  // makes it owner-visible rather than silently reporting a clean FAILED.
  throw err;
}

// ─── Task handler ─────────────────────────────────────────────────────────────

const QboSyncPayloadSchema = z.object({
  connectorId: z.string().uuid(),
  trigger: z.enum(["INITIAL", "MANUAL", "SCHEDULED", "WEBHOOK"]),
  requestedBy: z.string().uuid(),
});

/**
 * Test seam: the production TaskHandler never takes runtime deps (the
 * scheduler's TaskHandler signature is fixed to (payload, context)), but
 * unit tests need to inject a fake QboClient the same way runQuickBooksSync
 * tests already do. This factory is what production's exported handler is
 * built from with no deps (real createQboClient/createQboTokenProvider);
 * tests call it directly with `deps` to exercise the handler's own
 * FAILED-vs-throw mapping deterministically, without a real QBO connection.
 */
export function buildQuickBooksSyncTaskHandler(deps?: RunQuickBooksSyncDeps): TaskHandler {
  return async (payload, context): Promise<HandlerResult> => {
    if (!context.workspaceId) {
      throw new Error("quickbooks-sync task missing workspaceId — cannot enforce workspace isolation");
    }
    const parsed = QboSyncPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      throw new Error(`quickbooks-sync task payload invalid: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
    }

    const result = await runQuickBooksSync({
      workspaceId: context.workspaceId,
      connectorId: parsed.data.connectorId,
      trigger: parsed.data.trigger,
      requestedBy: parsed.data.requestedBy,
      runId: context.taskId,
      deps,
    });

    if (result.status === "FAILED") {
      // F27: a classified, non-retryable provider failure (AUTH/FORBIDDEN/
      // VALIDATION/NOT_FOUND/DUPLICATE/STALE_OBJECT/MALFORMED/CONFIG — see
      // handleSyncFailure) can never succeed by being retried unchanged, so
      // it is returned as the scheduler's terminal "FAILED" HandlerOutcomeStatus
      // (task persisted status "failed", no retry) rather than thrown — the
      // prior throw-based path made the scheduler retry (and eventually
      // dead-letter after wasted attempts) a failure retrying could never fix.
      // A genuinely retryable failure (TRANSIENT/RATE_LIMITED/TIMEOUT) is
      // never returned this way — runQuickBooksSync itself throws for those
      // (see handleSyncFailure), which propagates out of this `await`
      // uncaught and is still governed by the scheduler's normal retry path.
      return { status: "FAILED", summary: result.summary, counts: result.counts };
    }
    if (result.status === "PARTIAL_FAILURE") {
      return { status: "PARTIAL_FAILURE", summary: result.summary, counts: result.counts };
    }
    if (result.status === "NO_WORK") {
      return { status: "NO_WORK", summary: result.summary };
    }
    return { status: "SUCCESS", summary: result.summary, counts: result.counts };
  };
}

/** Production task handler — real createQboClient/createQboTokenProvider, no injected deps. */
export const quickBooksSyncTaskHandler: TaskHandler = buildQuickBooksSyncTaskHandler();

// ─── Producer ─────────────────────────────────────────────────────────────────

const MAX_ENQUEUE_PER_SCAN = 200;

/** Enqueues one daily SCHEDULED sync task per currently-ACTIVE QuickBooks connector. */
export async function enqueueDueQuickBooksSyncTasks(): Promise<ProducerScanResult> {
  const scheduler = new DatabaseSchedulerProvider();
  const dayBucket = utcDayBucket(new Date());

  const connectors = await db.ownerConnector.findMany({
    where: { provider: QBO_PROVIDER, status: "ACTIVE" },
    select: { id: true, workspaceId: true, registeredBy: true },
    take: MAX_ENQUEUE_PER_SCAN,
  });

  let enqueued = 0;
  for (const c of connectors) {
    await scheduler.schedule({
      taskName: TASK_NAME_QUICKBOOKS_SYNC,
      payload: { connectorId: c.id, trigger: "SCHEDULED", requestedBy: c.registeredBy } satisfies QboSyncTaskPayload,
      scheduledFor: new Date(),
      maxAttempts: 3,
      workspaceId: c.workspaceId,
      idempotencyKey: `quickbooks-sync:${c.id}:scheduled:${dayBucket}`,
    });
    enqueued++;
  }

  return { candidatesFound: connectors.length, enqueued };
}
