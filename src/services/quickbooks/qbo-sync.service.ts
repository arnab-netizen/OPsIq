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
import { isQboProviderError } from "@/domain/quickbooks/qbo-errors";
import type { QboQuerySpec } from "@/domain/quickbooks/qbo-read-catalog";
import {
  QBO_SYNC_MANUAL_COOLDOWN_MS,
  evaluateDueGate,
  QBO_SYNC_MAX_PAGES_PER_ENTITY,
  QBO_SYNC_MISSING_CONFIRMATIONS_PER_ENTITY,
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
  extendSyncLease,
  listUnseenRecordIds,
  markRecordsMissing,
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
  /** Minimum spacing between MANUAL runs of one connection. Default QBO_SYNC_MANUAL_COOLDOWN_MS. */
  manualCooldownMs?: number;
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
  const cooldownMs = deps.manualCooldownMs ?? QBO_SYNC_MANUAL_COOLDOWN_MS;
  const notBefore = evaluateDueGate(input.trigger, state, now, cooldownMs);
  if (notBefore) return { status: "NOT_DUE", nextAttemptNotBefore: notBefore };
  const watermarks = parseWatermarks(state?.watermarks);
  const mode = input.modeOverride ?? chooseSyncMode({ now, watermarks, lastFullSyncAt: state?.lastFullSyncAt ?? null });

  // 4. atomic replay / lease / run. The epoch in the key lets a retry after a failed / abandoned / crashed attempt run under a
  // fresh key while two triggers racing from the same state still collide and replay.
  const idempotencyKey = syncIdempotencyKey(input.trigger, now, input.requestId ?? null, state?.leaseEpoch ?? 0, deps.uuid ?? randomUUID);
  const begun = await beginSyncRun({ ...scope, trigger: input.trigger, mode, idempotencyKey, requestedById: input.actorId, dueGate: { now, cooldownMs } }, deps);
  if (!begun.ok) {
    if (begun.reason === "NOT_DUE") return { status: "NOT_DUE", nextAttemptNotBefore: begun.nextAttemptNotBefore };
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
    // The fence is (token, epoch): a lease-lost error means ANOTHER worker took over, so this worker must write nothing more.
    if (e instanceof QboLeaseLostError) return failed("LEASE_LOST", lease.runId);
    const mapped = e instanceof SyncFailure ? { code: e.code, retryAfterMs: e.retryAfterMs } : syncFailureFromError(e);
    try {
      // Record the failure FIRST (lease-fenced): a stale worker then cannot go on to flip the connection state.
      const done = await finishSyncRunFailure({ lease, code: mapped.code, counts, retryAfterMs: mapped.retryAfterMs, actorId: input.actorId }, deps);
      if (mapped.code === "REAUTH_REQUIRED") {
        // An access token rejected even after a forced refresh, or a dead refresh token: the owner must reconnect.
        await markQboReauthorizationRequired({ workspaceId: lease.workspaceId, connectionId: lease.connectionId, reasonCode: REAUTH_REASON_ACCESS_REJECTED }, deps);
      }
      return failed(mapped.code, lease.runId, done.nextAttemptNotBefore);
    } catch (finishError) {
      if (finishError instanceof QboLeaseLostError) return failed("LEASE_LOST", lease.runId);
      throw finishError;
    }
  }
}

/** An orchestration-level failure that already carries a closed code. */
class SyncFailure extends Error {
  constructor(readonly code: QboSyncFailureCode, readonly retryAfterMs: number | null = null) {
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
  if (!first.ok) throw new SyncFailure(first.code, first.retryAfterMs);
  if (first.realmId !== connection.realmId) throw new SyncFailure("COMPANY_MISMATCH");
  let accessToken = first.accessToken;
  let tokenRevision = first.revision;
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
      // One forced refresh per token expiry: a second rejection of a token that was JUST refreshed is terminal
      // (REAUTH_REQUIRED), never a loop. The flag is re-armed after the refreshed token has been accepted by a real call.
      onAuthExpired: async () => {
        if (forcedRefreshUsed) return null;
        forcedRefreshUsed = true;
        const again = await getUsableQboAccessToken({ workspaceId: lease.workspaceId, connectionId: lease.connectionId, forceRefresh: true, knownRevision: tokenRevision }, tokenDeps);
        if (!again.ok) return null;
        accessToken = again.accessToken;
        tokenRevision = again.revision;
        return again.accessToken;
      },
      fetchImpl: deps.fetchImpl,
      limiter: deps.limiter,
      sleep: deps.sleep,
      random: deps.random,
      signal: abort.signal,
      ...deps.clientOptions,
    });
    /** Keep the lease alive across a provider call (its retry budget can be minutes) and re-arm the forced-refresh allowance. */
    const call = async <T>(fn: () => Promise<T>): Promise<T> => {
      await extendSyncLease(lease, deps);
      const out = await fn();
      forcedRefreshUsed = false;
      return out;
    };

    // CompanyInfo establishes identity: the company must be the realm this connection is bound to.
    const info = await call(() => client.companyInfo());
    const company = normalizeCompanyInfo(info, connection.realmId);
    if (!company.ok) throw new SyncFailure("PROVIDER_MALFORMED");
    if (company.record.normalized.reportedRealmId !== null && company.record.normalized.reportedRealmId !== connection.realmId) {
      throw new SyncFailure("COMPANY_MISMATCH");
    }
    changed = (await persistPage(lease, [company.record], counts, deps)) || changed;

    for (const entity of QBO_SYNC_QUERY_ENTITIES) {
      changed = (await readEntityKeyset({ client, call, entity, lease, mode, lower: incrementalLowerBound(mode, watermarks[entity]), cutoff: now, counts, deps })) || changed;
      if (mode === "FULL") changed = (await confirmMissing({ client, call, entity, lease, counts, deps })) || changed;
    }

    changed = (await readReports(client, call, lease, counts, now, deps)) || changed;
    return changed;
  } finally {
    deps.signal?.removeEventListener("abort", onParentAbort);
    abort.abort();
  }
}

