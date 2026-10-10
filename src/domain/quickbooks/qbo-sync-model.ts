/**
 * QuickBooks Online — READ-ONLY synchronization vocabulary (pure: no DB, no network).
 *
 * Scope decision (derived, not assumed): OpsIQ consumes QuickBooks data only to diagnose owner finances, i.e. to
 * inform the fields of OwnerFinancialSnapshot / OwnerCashflowSnapshot. The sync therefore reads the smallest set of
 * sources that can inform those fields:
 *
 *   field                                      source
 *   ─────────────────────────────────────────  ─────────────────────────────────────────────────────────
 *   revenue, costOfGoods                       ProfitAndLoss report (Income, COGS)
 *   cashOnHand / bankBalance                   BalanceSheet report (BankAccounts)
 *   receivables                                BalanceSheet (AR) cross-checked with AgedReceivables + open Invoice balances
 *   overdueReceivables                         AgedReceivables report (everything not in the "Current" bucket)
 *   payables, overduePayables, vendorDue       BalanceSheet (AP), AgedPayables report, open Bill balances
 *   customerCount, orderCount                  Customer (active) and Invoice records
 *   currency                                   report Header.Currency / CompanyInfo (never assumed)
 *
 * Not synced: Vendor, Account, Payment, Purchase, Estimate, payroll, CashFlow, TrialBalance and everything else in
 * qbo-read-catalog. Adding a source is a reviewed change to this file AND to the scope-boundary test.
 *
 * Every request in the sync path is an HTTP GET issued through the existing read client (qbo-client.ts).
 */
import { z } from "zod";
import { QBO_READABLE_ENTITIES, QBO_REPORT_NAMES, type QboReadableEntity, type QboReportName } from "./qbo-read-catalog";
import { isQboProviderError } from "./qbo-errors";

/** Entities pulled with structured, paginated queries. */
export const QBO_SYNC_QUERY_ENTITIES = ["Customer", "Invoice", "Bill"] as const satisfies readonly QboReadableEntity[];
export type QboSyncQueryEntity = (typeof QBO_SYNC_QUERY_ENTITIES)[number];

/** Reports pulled with GET /reports/<name>. */
export const QBO_SYNC_REPORTS = ["ProfitAndLoss", "BalanceSheet", "AgedReceivables", "AgedPayables"] as const satisfies readonly QboReportName[];
export type QboSyncReport = (typeof QBO_SYNC_REPORTS)[number];

/** The single-object read (GET /companyinfo/<realm>) that establishes company identity. */
export const QBO_SYNC_COMPANY_INFO = "CompanyInfo" as const;

/** The exact, documented list of QuickBooks sources the sync reads. */
export const SUPPORTED_QBO_READ_ENTITIES: readonly string[] = [
  QBO_SYNC_COMPANY_INFO,
  ...QBO_SYNC_QUERY_ENTITIES,
  ...QBO_SYNC_REPORTS.map((r) => `${r}(report)`),
];

// Compile-time/runtime guard that the sync scope stays inside the read-only catalog.
for (const e of QBO_SYNC_QUERY_ENTITIES) {
  if (!(QBO_READABLE_ENTITIES as readonly string[]).includes(e)) throw new Error("QBO sync entity outside the read catalog");
}
for (const r of QBO_SYNC_REPORTS) {
  if (!(QBO_REPORT_NAMES as readonly string[]).includes(r)) throw new Error("QBO sync report outside the read catalog");
}

export const QBO_SYNC_TRIGGERS = ["MANUAL", "SCHEDULED", "WEBHOOK"] as const;
export type QboSyncTrigger = (typeof QBO_SYNC_TRIGGERS)[number];

export const QBO_SYNC_MODES = ["FULL", "INCREMENTAL"] as const;
export type QboSyncMode = (typeof QBO_SYNC_MODES)[number];

/** PARTIAL: a bounded execution that stopped at a durable checkpoint; the sync continues in a later execution. Not a failure. */
export const QBO_SYNC_RUN_STATUSES = ["RUNNING", "SUCCEEDED", "PARTIAL", "FAILED", "ABANDONED"] as const;
export type QboSyncRunStatus = (typeof QBO_SYNC_RUN_STATUSES)[number];

