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
import { QBO_QUERY_IN_MAX_VALUES, type QboQuerySpec } from "@/domain/quickbooks/qbo-read-catalog";
import { isSafeEntityId } from "@/domain/quickbooks/qbo-identifiers";
import {
  QBO_SYNC_MANUAL_COOLDOWN_MS,
  evaluateDueGate,
  QBO_SYNC_PAGES_PER_EXECUTION,
  QBO_SYNC_PAGE_SIZE,
  QBO_SYNC_TIE_MAX_STALLED_PASSES,
  QBO_SYNC_VERIFY_READS_PER_ENTITY,
  floorSecond,
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
  type QboContinuation,
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
  countSeenInWindow,
  listSeenIdsInWindow,
  finishSyncRunPartial,
  listUnseenRecordIds,
  markVerifyAttempted,
  continuationTaskKey,
  parseWatermarks,
  persistRecordsPageWithCheckpoint,
  saveContinuation,
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
  /** Wall-clock budget (ms) for one execution: it stops at a checkpoint when exceeded (scheduler/serverless time ceilings). */
  deadlineMs?: number;
  /** Test seams for the bounded-work design: records per provider page and provider query calls per execution. */
  pageSize?: number;
  pagesPerExecution?: number;
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
  const track: Track = { cp: null, pager: null, changed: false, freshCheckpoint: null };

  try {
    // An unfinished sync resumes from its durable checkpoint; otherwise this execution starts a new logical sync whose cutoff is fixed now.
    const resume = begun.continuation && !begun.continuation.restart ? begun.continuation : null;
    const checkpoint: QboContinuation = resume ?? {
      v: 1, syncId: lease.syncId, mode: begun.mode, cutoff: floorSecond(now).toISOString(), entityIndex: 0, cursor: null, tie: null, reconciled: [],
      seq: (begun.continuation?.seq ?? 0) + 1, changed: begun.continuation?.changed ?? false, restart: false,
    };
    track.cp = checkpoint;
    // A fresh logical sync's (empty) checkpoint is written in the SAME transaction as its first record (CompanyInfo), never earlier:
    // a failure before any provider data was read leaves no checkpoint, so the next attempt starts a fresh sync with a fresh cutoff.
    track.freshCheckpoint = resume ? null : checkpoint;
    const stored = parseWatermarks(begun.priorState.watermarks);
    const result = await executeReads({ lease, connection, config, mode: begun.mode, watermarks: stored, counts, now, checkpoint, track, input, deps });
    if (result.status === "BUDGET") {
      // Bounded work per execution: stop at the durable checkpoint. NOT a failure and NOT a completion: watermarks stay put.
      const cp = await persistChangedMarker(lease, track, deps);
      await finishSyncRunPartial({ lease, mode: begun.mode, counts, changed: result.changed, actorId: input.actorId }, deps);
      return { status: "CONTINUING", runId: lease.runId, mode: begun.mode, counts, changed: result.changed, continuationKey: continuationTaskKey(cp, lease.epoch) as string };
    }
    // A change persisted by ANY execution of this logical sync (or by an earlier failed attempt of it) counts for the whole sync.
    const changedForSync = result.changed || checkpoint.changed || track.cp?.changed === true || track.pager?.cp.changed === true;
    // Proven exhaustion of every entity (and the reports): ONLY now do the durable watermarks advance, to the sync's fixed cutoff.
    const newWatermarks = Object.fromEntries(QBO_SYNC_QUERY_ENTITIES.map((e) => [e, checkpoint.cutoff]));
    await finishSyncRunSuccess({ lease, mode: begun.mode, startedAt: new Date(checkpoint.cutoff), counts, changed: changedForSync, watermarks: newWatermarks, actorId: input.actorId }, deps);
    return { status: "SUCCEEDED", runId: lease.runId, mode: begun.mode, counts, changed: changedForSync };
  } catch (e) {
    // The fence is (token, epoch): a lease-lost error means ANOTHER worker took over, so this worker must write nothing more.
    if (e instanceof QboLeaseLostError) return failed("LEASE_LOST", lease.runId);
    const mapped = e instanceof SyncFailure ? { code: e.code, retryAfterMs: e.retryAfterMs } : syncFailureFromError(e);
    try {
      // Changes already persisted by this failed attempt must still reach re-evaluation once the sync completes.
      await persistChangedMarker(lease, track, deps, mapped.code === "PROVIDER_INCOMPLETE").catch((markerError) => {
        // Only a lost lease is acceptable to ignore (another worker owns the state now); anything else must not silently drop the
        // restart / re-evaluation flags.
        if (markerError instanceof QboLeaseLostError) return undefined;
        throw markerError;
      });
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

interface Track {
  cp: QboContinuation | null;
  pager: Pager | null;
  changed: boolean;
  /** Checkpoint of a fresh logical sync that has not been persisted yet (written together with the first record). */
  freshCheckpoint: QboContinuation | null;
}

/**
 * Make "this logical sync persisted a provider change" durable in the checkpoint (lease-fenced). Returns the checkpoint now in force.
 * Used before a PARTIAL finish and on failure, so the re-evaluation marker cannot be lost across executions or failed attempts.
 */
async function persistChangedMarker(lease: SyncLease, track: Track, deps: QboSyncDeps, restart = false): Promise<QboContinuation> {
  const base = (track.pager?.cp ?? track.cp) as QboContinuation;
  const changed = track.changed || track.pager?.changed === true;
  if (!restart && (!changed || base.changed)) return base;
  const next: QboContinuation = { ...base, changed: base.changed || changed, restart: restart || base.restart, seq: base.seq + 1 };
  await saveContinuation(lease, next, deps);
  if (track.pager) track.pager.cp = next;
  track.cp = next;
  return next;
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
  checkpoint: QboContinuation;
  track: Track;
  input: RunQboSyncInput;
  deps: QboSyncDeps;
}

type ExecuteResult = { status: "DONE"; changed: boolean } | { status: "BUDGET"; changed: boolean };

async function executeReads(a: ExecuteArgs): Promise<ExecuteResult> {
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
        if (!again.ok) {
          // Only a genuinely dead grant ends the attempt as an auth failure (-> REAUTH_REQUIRED). A transient refresh problem
          // (token endpoint 5xx/429, timeout, claim wait) is a retryable failure with back-off, never a reconnect demand.
          if (again.code === "REAUTH_REQUIRED" || again.code.startsWith("CONNECTION_") || again.code === "ENVIRONMENT_MISMATCH") return null;
          throw new SyncFailure(again.code, again.retryAfterMs);
        }
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
    changed = (await persistPage(lease, [company.record], a.track.freshCheckpoint ?? undefined, counts, deps)) || changed;
    a.track.changed = changed;

    const pager: Pager = {
      client, call, lease, counts, deps,
      pageSize: Math.max(1, deps.pageSize ?? QBO_SYNC_PAGE_SIZE),
      budget: Math.max(1, deps.pagesPerExecution ?? QBO_SYNC_PAGES_PER_EXECUTION),
      units: 0,
      cp: { ...a.checkpoint, changed: a.checkpoint.changed || changed },
      deadlineAt: deps.deadlineMs !== undefined ? Date.now() + deps.deadlineMs : null,
      cutoff: new Date(a.checkpoint.cutoff),
      changed: false,
    };
    a.track.pager = pager;

    while (pager.cp.entityIndex < QBO_SYNC_QUERY_ENTITIES.length) {
      const entity = QBO_SYNC_QUERY_ENTITIES[pager.cp.entityIndex];
      const exhausted = await readEntityKeyset(pager, entity, incrementalLowerBound(mode, watermarks[entity]));
      if (!exhausted) return { status: "BUDGET", changed: changed || pager.changed };
      // Exhaustion of this entity is CONFIRMED (short page from the keyset window, or every oversized bucket closed by the two-round identity-inclusion check).
      if (mode === "FULL" && !pager.cp.reconciled.includes(entity)) {
        await verifyUnseen(pager, entity);
        await advance(pager, { reconciled: [...pager.cp.reconciled, entity] });
      }
      await advance(pager, { entityIndex: pager.cp.entityIndex + 1, cursor: null, tie: null });
    }
    changed = changed || pager.changed;

    changed = (await readReports(client, call, lease, counts, now, deps, async () => { a.track.changed = true; if (!pager.cp.changed) await advance(pager, { changed: true }); })) || changed;
    return { status: "DONE", changed };
  } finally {
    deps.signal?.removeEventListener("abort", onParentAbort);
    abort.abort();
  }
}

type Call = <T>(fn: () => Promise<T>) => Promise<T>;
type Entity = (typeof QBO_SYNC_QUERY_ENTITIES)[number];

/** Mutable state of one execution's pager. `cp` always equals the checkpoint last persisted. */
interface Pager {
  client: QboReadClient;
  call: Call;
  lease: SyncLease;
  counts: QboSyncCounts;
  deps: QboSyncDeps;
  pageSize: number;
  /** Provider query calls (pages and count probes) this execution may spend before it must stop at a checkpoint. */
  budget: number;
  units: number;
  cp: QboContinuation;
  cutoff: Date;
  changed: boolean;
  /** Wall-clock stop (epoch ms): the execution ends at its checkpoint when this passes, however few provider calls it has made. */
  deadlineAt: number | null;
}

/** Persist a new checkpoint (lease-fenced) without a page. */
async function advance(p: Pager, patch: Partial<QboContinuation>): Promise<void> {
  const next: QboContinuation = { ...p.cp, ...patch, seq: p.cp.seq + 1 };
  await saveContinuation(p.lease, next, p.deps);
  p.cp = next;
}

function stampOf(raw: Record<string, unknown>): number | null {
  const t = Date.parse(String((raw.MetaData as { LastUpdatedTime?: unknown } | undefined)?.LastUpdatedTime ?? ""));
  return Number.isNaN(t) ? null : t;
}

/** Validate the ordering contract of a page and return its timestamps. A record without a timestamp cannot be positioned. */
function stampsOf(records: readonly Record<string, unknown>[]): number[] {
  const out: number[] = [];
  let prev = -Infinity;
  for (const r of records) {
    const t = stampOf(r);
    if (t === null || t < prev) throw new SyncFailure("PROVIDER_MALFORMED");
    prev = t;
    out.push(t);
  }
  return out;
}

/**
 * Read one entity completely, in bounded steps. Returns true when exhaustion is CONFIRMED (under the documented provider-consistency assumptions R1/R2), false when this execution's budget ran out
 * first (the checkpoint then describes exactly where to resume).
 *
 * KEYSET: each page asks for `LastUpdatedTime >= cursor` from position 1, ordered by LastUpdatedTime ASC, so a change elsewhere
 * cannot shift the window. A full page proves every second BELOW its newest second is complete (the ordering puts them first), so
 * the cursor moves to the newest second; a short page proves the whole remaining window was returned in one response.
 *
 * EQUAL-TIMESTAMP BUCKET LARGER THAN A PAGE: the provider documents no stable order inside one timestamp, so offset paging cannot
 * by itself guarantee coverage. The bucket is enumerated in passes and CLOSED only by the identity-inclusion check in tieStep (never by
 * a count comparison alone). QBO_SYNC_TIE_MAX_STALLED_PASSES passes in a row that find nothing new end the run as PROVIDER_INCOMPLETE — never a silent skip, never an endless loop.
 */
async function readEntityKeyset(p: Pager, entity: Entity, lower: Date | null): Promise<boolean> {
  for (;;) {
    if (p.units >= p.budget || (p.deadlineAt !== null && p.units > 0 && Date.now() >= p.deadlineAt)) return false;
    if (p.cp.tie) {
      await tieStep(p, entity);
      continue;
    }
    const cursor = p.cp.cursor ? new Date(p.cp.cursor) : lower ? floorSecond(lower) : null;
    const where: NonNullable<QboQuerySpec["where"]> = [
      ...(cursor ? [{ field: "MetaData.LastUpdatedTime", op: ">=" as const, value: toQboInstant(cursor) }] : []),
      // Fixed upper bound: records changing while we page are picked up by the next run (watermark = this cutoff, with overlap).
      { field: "MetaData.LastUpdatedTime", op: "<=" as const, value: toQboInstant(p.cutoff) },
    ];
    const result = await p.call(() => p.client.query({ entity, where, orderBy: { field: "MetaData.LastUpdatedTime", direction: "ASC" }, startPosition: 1, maxResults: p.pageSize }));
    p.units++;
    p.counts.pages++;
    const stamps = stampsOf(result.records);
    if (result.records.length < p.pageSize) {
      await persistQueryPage(p, entity, result.records, null);
      return true;
    }
    const newest = floorSecond(new Date(stamps[stamps.length - 1]));
    if (floorSecond(new Date(stamps[0])).getTime() === newest.getTime()) {
      // The whole page shares ONE second: that second holds at least a page of records. Enumerate it with identity-inclusion closure (see tieStep).
      await persistQueryPage(p, entity, result.records, { cursor: newest.toISOString(), tie: { second: newest.toISOString(), offset: 0, stalledPasses: 0, lastSeen: 0, total: null, verify: null, rejected: mergeRejected([], rejectedIdsOf(entity, result.records)) } });
      continue;
    }
    // Everything below `newest` is complete in this page; `newest` itself may continue, so the next page starts AT it.
    if (cursor && newest.getTime() <= cursor.getTime()) throw new SyncFailure("PROVIDER_INCOMPLETE"); // no forward progress: never loop
    await persistQueryPage(p, entity, result.records, { cursor: newest.toISOString(), tie: null });
  }
}

/**
 * Ids of records the normalizer rejects on this page. They are never stored, yet the provider counts them in an oversized bucket, so
 * the identity check must account for them by id (bounded). A rejected record whose id cannot be queried safely, or more than 50 of
 * them, makes the bucket unprovable: fail closed (PROVIDER_INCOMPLETE).
 */
function rejectedIdsOf(entity: Entity, records: readonly Record<string, unknown>[]): string[] {
  const out: string[] = [];
  for (const raw of records) {
    if (normalizeQueryRecord(entity, raw).ok) continue;
    const id = raw.Id;
    if (typeof id !== "string" || !isSafeEntityId(id)) throw new SyncFailure("PROVIDER_INCOMPLETE");
    out.push(id);
  }
  return out;
}

const mergeRejected = (a: readonly string[], b: readonly string[]): string[] => {
  const all = [...new Set([...a, ...b])];
  if (all.length > 50) throw new SyncFailure("PROVIDER_INCOMPLETE");
  return all;
};

/** Normalize + persist a page together with the checkpoint that describes the position after it (one transaction). */
async function persistQueryPage(
  p: Pager,
  entity: Entity,
  records: readonly Record<string, unknown>[],
  next: { cursor: string | null; tie: QboContinuation["tie"] } | null,
): Promise<void> {
  const normalized: NormalizedRecord[] = [];
  for (const raw of records) {
    const n = normalizeQueryRecord(entity, raw);
    if (n.ok) normalized.push(n.record);
    else p.counts.skipped++;
  }
  p.counts.fetched[entity] = (p.counts.fetched[entity] ?? 0) + records.length;
  const checkpoint: QboContinuation | undefined = next ? { ...p.cp, cursor: next.cursor, tie: next.tie, seq: p.cp.seq + 1 } : undefined;
  const changedHere = await persistPage(p.lease, dedupeRecords(normalized), checkpoint, p.counts, p.deps);
  if (changedHere) p.changed = true;
  if (checkpoint) p.cp = changedHere ? { ...checkpoint, changed: true } : checkpoint;
  else if (changedHere) p.cp = { ...p.cp, changed: true };
}

/**
 * One step of the handling of an oversized equal-timestamp bucket (one whole second holding at least a page of records).
 *
 * COMPLETENESS GUARANTEE (set inclusion under read quiescence - NOT an atomic snapshot). Counting alone says nothing about WHICH
 * records were read: a record that leaves the bucket while another enters keeps every count equal. So the bucket is closed only
 * when, for the ids this logical sync stored for that second, the provider confirms
 *     sum over batches of count(second AND Id IN batch)  ==  count(second)
 * i.e. every record the provider reports in that second is one we already have (documented operators only: count(*), IN on Id,
 * range on LastUpdatedTime; no ordering assumption). Stored ids that have left the second match nothing and are harmless.
 * The check runs in two full rounds, each followed by a re-read of count(second) and of the number of records stamped after the
 * cutoff (an edit moves a record forward in time and changes that number even when a swap keeps count(second); a delete or deactivation does not, so those are detected only through count(second) and the batch sums, i.e. only if nothing arrives in the second at the same time).
 *
 * WHAT THIS DOES AND DOES NOT GUARANTEE. Every one of those counts is a SEPARATE provider call; Intuit documents no snapshot,
 * transaction or read-version semantics across query calls (and its batch endpoint is a POST, which this read-only client never
 * issues). Therefore: (a) any single membership change, anywhere between the start of verification and its last re-read, is detected - a
 * departure by edit changes the post-cutoff count, a departure by delete or an arrival changes the bucket total or makes a batch sum fall short -
 * and leaves the bucket open; (b) a SINGLE round could be
 * fooled by one flip that straddles it, which is why a second round follows; (c) an adversary that, in the same window, both deletes/edits a member AND makes an unseen record appear in the second
 * with matching totals while neutralising the post-cutoff count cannot be excluded without provider snapshot semantics. That residual is a stated provider read-consistency assumption
 * (the bucket is quiescent for the duration of the check), distinct from the late-visibility assumption (a record that first becomes
 * visible after our last observation of its second, stamped with that old second). Any shortfall, drift, or stalled
 * enumeration fails closed: the bucket stays open, the pass restarts or the run ends PROVIDER_INCOMPLETE, and the durable
 * watermark does not move.
 */
async function tieStep(p: Pager, entity: Entity): Promise<void> {
  const tie = p.cp.tie as NonNullable<QboContinuation["tie"]>;
  const from = new Date(tie.second);
  const to = new Date(from.getTime() + 1000);
  const windowWhere: NonNullable<QboQuerySpec["where"]> = [
    { field: "MetaData.LastUpdatedTime", op: ">=", value: toQboInstant(from) },
    { field: "MetaData.LastUpdatedTime", op: "<", value: toQboInstant(to) },
  ];
  const editsWhere: NonNullable<QboQuerySpec["where"]> = [{ field: "MetaData.LastUpdatedTime", op: ">", value: toQboInstant(p.cutoff) }];
  const countWhere = async (where: NonNullable<QboQuerySpec["where"]>): Promise<number> => {
    const n = await p.call(() => p.client.count({ entity, where }));
    p.units++;
    return n;
  };
  const restartPass = async (stalledPasses: number, lastSeen: number, total: number | null, rejectedIds: string[] = tie.rejected): Promise<void> => {
    if (stalledPasses >= QBO_SYNC_TIE_MAX_STALLED_PASSES) throw new SyncFailure("PROVIDER_INCOMPLETE");
    await advance(p, { tie: { second: tie.second, offset: 0, stalledPasses, lastSeen, total, verify: null, rejected: rejectedIds } });
  };

  if (tie.verify) {
    const v = tie.verify;
    const ids = await listSeenIdsInWindow(p.lease, entity, from, to, v.after, QBO_QUERY_IN_MAX_VALUES, p.deps);
    if (ids.length > 0) {
      const m = await countWhere([...windowWhere, { field: "Id", op: "IN", value: ids }]);
      await advance(p, { tie: { ...tie, verify: { ...v, after: ids[ids.length - 1], matched: v.matched + m } } });
      return;
    }
    // Round finished: every provider member must be among the stored ids, and the bucket must not have changed size meanwhile.
    const now = await countWhere(windowWhere);
    // Rejected-by-normalizer records are provider members we hold by id only: confirm them the same way (inclusion by Id IN).
    const rejectedMatched = tie.rejected.length > 0 ? await countWhere([...windowWhere, { field: "Id", op: "IN", value: tie.rejected }]) : 0;
    if (v.matched + rejectedMatched !== v.total || now !== v.total) return restartPass(tie.stalledPasses, tie.lastSeen, null);
    // A record that LEAVES a past second by EDIT (its stamp moves forward) changes the number of records stamped after the cutoff, so
    // an edit+arrival swap that keeps count(second) unchanged is still visible here. A DELETE or deactivation does not change that
    // number: it is caught only by count(second)/the batch sums, so a delete coinciding with an arrival is the residual (R1/R2).
    // Any edit restarts the check.
    if ((await countWhere(editsWhere)) !== v.edits) return restartPass(tie.stalledPasses + 1, tie.lastSeen, null);
    if (v.round === 1) {
      await advance(p, { tie: { ...tie, verify: { round: 2, after: null, matched: 0, total: v.total, edits: v.edits } } });
      return;
    }
    p.counts.tieBucketsClosed++;
    await advance(p, { cursor: to.toISOString(), tie: null });
    return;
  }

  if (tie.total === null) {
    // Start of a pass: the provider's own size of the bucket bounds the pass, so a provider that ignores paging cannot keep it open.
    await advance(p, { tie: { ...tie, total: await countWhere(windowWhere) } });
    return;
  }
  const result = await p.call(() => p.client.query({ entity, where: windowWhere, orderBy: { field: "MetaData.LastUpdatedTime", direction: "ASC" }, startPosition: 1 + tie.offset, maxResults: p.pageSize }));
  p.units++;
  p.counts.pages++;
  stampsOf(result.records);
  const rejected = mergeRejected(tie.rejected, rejectedIdsOf(entity, result.records));
  const consumed = tie.offset + result.records.length;
  if (result.records.length >= p.pageSize && consumed < tie.total) {
    await persistQueryPage(p, entity, result.records, { cursor: p.cp.cursor, tie: { ...tie, offset: consumed, rejected } });
    return;
  }
  await persistQueryPage(p, entity, result.records, null);

  // End of an enumeration pass. A bucket whose size changed during the pass may have shifted offsets: enumerate again.
  const providerCount = await countWhere(windowWhere);
  const seen = await countSeenInWindow(p.lease, entity, from, to, p.deps);
  const stalledPasses = providerCount === tie.total && seen > tie.lastSeen ? 0 : tie.stalledPasses + 1;
  if (providerCount !== tie.total) return restartPass(stalledPasses, seen, providerCount, rejected);
  await advance(p, { tie: { second: tie.second, offset: tie.offset, stalledPasses, lastSeen: seen, total: providerCount, rejected, verify: { round: 1, after: null, matched: 0, total: providerCount, edits: await countWhere(editsWhere) } } });
}

/**
 * FULL sync reconciliation. Records the provider did NOT return in this logical sync are only CANDIDATES (an inactive record, one
 * moved out of the window, or a deleted one — a query cannot tell them apart). Each is re-read by id (GET): a record the provider
 * returns is refreshed. A record it cannot positively return is counted `unresolved` and LEFT UNCHANGED — it is never flagged
 * deleted, because nothing in the read API documents that an error on a read means deletion. Bounded per entity; the rotation
 * (least recently attempted first) lets later syncs cover the rest.
 */
async function verifyUnseen(p: Pager, entity: Entity): Promise<void> {
  const ids = await listUnseenRecordIds(p.lease, entity, QBO_SYNC_VERIFY_READS_PER_ENTITY, p.deps);
  for (const id of ids) {
    p.counts.verifiedByRead++;
    p.units++; // by-id reads are provider calls like any other: they count against the execution budget
    try {
      const raw = await p.call(() => p.client.readEntity(entity, id));
      const n = normalizeQueryRecord(entity, raw);
      if (n.ok) {
        if (await persistPage(p.lease, [n.record], undefined, p.counts, p.deps)) { p.changed = true; p.cp = { ...p.cp, changed: true }; }
      } else p.counts.unresolved++;
    } catch (e) {
      // Not found / fault 610 on a read: unresolved, never "deleted". Anything else (auth, rate limit, outage, timeout) is a real failure.
      if (isQboProviderError(e) && (e.kind === "NOT_FOUND" || (e.kind === "BAD_REQUEST" && e.providerCode === "610"))) p.counts.unresolved++;
      else {
        // Even a failing candidate must move to the back of the rotation, or one deterministic error would pin every later FULL
        // sync to the same id forever.
        await markVerifyAttempted(p.lease, entity, [id], p.deps).catch(() => undefined);
        throw e;
      }
    }
    await markVerifyAttempted(p.lease, entity, [id], p.deps);
  }
}

async function persistPage(lease: SyncLease, records: NormalizedRecord[], checkpoint: QboContinuation | undefined, counts: QboSyncCounts, deps: QboSyncDeps): Promise<boolean> {
  const r = await persistRecordsPageWithCheckpoint(lease, records, checkpoint, deps);
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
async function readReports(client: QboReadClient, call: Call, lease: SyncLease, counts: QboSyncCounts, now: Date, deps: QboSyncDeps, onChanged: () => Promise<void>): Promise<boolean> {
  let changed = false;
  let malformed = false;
  for (const job of planReports(now)) {
    const body = await call(() => client.report(job.name, job.params));
    const parsed = job.parse(body);
    if (!parsed.ok) { malformed = true; counts.reportsFailed++; continue; }
    const report: ParsedReport = parsed.report;
    // The provider must answer for the period that was asked, otherwise the numbers would be filed under the wrong date.
    // A header that does not echo the requested period at all is as bad as one that echoes a different period: fail closed.
    const echoed = (job.verify.end && report.endPeriod !== job.periodEnd) || (job.verify.start && report.startPeriod !== job.params.start_date);
    // The basis the provider says it used must be the basis that was asked for (an echo of a different basis is another dataset).
    const basisMismatch = job.params.accounting_method !== undefined && report.basis !== null && report.basis !== job.params.accounting_method;
    if (echoed || basisMismatch) { malformed = true; counts.reportsFailed++; continue; }
    // A report that does not state its basis is NOT assumed to be Accrual: "UNKNOWN" is never adopted by the provenance policy.
    const basis = report.basis ?? "UNKNOWN";
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
      await onChanged(); // durable re-evaluation marker, so a later failure of this run cannot lose it
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
