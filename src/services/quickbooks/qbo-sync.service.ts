/**
 * QuickBooks Online — READ-ONLY sync orchestration.
 *
 * One entry point, runQboReadSync(), used by the manual owner route, the scheduler handler and the webhook-triggered
 * task. Authority comes only from the caller's verified (workspaceId, businessId, connectionId); the realm,
 * environment, tokens and base URL are all server-side facts recovered from the connection row and configuration.
 *
 * Order: configuration -> tenant-safe connection resolution (ACTIVE, eligible business, environment matches
 * configuration) -> due-gating (scheduled/webhook only) -> deterministic mode -> atomic replay/lease/run creation ->
 * usable token (decrypt + refresh-if-needed) -> GET-only reads -> normalize -> fenced persistence -> atomic finish.
 *
 * PROVIDER-WRITE IMPOSSIBILITY BY CONSTRUCTION: the only provider handle this module obtains is a QboReadClient from
 * createQboReadClient(). That client has no create/update/delete/void/batch method and issues only HTTP GET (enforced
 * by qbo-client.ts and machine-checked by qbo-foundation-boundaries.test.ts). This module never builds a URL, a verb or a
 * request body itself, and it does not import the OAuth module's POST helpers except through the token-access service.
 *
 * Nothing here logs, and no token, provider body or realm appears in a result, audit payload or error.
 */
import { randomUUID } from "crypto";
import { resolveQboConfig, type QboProviderConfig } from "@/domain/quickbooks/qbo-config";
import { createQboReadClient, type QboReadClient } from "./qbo-client";
import type { QboQuerySpec } from "@/domain/quickbooks/qbo-read-catalog";
import {
  QBO_SYNC_MAX_PAGES_PER_ENTITY,
  QBO_SYNC_PAGE_SIZE,
  QBO_SYNC_QUERY_ENTITIES,
  QBO_SYNC_REPORT_MONTHS,
  chooseSyncMode,
  completeMonthPeriods,
  emptySyncCounts,
  incrementalLowerBound,
  isTerminalSyncFailure,
  syncFailureFromError,
  syncIdempotencyKey,
  toQboInstant,
  utcDate,
  type QboSyncCounts,
  type QboSyncFailureCode,
  type QboSyncMode,
  type QboSyncOutcome,
  type QboSyncTrigger,
} from "@/domain/quickbooks/qbo-sync-model";
import {
  contentHash,
  dedupeRecords,
  normalizeCompanyInfo,
  normalizeQueryRecord,
  parseAgedReport,
  parseBalanceSheet,
  parseProfitAndLoss,
  type NormalizedRecord,
  type ParsedReport,
  type ReportParseResult,
} from "@/domain/quickbooks/qbo-normalize";
import { markQboReauthorizationRequired, type QboPersistenceDeps } from "./qbo-connection.service";
import { getUsableQboAccessToken } from "./qbo-token-access.service";
import {
  QboLeaseLostError,
  beginSyncRun,
  finishSyncRunFailure,
  finishSyncRunSuccess,
  markUnseenRecordsMissing,
  parseWatermarks,
  persistRecordsPage,
  persistReportObservation,
  readSyncState,
  resolveConnectionScope,
  resolveSyncableConnection,
  type SyncLease,
} from "./qbo-sync-store.service";
import type { QboRealmRateLimiter } from "./qbo-rate-limiter";

type QboClientFetch = NonNullable<Parameters<typeof createQboReadClient>[0]["fetchImpl"]>;

export interface QboSyncDeps extends QboPersistenceDeps {
  /** Environment record (the caller passes process.env). This module never reads process.env itself. */
  env: Record<string, string | undefined>;
  fetchImpl?: QboClientFetch;
  limiter?: QboRealmRateLimiter;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  random?: () => number;
  /** Cancels provider waits/requests (e.g. a scheduler TaskContext.signal). */
  signal?: AbortSignal;
  uuid?: () => string;
  /** Test seam: replaces the resolved provider configuration. */
  configOverride?: QboProviderConfig;
  /** Read-client tuning (deadline / retry budget). Defaults are the client's own. */
  clientOptions?: { timeoutMs?: number; maxRetries?: number; maxBackoffMs?: number };
}