/** Mirror rows are never flagged "deleted": deletion detection needs a provider signal OpsIQ does not read (see QBO_READ_ONLY_SYNC.md §4). */
export const QBO_RECORD_STATES = ["ACTIVE", "INACTIVE"] as const;
export type QboRecordState = (typeof QBO_RECORD_STATES)[number];

/** Closed set of sanitized failure codes. Nothing provider-supplied is ever stored beyond these. */
export const QBO_SYNC_FAILURE_CODES = [
  "CONFIGURATION_UNAVAILABLE",
  "ENVIRONMENT_MISMATCH",
  "CONNECTION_NOT_FOUND",
  "CONNECTION_NOT_ACTIVE",
  "REAUTH_REQUIRED",
  "PROVIDER_FORBIDDEN",
  "PROVIDER_RATE_LIMITED",
  "PROVIDER_UNAVAILABLE",
  "PROVIDER_TIMEOUT",
  "PROVIDER_MALFORMED",
  "PROVIDER_REJECTED",
  /** A window could not be confirmed complete by the identity-inclusion check (membership/count disagreed, or the bucket kept changing). Nothing was skipped silently. */
  "PROVIDER_INCOMPLETE",
  "COMPANY_MISMATCH",
  "LEASE_LOST",
  "CANCELLED",
  "INTERNAL_ERROR",
] as const;
export type QboSyncFailureCode = (typeof QBO_SYNC_FAILURE_CODES)[number];

/** Failures that retrying cannot fix without a human (or a code change). */
const TERMINAL_FAILURES: ReadonlySet<QboSyncFailureCode> = new Set<QboSyncFailureCode>([
  "CONFIGURATION_UNAVAILABLE",
  "ENVIRONMENT_MISMATCH",
  "CONNECTION_NOT_FOUND",
  "CONNECTION_NOT_ACTIVE",
  "REAUTH_REQUIRED",
]);

export function isTerminalSyncFailure(code: QboSyncFailureCode): boolean {
  return TERMINAL_FAILURES.has(code);
}

// ─── Timing constants ────────────────────────────────────────────────────────

/**
 * One sync lease lives this long and is extended before every provider call and by every persisted page. It is sized above the
 * worst-case retry budget of a single provider request (4 attempts x 30s deadline + back-off waits ~ 9 minutes).
 */
export const QBO_SYNC_LEASE_MS = 15 * 60 * 1000;
/** Lower bound of an incremental window is the previous watermark minus this overlap (provider indexing lag, clock skew). */
export const QBO_SYNC_WATERMARK_OVERLAP_MS = 10 * 60 * 1000;
/** A FULL sync (which also reconciles records Intuit no longer returns) is forced at least this often. */
export const QBO_SYNC_FULL_RECONCILE_MS = 7 * 24 * 60 * 60 * 1000;
/** Minimum spacing between MANUAL runs of one connection (each run costs ~11 provider calls). */
export const QBO_SYNC_MANUAL_COOLDOWN_MS = 60 * 1000;
/** Bound on unseen records re-read by id per entity per FULL sync (each sync rotates through the least recently verified). */
export const QBO_SYNC_VERIFY_READS_PER_ENTITY = 100;
/** Scheduled cadence: one run per connection per UTC day, matching the platform's daily scheduler cron. */
export const QBO_SYNC_SCHEDULE_BUCKET_MS = 24 * 60 * 60 * 1000;
/** Complete calendar months of period reports (ProfitAndLoss, BalanceSheet) kept current. */
export const QBO_SYNC_REPORT_MONTHS = 3;
/**
 * Bounded WORK per execution: after this many provider pages an execution stops at a durable checkpoint and the sync CONTINUES in
 * a later execution (scheduler re-enqueue). There is deliberately no dataset-size limit — only a per-execution work bound.
 */
