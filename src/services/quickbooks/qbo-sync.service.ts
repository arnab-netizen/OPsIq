/**
 * QuickBooks Online V1 — the read-only synchronisation orchestrator for ONE connection.
 *
 *   resolve ACTIVE connection -> check environment -> per-connection lock -> usable token -> for each planned closed month:
 *   read the four reports (GET only) -> parse -> persist versioned observations -> materialize canonical evidence ->
 *   advance the progress cursor -> record bounded state.
 *
 * Safety properties
 *   - READ-ONLY: the only provider calls are GETs through createQboReadClient (OAuth token calls aside). No write-back exists.
 *   - One sync per connection at a time (advisory lock, qbo-connection-lock "sync"); a concurrent caller is told SKIPPED/LOCKED.
 *   - Progress (qbo_sync_state.baseline_cursor, last_success_at) moves only AFTER a month's observations AND its materialization
 *     have committed, so an interrupted run resumes at the first unfinished month and re-reading is idempotent.
 *   - Failure policy: transient provider errors are recorded and RETHROWN (the scheduler retries with backoff); a revoked/expired
 *     grant marks the connection REAUTH_REQUIRED and is terminal; malformed/unsupported responses are terminal for this run
 *     (tomorrow's run tries again); lease loss (abort) stops cleanly with no state change.
 *   - Nothing here logs a token, a provider body or a report value; summaries contain counts and bounded codes only.
 */
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { logger } from "@/infra/logger";
import { resolveQboConfig, type QboProviderConfig } from "@/domain/quickbooks/qbo-config";
import { isQboProviderError, type QboProviderError } from "@/domain/quickbooks/qbo-errors";
import { QBO_REPORT_API_NAME, QBO_V1_DEFAULT_BASIS, fromIsoDate, toIsoDate, type MonthPeriod, type QboReportType } from "@/domain/quickbooks/qbo-report-model";
import { isQboReportParseError, parseQboReport, type QboParsedReport } from "@/domain/quickbooks/qbo-report-parser";
import { cursorAfterMonth, planSyncRun, type QboRunKind } from "@/domain/quickbooks/qbo-sync-plan";
import type { QboReportParams } from "@/domain/quickbooks/qbo-read-catalog";
import { createQboReadClient, type QboReadClient } from "./qbo-client";
import { markQboReauthorizationRequired } from "./qbo-connection.service";
import { withQboConnectionLock, type QboLockHandle } from "./qbo-connection-lock";
import { recordQboObservation, type QboConnectionIdentity } from "./qbo-observation.service";
import { materializeQboMonth, type MaterializeMonthResult } from "./qbo-materialization.service";
import { QboConnectionNotActiveError, QboReauthRequiredError, createQboTokenProvider } from "./qbo-token-manager";
import type { QboFetch } from "./qbo-http";

type Tx = Prisma.TransactionClient;

export type QboSyncTrigger = "SCHEDULED" | "WEBHOOK" | "OWNER" | "CONTINUATION";