export interface RunQboSyncInput {
  workspaceId: string;
  businessId: string;
  connectionId: string;
  trigger: QboSyncTrigger;
  /** The human actor for MANUAL; null for SCHEDULED/WEBHOOK (recorded as a system actor). */
  actorId: string | null;
  /** MANUAL only: repeating the same id replays the same run. */
  requestId?: string | null;
  /** Service-level only (never exposed by a route): force a FULL or INCREMENTAL read. */
  modeOverride?: QboSyncMode;
}

const REAUTH_REASON_ACCESS_REJECTED = "ACCESS_REJECTED";

function failed(code: QboSyncFailureCode, runId: string | null, nextAttemptNotBefore: Date | null = null): QboSyncOutcome {
  return { status: "FAILED", runId, code, terminal: isTerminalSyncFailure(code), nextAttemptNotBefore };
}

export async function runQboReadSync(input: RunQboSyncInput, deps: QboSyncDeps): Promise<QboSyncOutcome> {
  const now = (deps.now ?? (() => new Date()))();
  const scope = { workspaceId: input.workspaceId, businessId: input.businessId, connectionId: input.connectionId };

  // 1. configuration
  let config: QboProviderConfig;
  if (deps.configOverride) config = deps.configOverride;
  else {
    const resolved = resolveQboConfig(deps.env);
    if (!resolved.available) return failed("CONFIGURATION_UNAVAILABLE", null);
    config = resolved.config;
  }

  // 2. tenant-safe connection resolution
  const connection = await resolveSyncableConnection(scope, deps);
  if (!connection) return failed("CONNECTION_NOT_FOUND", null);
  if (connection.status === "REAUTH_REQUIRED") return failed("REAUTH_REQUIRED", null);
  if (connection.status !== "ACTIVE" || !connection.businessEligible) return failed("CONNECTION_NOT_ACTIVE", null);
  if (connection.environment !== config.environment) return failed("ENVIRONMENT_MISMATCH", null);

  // 3. due-gating and mode
  const state = await readSyncState(scope, deps);
  if (input.trigger !== "MANUAL" && state?.nextAttemptNotBefore && state.nextAttemptNotBefore.getTime() > now.getTime()) {
    return { status: "NOT_DUE", nextAttemptNotBefore: state.nextAttemptNotBefore };
  }
  const watermarks = parseWatermarks(state?.watermarks);
  const mode = input.modeOverride ?? chooseSyncMode({ now, watermarks, lastFullSyncAt: state?.lastFullSyncAt ?? null });

  // 4. atomic replay / lease / run
  const idempotencyKey = syncIdempotencyKey(input.trigger, now, input.requestId ?? null, state?.consecutiveFailures ?? 0, deps.uuid ?? randomUUID);
  const begun = await beginSyncRun({ ...scope, trigger: input.trigger, mode, idempotencyKey, requestedById: input.actorId }, deps);
  if (!begun.ok) {
    if (begun.reason === "BUSY") return { status: "BUSY", runId: begun.runId, leaseExpiresAt: begun.leaseExpiresAt };
    return { status: "ALREADY_COMPLETED", runId: begun.runId, runStatus: begun.runStatus };
  }
  const lease = begun.lease;
  const counts = emptySyncCounts();

  try {
    const changed = await executeReads({ lease, connection, config, mode, watermarks, counts, now, input, deps });
    const newWatermarks = Object.fromEntries(QBO_SYNC_QUERY_ENTITIES.map((e) => [e, now.toISOString()]));
    await finishSyncRunSuccess({ lease, mode, startedAt: now, counts, changed, watermarks: newWatermarks, actorId: input.actorId }, deps);
    return { status: "SUCCEEDED", runId: lease.runId, mode, counts, changed };
  } catch (e) {
    if (e instanceof QboLeaseLostError) return failed("LEASE_LOST", lease.runId);
    const mapped = e instanceof SyncFailure ? { code: e.code, retryAfterMs: null } : syncFailureFromError(e);
    try {
      if (mapped.code === "REAUTH_REQUIRED") {
        // An access token rejected even after a forced refresh, or a dead refresh token: the owner must reconnect.
        await markQboReauthorizationRequired({ workspaceId: lease.workspaceId, connectionId: lease.connectionId, reasonCode: REAUTH_REASON_ACCESS_REJECTED }, deps);
      }
      const done = await finishSyncRunFailure({ lease, code: mapped.code, counts, retryAfterMs: mapped.retryAfterMs, actorId: input.actorId }, deps);
      return failed(mapped.code, lease.runId, done.nextAttemptNotBefore);
    } catch (finishError) {
      if (finishError instanceof QboLeaseLostError) return failed("LEASE_LOST", lease.runId);
      throw finishError;
    }
  }
}