export const QBO_SYNC_PAGES_PER_EXECUTION = 100;
/** Intuit's documented maximum entities per query response. */
export const QBO_SYNC_PAGE_SIZE = 1000;
/** A timestamp-bucket enumeration that makes no progress for this many consecutive passes is declared incomplete (never looped on). */
export const QBO_SYNC_TIE_MAX_STALLED_PASSES = 3;

const TRANSIENT_BASE_DELAY_MS = 15 * 60 * 1000;
const TRANSIENT_MAX_DELAY_MS = 6 * 60 * 60 * 1000;
const PERSISTENT_BASE_DELAY_MS = 6 * 60 * 60 * 1000;
// 23h, not 24h: a back-off that ends a few seconds after the daily cron fires would slip the retry by a whole extra day.
const PERSISTENT_MAX_DELAY_MS = 23 * 60 * 60 * 1000;

const TRANSIENT_FAILURES: ReadonlySet<QboSyncFailureCode> = new Set<QboSyncFailureCode>([
  "PROVIDER_RATE_LIMITED",
  "PROVIDER_UNAVAILABLE",
  "PROVIDER_TIMEOUT",
  "LEASE_LOST",
  "CANCELLED",
  "INTERNAL_ERROR",
]);

/**
 * Bounded back-off before the scheduler may try a connection again after `consecutiveFailures` failures in a row.
 * Transient provider failures: 15m, 30m, 1h, 2h, 4h, then 6h. Persistent non-auth failures (forbidden, malformed,
 * rejected): 6h doubling to a 24h ceiling. Terminal failures return null — the connection leaves the schedule
 * (it is no longer ACTIVE, or needs configuration) and is never retried automatically.
 */
export function computeSyncBackoffMs(code: QboSyncFailureCode, consecutiveFailures: number, retryAfterMs: number | null = null): number | null {
  if (isTerminalSyncFailure(code)) return null;
  const n = Math.max(1, Math.min(consecutiveFailures, 16));
  const transient = TRANSIENT_FAILURES.has(code);
  const base = transient ? TRANSIENT_BASE_DELAY_MS : PERSISTENT_BASE_DELAY_MS;
  const max = transient ? TRANSIENT_MAX_DELAY_MS : PERSISTENT_MAX_DELAY_MS;
  const exp = Math.min(max, base * 2 ** (n - 1));
  const hinted = retryAfterMs !== null && Number.isFinite(retryAfterMs) ? Math.min(max, Math.max(0, retryAfterMs)) : 0;
  return Math.max(exp, hinted);
}