type Call = <T>(fn: () => Promise<T>) => Promise<T>;

/**
 * Read one entity with KEYSET pagination. Offset paging over a moving set skips records (an edit that moves a row out of the
 * window shifts every later offset by one). Instead each page asks for `LastUpdatedTime >= cursor` from position 1, ordered by
 * LastUpdatedTime, so a change elsewhere can never shift the window. Rows sharing the cursor's timestamp reappear on the next
 * page and are collapsed by id; if a whole page shares ONE timestamp (a bulk import larger than a page) the cursor cannot move,
 * so the query advances by offset inside that single timestamp only. Stops on a short page.
 */
async function readEntityKeyset(a: {
  client: QboReadClient; call: Call; entity: (typeof QBO_SYNC_QUERY_ENTITIES)[number]; lease: SyncLease; mode: QboSyncMode;
  lower: Date | null; cutoff: Date; counts: QboSyncCounts; deps: QboSyncDeps;
}): Promise<boolean> {
  const { client, call, entity, lease, lower, cutoff, counts, deps } = a;
  let changed = false;
  let cursor: Date | null = lower;
  let tieOffset = 0; // rows already consumed at exactly `cursor` by offset advancement
  const seen = new Set<string>();
  for (let page = 0; page < QBO_SYNC_MAX_PAGES_PER_ENTITY; page++) {
    const where: NonNullable<QboQuerySpec["where"]> = [
      ...(cursor ? [{ field: "MetaData.LastUpdatedTime", op: ">=" as const, value: toQboInstant(cursor) }] : []),
      // Fixed upper bound: records changing while we page are picked up by the next run (watermark = this cutoff).
      { field: "MetaData.LastUpdatedTime", op: "<=" as const, value: toQboInstant(cutoff) },
    ];
    const result = await call(() => client.query({ entity, where, orderBy: { field: "MetaData.LastUpdatedTime", direction: "ASC" }, startPosition: 1 + tieOffset, maxResults: QBO_SYNC_PAGE_SIZE }));
    const normalized: NormalizedRecord[] = [];
    let fresh = 0;
    for (const raw of result.records) {
      const n = normalizeQueryRecord(entity, raw);
      if (n.ok) {
        if (!seen.has(n.record.providerEntityId)) fresh++;
        seen.add(n.record.providerEntityId);
        normalized.push(n.record);
      } else counts.skipped++;
    }
    counts.fetched[entity] = (counts.fetched[entity] ?? 0) + result.records.length;
    changed = (await persistPage(lease, dedupeRecords(normalized), counts, deps)) || changed;
    if (result.records.length < QBO_SYNC_PAGE_SIZE) return changed;

    // Full page: advance the cursor to the newest timestamp seen. Raw timestamps decide the cursor even for skipped records.
    const stamps = result.records.map((r) => Date.parse(String((r.MetaData as { LastUpdatedTime?: unknown } | undefined)?.LastUpdatedTime ?? ""))).filter((t) => !Number.isNaN(t));
    if (stamps.length === 0) throw new SyncFailure("PROVIDER_MALFORMED");
    const newest = Math.max(...stamps);
    const oldest = Math.min(...stamps);
    if (cursor && newest === cursor.getTime() && oldest === newest) {
      tieOffset += QBO_SYNC_PAGE_SIZE; // a page of pure ties at the cursor: step through that timestamp by offset
    } else {
      cursor = new Date(newest);
      tieOffset = 0;
    }
    if (fresh === 0 && tieOffset === 0 && cursor && newest === oldest) {
      // Defensive: a full page of already-seen ids with no cursor progress would loop; treat it as a tie group.
      tieOffset += QBO_SYNC_PAGE_SIZE;
    }
  }
  // The bound was reached with more data possibly remaining: fail loudly rather than truncate silently.
  throw new SyncFailure("PROVIDER_REJECTED");
}