/** An orchestration-level failure that already carries a closed code. */
class SyncFailure extends Error {
  constructor(readonly code: QboSyncFailureCode) {
    super(code);
    this.name = "SyncFailure";
  }
}

interface ExecuteArgs {
  lease: SyncLease;
  connection: { realmId: string };
  config: QboProviderConfig;
  mode: QboSyncMode;
  watermarks: Record<string, Date>;
  counts: QboSyncCounts;
  now: Date;
  input: RunQboSyncInput;
  deps: QboSyncDeps;
}

async function executeReads(a: ExecuteArgs): Promise<boolean> {
  const { lease, connection, config, mode, watermarks, counts, now, deps } = a;
  let changed = false;

  // Token: decrypted in memory only; refresh (if needed) goes through the CAS-fenced rotation.
  const tokenDeps = { ...deps, config };
  const first = await getUsableQboAccessToken({ workspaceId: lease.workspaceId, connectionId: lease.connectionId }, tokenDeps);
  if (!first.ok) throw new SyncFailure(first.code);
  if (first.realmId !== connection.realmId) throw new SyncFailure("COMPANY_MISMATCH");
  let accessToken = first.accessToken;
  let forcedRefreshUsed = false;

  const abort = new AbortController();
  const onParentAbort = () => abort.abort();
  // An already-aborted parent never fires "abort" again, so honour it explicitly.
  if (deps.signal?.aborted) abort.abort();
  else deps.signal?.addEventListener("abort", onParentAbort, { once: true });
  try {
    const client: QboReadClient = createQboReadClient({
      config,
      realmId: connection.realmId,
      getAccessToken: async () => accessToken,
      // At most ONE forced refresh per sync: a second rejection is terminal (REAUTH_REQUIRED), never a loop.
      onAuthExpired: async () => {
        if (forcedRefreshUsed) return null;
        forcedRefreshUsed = true;
        const again = await getUsableQboAccessToken({ workspaceId: lease.workspaceId, connectionId: lease.connectionId, forceRefresh: true }, tokenDeps);
        if (!again.ok) return null;
        accessToken = again.accessToken;
        return again.accessToken;
      },
      fetchImpl: deps.fetchImpl,
      limiter: deps.limiter,
      sleep: deps.sleep,
      random: deps.random,
      signal: abort.signal,
      ...deps.clientOptions,
    });

    // CompanyInfo establishes identity: the company must be the realm this connection is bound to.
    const info = await client.companyInfo();
    const company = normalizeCompanyInfo(info, connection.realmId);
    if (!company.ok) throw new SyncFailure("PROVIDER_MALFORMED");
    if (company.record.normalized.reportedRealmId !== null && company.record.normalized.reportedRealmId !== connection.realmId) {
      throw new SyncFailure("COMPANY_MISMATCH");
    }
    changed = (await persistPage(lease, [company.record], counts, deps)) || changed;

    for (const entity of QBO_SYNC_QUERY_ENTITIES) {
      const lower = incrementalLowerBound(mode, watermarks[entity]);
      const where: NonNullable<QboQuerySpec["where"]> = [
        ...(lower ? [{ field: "MetaData.LastUpdatedTime", op: ">=" as const, value: toQboInstant(lower) }] : []),
        // Fixed upper bound: records changing while we page are picked up by the next run (watermark = this cutoff).
        { field: "MetaData.LastUpdatedTime", op: "<=" as const, value: toQboInstant(now) },
      ];
      const pages = client.paginate(
        { entity, where, orderBy: { field: "MetaData.LastUpdatedTime", direction: "ASC" }, maxResults: QBO_SYNC_PAGE_SIZE },
        { maxPages: QBO_SYNC_MAX_PAGES_PER_ENTITY },
      );
      for await (const page of pages) {
        const normalized: NormalizedRecord[] = [];
        for (const raw of page.records) {
          const n = normalizeQueryRecord(entity, raw);
          if (n.ok) normalized.push(n.record);
          else counts.skipped++;
        }
        counts.fetched[entity] = (counts.fetched[entity] ?? 0) + page.records.length;
        changed = (await persistPage(lease, dedupeRecords(normalized), counts, deps)) || changed;
      }
      if (mode === "FULL") {
        const missing = await markUnseenRecordsMissing(lease, entity, deps);
        if (missing > 0) changed = true;
      }
    }

    changed = (await readReports(client, lease, counts, now, deps)) || changed;
    return changed;
  } finally {
    deps.signal?.removeEventListener("abort", onParentAbort);
    abort.abort();
  }
}