/** UTC day bucket used in scheduler idempotency keys: `YYYY-MM-DD`. */
export function scheduleBucket(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** Map any thrown provider error onto the closed, sanitized failure vocabulary (nothing provider-supplied survives). */
export function syncFailureFromError(err: unknown): { code: QboSyncFailureCode; retryAfterMs: number | null } {
  if (!isQboProviderError(err)) return { code: "INTERNAL_ERROR", retryAfterMs: null };
  const retryAfterMs = err.retryAfterMs;
  switch (err.kind) {
    case "REFRESH_INVALID":
    case "AUTH_EXPIRED": return { code: "REAUTH_REQUIRED", retryAfterMs: null };
    case "FORBIDDEN": return { code: "PROVIDER_FORBIDDEN", retryAfterMs: null };
    case "RATE_LIMITED": return { code: "PROVIDER_RATE_LIMITED", retryAfterMs };
    case "TRANSIENT_PROVIDER_FAILURE": return { code: "PROVIDER_UNAVAILABLE", retryAfterMs };
    case "TIMEOUT": return { code: "PROVIDER_TIMEOUT", retryAfterMs };
    case "MALFORMED_RESPONSE": return { code: "PROVIDER_MALFORMED", retryAfterMs: null };
    case "CONFIGURATION_ERROR": return { code: "CONFIGURATION_UNAVAILABLE", retryAfterMs: null };
    case "CANCELLED": return { code: "CANCELLED", retryAfterMs: null };
    case "AUTHORIZATION_INVALID":
    case "NOT_FOUND":
    case "BAD_REQUEST":
    default: return { code: "PROVIDER_REJECTED", retryAfterMs: null };
  }
}

// ─── Request schemas ─────────────────────────────────────────────────────────

/**
 * The ONLY inputs an owner may supply to start a sync. There is deliberately no field for tokens, realm,
 * environment, base URL, workspace or actor: those are server-controlled.
 */
export const QboManualSyncRequestSchema = z.strictObject({
  businessId: z.string().uuid(),
  connectionId: z.string().uuid(),
  /** Optional client-generated id: repeating the same id replays the same run instead of starting another. */
  requestId: z.string().uuid().optional(),
});
export type QboManualSyncRequest = z.infer<typeof QboManualSyncRequestSchema>;

export const QboStatusQuerySchema = z.strictObject({ businessId: z.string().uuid() });

// ─── Outcomes ────────────────────────────────────────────────────────────────

export interface QboSyncCounts {
  /** Records upserted per entity (inserted + updated + unchanged-touched). */
  fetched: Record<string, number>;
  inserted: number;
  updated: number;
  unchanged: number;
  /** Provider records skipped because they were malformed or stale (older than the stored copy). */
  skipped: number;
  reportsStored: number;
  reportsChanged: number;
  reportsFailed: number;
  /** Provider query pages read (excluding count queries and by-id reads). */
  pages: number;
  /** Equal-timestamp buckets larger than a page that were closed by the two-round identity-inclusion check (a bounded guarantee under read quiescence, not an atomic snapshot). */
  tieBucketsClosed: number;
  /** Unseen records re-read by id to refresh them (inactive / moved out of the query window). */
  verifiedByRead: number;
  /** Unseen records the provider could not positively confirm. Left UNCHANGED (never flagged deleted). */
  unresolved: number;
}

export function emptySyncCounts(): QboSyncCounts {
  return { fetched: {}, inserted: 0, updated: 0, unchanged: 0, skipped: 0, reportsStored: 0, reportsChanged: 0, reportsFailed: 0, pages: 0, tieBucketsClosed: 0, verifiedByRead: 0, unresolved: 0 };
}

export type QboSyncOutcome =
  | { status: "SUCCEEDED"; runId: string; mode: QboSyncMode; counts: QboSyncCounts; changed: boolean }
  /** A bounded execution stopped at a durable checkpoint; the sync is NOT complete and continues later. */
  | { status: "CONTINUING"; runId: string; mode: QboSyncMode; counts: QboSyncCounts; changed: boolean; continuationKey: string }
  | { status: "ALREADY_COMPLETED"; runId: string; runStatus: QboSyncRunStatus }
  | { status: "BUSY"; runId: string | null; leaseExpiresAt: Date | null }
  | { status: "NOT_DUE"; nextAttemptNotBefore: Date }
  | { status: "FAILED"; runId: string | null; code: QboSyncFailureCode; terminal: boolean; nextAttemptNotBefore: Date | null };

/** Token-free status shown to an owner. */
export interface QboSyncStatusView {
  connected: boolean;
  connectionId: string | null;
  environment: "sandbox" | "production" | null;
  connectionStatus: "ACTIVE" | "REAUTH_REQUIRED" | "ERROR" | "DISCONNECTED" | null;
  reauthorizationRequired: boolean;
  syncRunning: boolean;
  /** A large sync stopped at a checkpoint and is waiting for its next execution (not a failure). */
  syncContinuing: boolean;
  lastAttemptedAt: Date | null;
  lastSucceededAt: Date | null;
  lastOutcome: "SUCCEEDED" | "PARTIAL" | "FAILED" | null;
  lastErrorCode: QboSyncFailureCode | null;
  nextAttemptNotBefore: Date | null;
  consecutiveFailures: number;
  /** Synced records currently held, by entity. */
  recordCounts: Record<string, number>;
  reportObservationCount: number;
}

// ─── Pure planning helpers ───────────────────────────────────────────────────

export interface ReportPeriod {
  /** YYYY-MM-DD, inclusive. */
  start: string;
  end: string;
}

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/** The last `count` COMPLETE calendar months (UTC) before `now`, oldest first. Deterministic for a given day. */
export function completeMonthPeriods(now: Date, count: number): ReportPeriod[] {
  const out: ReportPeriod[] = [];
  for (let i = count; i >= 1; i--) {
    const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0));
    out.push({ start: ymd(first), end: ymd(last) });
  }
  return out;
}