/**
 * FULL sync reconciliation: records this run did not see are only CANDIDATES. Each is re-read by id (GET): a record that exists
 * is refreshed and kept (it had moved out of the query window or is inactive); only one the provider confirms absent is
 * flagged MISSING. Bounded per run; beyond the bound nothing more is flagged and the rest wait for the next FULL run.
 */
async function confirmMissing(a: { client: QboReadClient; call: Call; entity: (typeof QBO_SYNC_QUERY_ENTITIES)[number]; lease: SyncLease; counts: QboSyncCounts; deps: QboSyncDeps }): Promise<boolean> {
  const { client, call, entity, lease, counts, deps } = a;
  const candidates = await listUnseenRecordIds(lease, entity, QBO_SYNC_MISSING_CONFIRMATIONS_PER_ENTITY, deps);
  const toCheck = candidates.slice(0, QBO_SYNC_MISSING_CONFIRMATIONS_PER_ENTITY);
  let changed = false;
  const confirmedAbsent: string[] = [];
  for (const id of toCheck) {
    counts.confirmedByRead++;
    try {
      const raw = await call(() => client.readEntity(entity, id));
      const n = normalizeQueryRecord(entity, raw);
      if (n.ok) changed = (await persistPage(lease, [n.record], counts, deps)) || changed;
    } catch (e) {
      // Intuit answers a deleted/unknown object with HTTP 404, or 400 + fault code 610 ("Object Not Found").
      if (isQboProviderError(e) && (e.kind === "NOT_FOUND" || (e.kind === "BAD_REQUEST" && e.providerCode === "610"))) confirmedAbsent.push(id);
      else throw e;
    }
  }
  const flagged = await markRecordsMissing(lease, entity, confirmedAbsent, deps);
  counts.markedMissing += flagged;
  return changed || flagged > 0;
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
  /** Which header period fields must echo the request (an echo mismatch means the numbers belong to another period). */
  verify: { start: boolean; end: boolean };
  parse: (body: unknown) => ReportParseResult;
}

function planReports(now: Date): ReportJob[] {
  const jobs: ReportJob[] = [];
  for (const p of completeMonthPeriods(now, QBO_SYNC_REPORT_MONTHS)) {
    jobs.push({ name: "ProfitAndLoss", params: { start_date: p.start, end_date: p.end, accounting_method: "Accrual" }, periodStart: p.start, periodEnd: p.end, verify: { start: true, end: true }, parse: parseProfitAndLoss });
    // A balance sheet is a point in time: observed at period end.
    jobs.push({ name: "BalanceSheet", params: { start_date: p.start, end_date: p.end, accounting_method: "Accrual" }, periodStart: p.end, periodEnd: p.end, verify: { start: false, end: true }, parse: parseBalanceSheet });
  }
  const today = utcDate(now);
  // Aged reports are "as of the day read" (UTC date); their header period echo is not asserted (not established for Intuit).
  jobs.push({ name: "AgedReceivables", params: { report_date: today }, periodStart: today, periodEnd: today, verify: { start: false, end: false }, parse: parseAgedReport });
  jobs.push({ name: "AgedPayables", params: { report_date: today }, periodStart: today, periodEnd: today, verify: { start: false, end: false }, parse: parseAgedReport });
  return jobs;
}

/**
 * Read and store every report. One malformed report does not discard the others: the rest are stored, and the run then ends
 * FAILED(PROVIDER_MALFORMED) so the problem is visible and the watermarks do not advance.
 */
async function readReports(client: QboReadClient, call: Call, lease: SyncLease, counts: QboSyncCounts, now: Date, deps: QboSyncDeps): Promise<boolean> {
  let changed = false;
  let malformed = false;
  for (const job of planReports(now)) {
    const body = await call(() => client.report(job.name, job.params));
    const parsed = job.parse(body);
    if (!parsed.ok) { malformed = true; counts.reportsFailed++; continue; }
    const report: ParsedReport = parsed.report;
    // The provider must answer for the period that was asked, otherwise the numbers would be filed under the wrong date.
    const echoed = (job.verify.end && report.endPeriod !== null && report.endPeriod !== job.periodEnd) || (job.verify.start && report.startPeriod !== null && report.startPeriod !== job.params.start_date);
    if (echoed) { malformed = true; counts.reportsFailed++; continue; }
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
  if (malformed) throw new SyncFailure("PROVIDER_MALFORMED");
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