async function persistPage(lease: SyncLease, records: NormalizedRecord[], counts: QboSyncCounts, deps: QboSyncDeps): Promise<boolean> {
  const r = await persistRecordsPage(lease, records, deps);
  counts.inserted += r.inserted;
  counts.updated += r.updated;
  counts.unchanged += r.unchanged;
  counts.skipped += r.stale;
  return r.inserted > 0 || r.updated > 0;
}

interface ReportJob {
  name: "ProfitAndLoss" | "BalanceSheet" | "AgedReceivables" | "AgedPayables";
  params: Record<string, string>;
  periodStart: string;
  periodEnd: string;
  parse: (body: unknown) => ReportParseResult;
}

function planReports(now: Date): ReportJob[] {
  const jobs: ReportJob[] = [];
  for (const p of completeMonthPeriods(now, QBO_SYNC_REPORT_MONTHS)) {
    jobs.push({ name: "ProfitAndLoss", params: { start_date: p.start, end_date: p.end, accounting_method: "Accrual" }, periodStart: p.start, periodEnd: p.end, parse: parseProfitAndLoss });
    // A balance sheet is a point in time: observed at period end.
    jobs.push({ name: "BalanceSheet", params: { start_date: p.start, end_date: p.end, accounting_method: "Accrual" }, periodStart: p.end, periodEnd: p.end, parse: parseBalanceSheet });
  }
  const today = utcDate(now);
  jobs.push({ name: "AgedReceivables", params: { report_date: today }, periodStart: today, periodEnd: today, parse: parseAgedReport });
  jobs.push({ name: "AgedPayables", params: { report_date: today }, periodStart: today, periodEnd: today, parse: parseAgedReport });
  return jobs;
}

async function readReports(client: QboReadClient, lease: SyncLease, counts: QboSyncCounts, now: Date, deps: QboSyncDeps): Promise<boolean> {
  let changed = false;
  for (const job of planReports(now)) {
    const body = await client.report(job.name, job.params);
    const parsed = job.parse(body);
    if (!parsed.ok) throw new SyncFailure("PROVIDER_MALFORMED");
    const report: ParsedReport = parsed.report;
    // The provider must answer for the period that was asked, otherwise the numbers would be filed under the wrong date.
    if (job.name === "ProfitAndLoss" && report.endPeriod !== null && report.endPeriod !== job.periodEnd) {
      throw new SyncFailure("PROVIDER_MALFORMED");
    }
    const basis = report.basis ?? (job.params.accounting_method ?? "Accrual");
    const result = await persistReportObservation(
      lease,
      {
        reportName: job.name,
        periodStart: new Date(`${job.periodStart}T00:00:00Z`),
        periodEnd: new Date(`${job.periodEnd}T00:00:00Z`),
        basis,
        currency: report.currency,
        metrics: report.metrics,
        inconsistencies: report.inconsistencies,
        contentHash: contentHash({ metrics: report.metrics, inconsistencies: report.inconsistencies, currency: report.currency }),
        providerGeneratedAt: report.generatedAt,
      },
      deps,
    );
    counts.reportsStored++;
    if (result.changed) {
      counts.reportsChanged++;
      changed = true;
    }
  }
  return changed;
}

/**
 * Scheduler / webhook entry: the workspace comes from the claimed task row and the business from the connection row —
 * neither from the payload. A connection that does not belong to the workspace is CONNECTION_NOT_FOUND.
 */
export async function runScheduledQboSync(
  input: { workspaceId: string; connectionId: string; trigger: "SCHEDULED" | "WEBHOOK" },
  deps: QboSyncDeps,
): Promise<QboSyncOutcome> {
  const scope = await resolveConnectionScope({ workspaceId: input.workspaceId, connectionId: input.connectionId }, deps);
  if (!scope) return failed("CONNECTION_NOT_FOUND", null);
  return runQboReadSync({ ...scope, trigger: input.trigger, actorId: null }, deps);
}