export const utcDate = ymd;

/** QuickBooks query datetime literal: second precision with an explicit +00:00 offset. */
export function toQboInstant(d: Date): string {
  return `${d.toISOString().slice(0, 19)}+00:00`;
}

/**
 * Choose FULL vs INCREMENTAL. FULL when nothing was ever read, when any entity lacks a watermark, or when the last FULL
 * run is older than the reconcile interval (that is the only way records Intuit stopped returning are noticed).
 */
export function chooseSyncMode(input: { now: Date; watermarks: Readonly<Record<string, Date>>; lastFullSyncAt: Date | null }): QboSyncMode {
  if (!input.lastFullSyncAt) return "FULL";
  if (input.now.getTime() - input.lastFullSyncAt.getTime() >= QBO_SYNC_FULL_RECONCILE_MS) return "FULL";
  for (const e of QBO_SYNC_QUERY_ENTITIES) if (!input.watermarks[e]) return "FULL";
  return "INCREMENTAL";
}

/** Lower bound of an incremental window for one entity, or null for a full read. */
export function incrementalLowerBound(mode: QboSyncMode, watermark: Date | undefined): Date | null {
  if (mode === "FULL" || !watermark) return null;
  return new Date(watermark.getTime() - QBO_SYNC_WATERMARK_OVERLAP_MS);
}

/**
 * Idempotency key by trigger. MANUAL is replayable by requestId. SCHEDULED is one per UTC day per lease epoch and WEBHOOK
 * coalesces per 15 minutes per lease epoch. The epoch (it increments on every lease acquisition) makes a retry after a
 * failed / abandoned / crashed attempt run under a fresh key, while two triggers racing from the SAME state still collide on
 * the unique key and replay. Same-day duplicate scheduled runs after a SUCCESS are refused by the service (NOT_DUE), not by the key.
 */
export function syncIdempotencyKey(trigger: QboSyncTrigger, now: Date, requestId: string | null, leaseEpoch: number, randomId: () => string): string {
  switch (trigger) {
    case "MANUAL": return `manual:${requestId ?? randomId()}`;
    case "SCHEDULED": return `scheduled:${scheduleBucket(now)}:${leaseEpoch}`;
    case "WEBHOOK": return `webhook:${Math.floor(now.getTime() / (15 * 60 * 1000))}:${leaseEpoch}`;
  }
}

// ─── Due gate (pure; evaluated before AND inside the lease transaction) ─────

export interface DueGateState {
  lastAttemptedAt: Date | null;
  lastSucceededAt: Date | null;
  nextAttemptNotBefore: Date | null;
  webhookHintAt: Date | null;
  /** An unfinished sync (checkpoint) exists: its next execution is due regardless of the daily cadence or a missing hint. */
  continuationPending?: boolean;
}

/**
 * Is a run of this trigger due? null = yes, otherwise the earliest time it may run.
 *  - MANUAL: spaced by the cooldown (a loop of fresh request ids must not burn the realm's quota).
 *  - SCHEDULED / WEBHOOK: inside a failure back-off window they wait; SCHEDULED is one successful run per UTC day UNLESS an unserved
 *    webhook hint exists (so a hint that a webhook task could not serve is still served by the next scheduler pass);
 *    WEBHOOK runs only while an unserved hint exists (this is what coalesces many tasks for one burst into one sync).
 */