export interface QboSyncDeps {
  env: Record<string, string | undefined>;
  now?: () => Date;
  fetchImpl?: QboFetch;
  signal?: AbortSignal;
  client?: typeof db;
  /** Test seam: replaces the HTTP-backed read client. */
  readClientFactory?: (args: { config: QboProviderConfig; realmId: string; getAccessToken: () => Promise<string>; onAuthExpired: () => Promise<string | null> }) => QboReadClient;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

export interface QboSyncCounts {
  monthsPlanned: number;
  monthsCompleted: number;
  observationsCreated: number;
  observationsConfirmed: number;
  canonicalCreated: number;
  canonicalAmended: number;
  canonicalUpdated: number;
  ownerControlled: number;
  refused: number;
  /** Per-reason refusal counts (present only when something was refused). */
  refusals?: Record<string, number>;
}

export type QboSyncOutcome =
  | { status: "SYNCED"; kind: QboRunKind; counts: QboSyncCounts; moreWork: boolean; nextCursor: string | null }
  | { status: "SKIPPED"; reason: "LOCKED" | "NOT_ACTIVE" | "NOT_FOUND" | "ENVIRONMENT_MISMATCH" }
  | { status: "REAUTH_REQUIRED" }
  | { status: "FAILED"; code: string; counts: QboSyncCounts }
  | { status: "CANCELLED"; counts: QboSyncCounts };

const emptyCounts = (): QboSyncCounts => ({
  monthsPlanned: 0, monthsCompleted: 0, observationsCreated: 0, observationsConfirmed: 0,
  canonicalCreated: 0, canonicalAmended: 0, canonicalUpdated: 0, ownerControlled: 0, refused: 0,
});

/** Lease of the per-connection sync lock; renewed before every month (a run is at most QBO_MONTHS_PER_RUN months x 4 reports). */
const SYNC_LOCK_TTL_MS = 180_000;

function reportParams(reportType: QboReportType, month: MonthPeriod, basis: string): QboReportParams {
  const method = basis === "CASH" ? "Cash" : "Accrual";
  switch (reportType) {
    case "PROFIT_AND_LOSS": return { start_date: month.start, end_date: month.end, accounting_method: method };
    case "BALANCE_SHEET": return { start_date: month.start, end_date: month.end, accounting_method: method };
    // Aging buckets: Current, 1-30, 31-60, 61-90, 91+ (aging_period 30 x num_periods 4) as of the month end.
    case "AGED_RECEIVABLES":
    case "AGED_PAYABLES": return { report_date: month.end, aging_period: 30, num_periods: 4 };
  }
}

const REPORT_ORDER: readonly QboReportType[] = ["PROFIT_AND_LOSS", "BALANCE_SHEET", "AGED_RECEIVABLES", "AGED_PAYABLES"];

/** Terminal (non-retryable) provider outcomes: retrying cannot change them. */
function failureCode(e: QboProviderError): string {
  return e.kind;
}

async function ensureSyncState(client: typeof db, c: QboConnectionIdentity) {
  return client.qboSyncState.upsert({
    where: { connectionId: c.id },
    create: { connectionId: c.id, workspaceId: c.workspaceId, businessId: c.businessId, lifecycle: "NEVER_SYNCED" },
    update: {},
  });
}

async function recordFailure(client: typeof db, c: QboConnectionIdentity, code: string, now: Date, summary: Record<string, unknown>): Promise<void> {
  const prior = await client.qboSyncState.findUnique({ where: { connectionId: c.id }, select: { consecutiveFailures: true, lastErrorCode: true } });
  const updated = await client.qboSyncState.update({
    where: { connectionId: c.id },
    data: { lifecycle: "FAILING", lastFailureAt: now, lastErrorCode: code, consecutiveFailures: { increment: 1 }, lastRunSummary: summary as Prisma.InputJsonValue, version: { increment: 1 } },
  });
  // One audit event per failure STREAK (or a changed cause), not one per retry.
  if ((prior?.consecutiveFailures ?? 0) === 0 || prior?.lastErrorCode !== code) {
    await emitAuditEvent({
      eventName: AUDIT_EVENTS.QBO_SYNC_FAILED, workspaceId: c.workspaceId, actorType: "system", entityType: "qbo_connection", entityId: c.id,
      visibility: "internal", payload: { businessId: c.businessId, code, consecutiveFailures: updated.consecutiveFailures },
    }, client);
  }
}

export async function runQboSync(
  input: { workspaceId: string; connectionId: string; trigger: QboSyncTrigger },
  deps: QboSyncDeps,
): Promise<QboSyncOutcome> {
  const client = deps.client ?? db;

  const row = await client.qboConnection.findFirst({
    where: { id: input.connectionId, workspaceId: input.workspaceId },
    select: { id: true, workspaceId: true, businessId: true, environment: true, realmId: true, status: true },
  });
  if (!row) return { status: "SKIPPED", reason: "NOT_FOUND" };
  if (row.status !== "ACTIVE") return { status: "SKIPPED", reason: "NOT_ACTIVE" };

  const conn: QboConnectionIdentity = {
    id: row.id, workspaceId: row.workspaceId, businessId: row.businessId,
    environment: row.environment as "sandbox" | "production", realmId: row.realmId,
  };
  const resolved = resolveQboConfig(deps.env);
  if (!resolved.available) {
    // Visible to the owner as a sync problem instead of a connection stuck on "Connecting".
    await ensureSyncState(client, conn);
    await recordFailure(client, conn, "CONFIGURATION_UNAVAILABLE", (deps.now ?? (() => new Date()))(), { kind: "NONE", at: (deps.now ?? (() => new Date()))().toISOString() });
    return { status: "FAILED", code: "CONFIGURATION_UNAVAILABLE", counts: emptyCounts() };
  }
  const config = resolved.config;
  if (config.environment !== row.environment) return { status: "SKIPPED", reason: "ENVIRONMENT_MISMATCH" };

  const locked = await withQboConnectionLock("sync", conn.workspaceId, conn.id, (lock) => syncLocked(conn, config, input.trigger, deps, lock), {
    ttlMs: SYNC_LOCK_TTL_MS, client,
  });
  if (!locked.acquired) return { status: "SKIPPED", reason: "LOCKED" };
  return locked.value;
}

async function syncLocked(conn: QboConnectionIdentity, config: QboProviderConfig, trigger: QboSyncTrigger, deps: QboSyncDeps, lock: QboLockHandle): Promise<QboSyncOutcome> {
  const client = deps.client ?? db;
  const nowFn = deps.now ?? (() => new Date());
  const started = nowFn();
  const counts = emptyCounts();
  const log = { workspaceId: conn.workspaceId, businessId: conn.businessId, connectionId: conn.id, trigger };

  const state = await ensureSyncState(client, conn);
  const wasFailing = state.consecutiveFailures > 0;
  // Claim any pending webhook request: this run satisfies it (a webhook arriving mid-run re-arms the flag).
  await client.qboSyncState.update({ where: { connectionId: conn.id }, data: { lastAttemptAt: started, webhookPendingAt: null } });

  const plan = planSyncRun({
    now: started,
    baselineCompletedAt: state.baselineCompletedAt,
    baselineCursor: state.baselineCursor ? toIsoDate(state.baselineCursor) : null,
    lastFullReconcileAt: state.lastFullReconcileAt,
  });
  counts.monthsPlanned = plan.months.length;

  const tokens = createQboTokenProvider({
    workspaceId: conn.workspaceId, connectionId: conn.id, config, fetchImpl: deps.fetchImpl, signal: deps.signal, now: deps.now, client,
  });
  let lastToken = "";
  const factory = deps.readClientFactory ?? ((a) => createQboReadClient({ config: a.config, realmId: a.realmId, getAccessToken: a.getAccessToken, onAuthExpired: a.onAuthExpired, fetchImpl: deps.fetchImpl, signal: deps.signal, sleep: deps.sleep }));
  const reader = factory({
    config, realmId: conn.realmId,
    getAccessToken: async () => (lastToken = await tokens.getAccessToken()),
    onAuthExpired: async () => (lastToken = await tokens.refreshAfterRejection(lastToken)),
  });

  try {
    if (!state.companyName) {
      const info = await reader.companyInfo({ signal: deps.signal });
      const name = typeof info.CompanyName === "string" ? info.CompanyName.trim().slice(0, 200) : "";
      if (name) await client.qboSyncState.update({ where: { connectionId: conn.id }, data: { companyName: name } });
    }

    for (let i = 0; i < plan.months.length; i++) {
      if (deps.signal?.aborted) return { status: "CANCELLED", counts };
      // Still the holder? A lock lost to expiry means another worker may be running: stop before any further side effect.
      if (!(await lock.renew())) return { status: "CANCELLED", counts };
      const month = plan.months[i];
      const parsed = await readMonth(reader, month, deps.signal, () => lock.renew());
      if (!parsed) return { status: "CANCELLED", counts };

      // 1) observations (all four commit together or not at all)
      await client.$transaction(async (tx: Tx) => {
        for (const p of parsed.reports) {
          const r = await recordQboObservation(tx, { connection: conn, parsed: p.parsed, requestedBasis: QBO_V1_DEFAULT_BASIS, providerTid: p.tid, now: nowFn() });
          if (r.outcome === "CREATED") counts.observationsCreated++;
          else counts.observationsConfirmed++;
        }
      }, { timeout: 30_000 });

      // 2) canonical evidence for the month (its own atomic transaction per target)
      const mat = await materializeQboMonth({ connection: conn, month, expectedBasis: QBO_V1_DEFAULT_BASIS }, { client, now: nowFn });
      tally(counts, mat);

      // 3) progress moves only now (and only while this worker still holds the lock, so a late write can't regress the cursor)
      if (!(await lock.renew())) return { status: "CANCELLED", counts };
      const cursorAfter = cursorAfterMonth(plan, i);
      if (plan.kind !== "REFRESH") {
        await client.qboSyncState.update({ where: { connectionId: conn.id }, data: { baselineCursor: cursorAfter ? fromIsoDate(cursorAfter) : null } });
      }
      counts.monthsCompleted++;
    }

    const finished = nowFn();
    const baselineJustCompleted = plan.completesPass && plan.kind === "BASELINE";
    await client.qboSyncState.update({
      where: { connectionId: conn.id },
      data: {
        lifecycle: plan.kind === "BASELINE" && !plan.completesPass ? "BASELINING" : "SYNCED",
        lastSuccessAt: finished, lastErrorCode: null, consecutiveFailures: 0,
        ...(plan.completesPass ? { lastFullReconcileAt: finished, baselineCursor: null } : {}),
        ...(baselineJustCompleted ? { baselineCompletedAt: finished } : {}),
        lastRunSummary: { kind: plan.kind, trigger, ...counts, at: finished.toISOString() } as unknown as Prisma.InputJsonValue,
        version: { increment: 1 },
      },
    });
    if (baselineJustCompleted) {
      await emitAuditEvent({ eventName: AUDIT_EVENTS.QBO_BASELINE_COMPLETED, workspaceId: conn.workspaceId, actorType: "system", entityType: "qbo_connection", entityId: conn.id, visibility: "internal", payload: { businessId: conn.businessId, ...counts } }, client);
    }
    if (wasFailing) {
      await emitAuditEvent({ eventName: AUDIT_EVENTS.QBO_SYNC_RECOVERED, workspaceId: conn.workspaceId, actorType: "system", entityType: "qbo_connection", entityId: conn.id, visibility: "internal", payload: { businessId: conn.businessId, previousFailures: state.consecutiveFailures } }, client);
    }
    logger.info("QBO sync complete", { ...log, kind: plan.kind, ...counts });
    return { status: "SYNCED", kind: plan.kind, counts, moreWork: !plan.completesPass, nextCursor: plan.cursorAfter };
  } catch (e) {
    return handleFailure(e, conn, counts, plan.kind, started, deps, log);
  }
}

function tally(counts: QboSyncCounts, mat: MaterializeMonthResult): void {
  for (const t of [mat.finance, mat.cashflow]) {
    if (t.result === "CREATED") counts.canonicalCreated++;
    else if (t.result === "AMENDED") counts.canonicalAmended++;
    else if (t.result === "UPDATED") counts.canonicalUpdated++;
    else if (t.result === "OWNER_CONTROLLED") counts.ownerControlled++;
    else if (t.result === "REFUSED") {
      counts.refused++;
      counts.refusals = { ...(counts.refusals ?? {}), [t.refusal]: ((counts.refusals ?? {})[t.refusal] ?? 0) + 1 };
    }
  }
}

async function readMonth(
  reader: QboReadClient,
  month: MonthPeriod,
  signal: AbortSignal | undefined,
  renew: () => Promise<boolean>,
): Promise<{ reports: Array<{ parsed: QboParsedReport; tid: string | null }> } | null> {
  const reports: Array<{ parsed: QboParsedReport; tid: string | null }> = [];
  for (const reportType of REPORT_ORDER) {
    // Each report can take long (timeouts, Retry-After): keep the lease, and stop if it was lost.
    if (!(await renew())) return null;
    const period = reportType === "PROFIT_AND_LOSS" ? { start: month.start, end: month.end } : { start: month.end, end: month.end };
    const { body, intuitTid } = await reader.reportWithMeta(QBO_REPORT_API_NAME[reportType], reportParams(reportType, month, QBO_V1_DEFAULT_BASIS), { signal });
    reports.push({ parsed: parseQboReport(reportType, body, period), tid: intuitTid });
  }
  return { reports };
}

async function handleFailure(
  e: unknown,
  conn: QboConnectionIdentity,
  counts: QboSyncCounts,
  kind: QboRunKind,
  started: Date,
  deps: QboSyncDeps,
  log: Record<string, unknown>,
): Promise<QboSyncOutcome> {
  const client = deps.client ?? db;
  const now = (deps.now ?? (() => new Date()))();
  const summary = { kind, ...counts, at: now.toISOString() };

  if (e instanceof QboReauthRequiredError) {
    await recordFailure(client, conn, "REAUTH_REQUIRED", now, summary);
    return { status: "REAUTH_REQUIRED" };
  }
  if (e instanceof QboConnectionNotActiveError) {
    // Disconnected (or re-authorised elsewhere) while running: nothing to record against a dead connection.
    return { status: "SKIPPED", reason: "NOT_ACTIVE" };
  }
  if (isQboProviderError(e)) {
    if (e.kind === "CANCELLED") return { status: "CANCELLED", counts };
    // A fresh token that is still rejected, or an access refusal, needs the owner: surface it as reauthorization.
    if (e.kind === "AUTH_EXPIRED" || e.kind === "FORBIDDEN" || e.kind === "REFRESH_INVALID") {
      await markQboReauthorizationRequired({ workspaceId: conn.workspaceId, connectionId: conn.id, reasonCode: e.kind === "FORBIDDEN" ? "ACCESS_REFUSED" : "TOKEN_REJECTED" }, { client });
      await recordFailure(client, conn, "REAUTH_REQUIRED", now, summary);
      return { status: "REAUTH_REQUIRED" };
    }
    const code = failureCode(e);
    await recordFailure(client, conn, code, now, summary);
    logger.warn("QBO sync provider failure", { ...log, code, httpStatus: e.httpStatus ?? null, intuitTid: e.intuitTid ?? null });
    if (e.retryable) throw e; // the scheduler retries with backoff
    return { status: "FAILED", code, counts };
  }
  if (isQboReportParseError(e)) {
    const code = `REPORT_${e.code}`.slice(0, 64);
    await recordFailure(client, conn, code, now, summary);
    logger.warn("QBO report could not be interpreted", { ...log, code, figure: e.figure ?? null });
    return { status: "FAILED", code, counts };
  }
  await recordFailure(client, conn, "INTERNAL_ERROR", now, summary);
  throw e;
}