export function evaluateDueGate(trigger: QboSyncTrigger, state: DueGateState | null, now: Date, cooldownMs: number): Date | null {
  if (!state) return trigger === "WEBHOOK" ? now : null;
  if (trigger === "MANUAL") {
    if (cooldownMs > 0 && state.lastAttemptedAt && now.getTime() - state.lastAttemptedAt.getTime() < cooldownMs) {
      return new Date(state.lastAttemptedAt.getTime() + cooldownMs);
    }
    return null;
  }
  if (state.nextAttemptNotBefore && state.nextAttemptNotBefore.getTime() > now.getTime()) return state.nextAttemptNotBefore;
  if (state.continuationPending) return null;
  if (trigger === "SCHEDULED" && !state.webhookHintAt && state.lastSucceededAt && scheduleBucket(state.lastSucceededAt) === scheduleBucket(now)) {
    return new Date(Date.parse(`${scheduleBucket(now)}T00:00:00Z`) + 86_400_000);
  }
  if (trigger === "WEBHOOK" && !state.webhookHintAt) return now;
  return null;
}

// ─── Continuation checkpoint ─────────────────────────────────────────────────

/**
 * The durable position of an unfinished sync. Written in the SAME transaction as the page it describes, so a crash can neither
 * lose a persisted page's progress nor record progress for a page that was not persisted. The durable per-entity WATERMARKS are
 * not part of it and do not move until the sync has PROVEN exhaustion (all entities, then reports).
 */
export const QboContinuationSchema = z.object({
  v: z.literal(1),
  /** Identifies the logical sync across executions; mirror rows carry it as `last_seen_sync_id`. */
  syncId: z.string().uuid(),
  mode: z.enum(QBO_SYNC_MODES),
  /** Fixed upper bound of the whole sync. Becomes every entity's watermark on completion. */
  cutoff: z.string().datetime(),
  /** Index into QBO_SYNC_QUERY_ENTITIES of the entity being read. */
  entityIndex: z.number().int().min(0).max(QBO_SYNC_QUERY_ENTITIES.length),
  /** Keyset cursor (floor-to-second ISO instant) within that entity, or null before the first page. */
  cursor: z.string().datetime().nullable(),
  /** In-progress enumeration of one equal-timestamp bucket. */
  tie: z.object({
    second: z.string().datetime(),
    offset: z.number().int().min(0),
    stalledPasses: z.number().int().min(0),
    lastSeen: z.number().int().min(0),
    /** Ids (bounded) of records in this second that the normalizer REJECTED: never stored, but real members of the provider's count. */
    rejected: z.array(z.string().max(128)).max(50).default([]),
    /** The provider's count for the bucket at the START of the current pass (null until probed). A pass never reads past it. */
    total: z.number().int().min(0).nullable(),
    /**
     * Identity-inclusion check in progress (separate provider calls are NOT an atomic snapshot: Intuit documents no read snapshot). Two full rounds over the ids this sync stored for the second; each batch asks the provider
     * for count(window AND Id IN batch). `matched` is the running sum; the bucket may close only when it equals the provider's `total`.
     */
    verify: z.object({
      round: z.number().int().min(1).max(2),
      after: z.string().max(128).nullable(),
      matched: z.number().int().min(0),
      total: z.number().int().min(0),
      /** Count of the entity's records stamped AFTER the sync cutoff when verification began: an edit anywhere changes it. */
      edits: z.number().int().min(0).default(0),
    }).nullable().default(null),
  }).nullable(),
  /** Entities whose FULL reconciliation (verify reads) has finished. */
  reconciled: z.array(z.string()).max(8),
  seq: z.number().int().min(0),
  /** Some execution of this logical sync (or a failed attempt of it) persisted a provider change: the re-evaluation marker must survive resumes. */
  changed: z.boolean().default(false),
  /** The attempt ended PROVIDER_INCOMPLETE: do NOT resume this checkpoint; the next attempt starts a fresh logical sync (keeping `changed`). */
  restart: z.boolean().default(false),
});
export type QboContinuation = z.infer<typeof QboContinuationSchema>;

/** Parse a stored checkpoint; anything unreadable is treated as ABSENT (the sync restarts cleanly rather than trusting garbage). */
export function parseContinuation(raw: unknown): QboContinuation | null {
  const r = QboContinuationSchema.safeParse(raw);
  return r.success ? r.data : null;
}

/** Floor a date to whole seconds (QuickBooks timestamps are second-precision; all window logic is in whole seconds). */
export function floorSecond(d: Date): Date {
  return new Date(Math.floor(d.getTime() / 1000) * 1000);
}
