/**
 * QuickBooks Online — frozen cross-subsystem contracts.
 *
 * These interfaces are the boundaries between the auth/token layer, the
 * provider adapter, the sync/reconciliation layer, the governed write service
 * and the owner UI. Pure module: types, error class and small pure helpers only.
 */

import type { QboEntityName, QboReportName } from "./qbo-entities";
import type { QboEnvironment } from "./qbo-config";

// ─── Provider errors ────────────────────────────────────────────────────────

/**
 * Classified provider failure.
 *
 * AUTH          401 / invalid_grant — credentials no longer valid (reconnect).
 * FORBIDDEN     403 — the connected user/app lacks permission.
 * VALIDATION    400 business-rule / ValidationFault (not retryable).
 * STALE_OBJECT  fault 5010 — SyncToken is stale; refetch before any retry.
 * NOT_FOUND     entity does not exist (or was deleted) in the company.
 * DUPLICATE     QBO rejected a duplicate (e.g. duplicate name, fault 6240).
 * RATE_LIMITED  429 — throttled; honour retryAfterMs.
 * TRANSIENT     5xx / network failure before a response.
 * TIMEOUT       no response within the client deadline.
 * MALFORMED     response body could not be parsed / did not match the contract.
 * CONFIG        connector unavailable or misconfigured (never reached QBO).
 */
export type QboErrorKind =
  | "AUTH"
  | "FORBIDDEN"
  | "VALIDATION"
  | "STALE_OBJECT"
  | "NOT_FOUND"
  | "DUPLICATE"
  | "RATE_LIMITED"
  | "TRANSIENT"
  | "TIMEOUT"
  | "MALFORMED"
  | "CONFIG";

export interface QboFaultDetail {
  code: string | null;
  message: string;
  detail: string | null;
  element: string | null;
}

export class QboApiError extends Error {
  readonly kind: QboErrorKind;
  readonly httpStatus: number | null;
  readonly faultType: string | null;
  readonly faults: QboFaultDetail[];
  /** Intuit transaction id (intuit_tid header) for support correlation. Not a secret. */
  readonly intuitTid: string | null;
  readonly retryAfterMs: number | null;
  /**
   * True when the request MAY have been committed by QBO even though no
   * successful response was received (timeout / connection loss after send /
   * 5xx on a write). Writes in this state must be reconciled — re-sent with the
   * SAME requestid — never blindly retried with a new one.
   */
  readonly ambiguous: boolean;

  constructor(init: {
    kind: QboErrorKind;
    message: string;
    httpStatus?: number | null;
    faultType?: string | null;
    faults?: QboFaultDetail[];
    intuitTid?: string | null;
    retryAfterMs?: number | null;
    ambiguous?: boolean;
  }) {
    super(init.message);
    this.name = "QboApiError";
    this.kind = init.kind;
    this.httpStatus = init.httpStatus ?? null;
    this.faultType = init.faultType ?? null;
    this.faults = init.faults ?? [];
    this.intuitTid = init.intuitTid ?? null;
    this.retryAfterMs = init.retryAfterMs ?? null;
    this.ambiguous = init.ambiguous ?? false;
  }

  get retryable(): boolean {
    return this.kind === "RATE_LIMITED" || this.kind === "TRANSIENT" || this.kind === "TIMEOUT";
  }
}

export function isQboApiError(e: unknown): e is QboApiError {
  return e instanceof QboApiError;
}

// ─── Token provider (auth layer → adapter) ──────────────────────────────────

export interface QboConnectionCredentials {
  accessToken: string;
  realmId: string;
  environment: QboEnvironment;
}

export interface QboTokenProvider {
  /** Returns a non-expired access token, refreshing (race-safely) when needed. */
  getCredentials(): Promise<QboConnectionCredentials>;
  /** Called by the adapter after a 401: refresh even if the token looks unexpired. */
  forceRefresh(rejectedAccessToken: string): Promise<QboConnectionCredentials>;
}

// ─── Provider adapter (adapter → sync / write service) ─────────────────────

/** Any QBO entity body. Kept structural: the adapter validates, it does not model QBO. */
export type QboEntityBody = Record<string, unknown> & {
  Id?: string;
  SyncToken?: string;
  MetaData?: { CreateTime?: string; LastUpdatedTime?: string };
};

export interface QboQueryPage {
  entity: QboEntityName;
  items: QboEntityBody[];
  startPosition: number;
  maxResults: number;
}

export interface QboCdcEntityChanges {
  entity: QboEntityName;
  /** Live (created/updated) entities. */
  changed: QboEntityBody[];
  /** Deleted entities: QBO returns { Id, status: "Deleted", MetaData }. */
  deleted: Array<{ Id: string; lastUpdated: string | null }>;
  /** True when QBO returned the 1000-object cap — caller must fall back to paginated query. */
  truncated: boolean;
}

export interface QboCdcResult {
  entities: QboCdcEntityChanges[];
  /** Server time of the CDC response, used as the next changedSince cursor. */
  serverTime: string | null;
}

export interface QboReportParams {
  start_date?: string;
  end_date?: string;
  report_date?: string;
  accounting_method?: "Accrual" | "Cash";
  aging_period?: string;
  num_periods?: string;
  summarize_column_by?: string;
}

export interface QboWriteOptions {
  /** Deterministic idempotency id sent as QBO `requestid`; re-sent unchanged on every retry. */
  requestId: string;
}

export interface QboClient {
  readonly realmId: string;
  readonly environment: QboEnvironment;
  companyInfo(): Promise<QboEntityBody>;
  preferences(): Promise<QboEntityBody>;
  read(entity: QboEntityName, id: string): Promise<QboEntityBody>;
  query(entity: QboEntityName, opts: { where?: string; startPosition: number; maxResults: number; orderBy?: string }): Promise<QboQueryPage>;
  cdc(entities: readonly QboEntityName[], changedSince: Date): Promise<QboCdcResult>;
  report(name: QboReportName, params: QboReportParams): Promise<Record<string, unknown>>;
  create(entity: QboEntityName, body: QboEntityBody, opts: QboWriteOptions): Promise<QboEntityBody>;
  /** Sparse update. body MUST carry Id and the current SyncToken. */
  update(entity: QboEntityName, body: QboEntityBody & { Id: string; SyncToken: string }, opts: QboWriteOptions): Promise<QboEntityBody>;
  delete(entity: QboEntityName, ref: { Id: string; SyncToken: string }, opts: QboWriteOptions): Promise<QboEntityBody>;
  void(entity: QboEntityName, ref: { Id: string; SyncToken: string }, opts: QboWriteOptions): Promise<QboEntityBody>;
  /** Soft-delete a name-list entity: sparse update Active=false. */
  inactivate(entity: QboEntityName, ref: { Id: string; SyncToken: string }, opts: QboWriteOptions): Promise<QboEntityBody>;
}

// ─── Sync state (persisted on OwnerConnector.syncState; no secrets) ─────────

export type QboSyncPhase = "INITIAL" | "INCREMENTAL";
export type QboSyncRunStatus = "SUCCESS" | "PARTIAL" | "FAILED";

export interface QboInitialSyncProgress {
  /** Index into QBO_SYNC_ENTITY_ORDER of the entity currently being paged. */
  entityIndex: number;
  /** Next 1-based STARTPOSITION for that entity. */
  startPosition: number;
  startedAt: string;
  completedAt: string | null;
}

export interface QboSyncState {
  version: 1;
  phase: QboSyncPhase;
  initial: QboInitialSyncProgress;
  /** ISO timestamp: next CDC changedSince (server time of last successful CDC / initial-sync start). */
  cdcCursor: string | null;
  lastRunId: string | null;
  lastRunAt: string | null;
  lastRunStatus: QboSyncRunStatus | null;
  /** Owner-safe summary of the last run (no provider payloads, no tokens). */
  lastRunSummary: string | null;
  lastReportsAt: string | null;
  lastMaterializedPeriod: string | null;
  recordCounts: Partial<Record<QboEntityName, number>>;
}

export function initialQboSyncState(now: Date): QboSyncState {
  return {
    version: 1,
    phase: "INITIAL",
    initial: { entityIndex: 0, startPosition: 1, startedAt: now.toISOString(), completedAt: null },
    cdcCursor: null,
    lastRunId: null,
    lastRunAt: null,
    lastRunStatus: null,
    lastRunSummary: null,
    lastReportsAt: null,
    lastMaterializedPeriod: null,
    recordCounts: {},
  };
}

export function parseQboSyncState(raw: unknown): QboSyncState | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<QboSyncState>;
  if (r.version !== 1 || (r.phase !== "INITIAL" && r.phase !== "INCREMENTAL") || !r.initial) return null;
  return r as QboSyncState;
}

// ─── Scheduler ──────────────────────────────────────────────────────────────

export const TASK_NAME_QUICKBOOKS_SYNC = "quickbooks-sync";

export type QboSyncTrigger = "INITIAL" | "MANUAL" | "SCHEDULED" | "WEBHOOK";

export interface QboSyncTaskPayload {
  connectorId: string;
  trigger: QboSyncTrigger;
  /**
   * Real user id recorded as the audit actor for OpsIQ records materialized by
   * this run (canonical snapshot writers require a users.id FK). MANUAL/INITIAL:
   * the requesting owner. SCHEDULED/WEBHOOK: the owner who connected QuickBooks
   * (OwnerConnector.registeredBy). Never taken from a webhook body.
   */
  requestedBy: string;
}

// ─── Owner-facing status DTO (never contains tokens, realm internals or payloads) ─

export type QboFreshness = "FRESH" | "STALE" | "NEVER_SYNCED";

/** A mirror older than this is reported STALE to the owner. */
export const QBO_STALE_AFTER_HOURS = 26;

export interface QuickBooksStatusDTO {
  available: boolean;
  /** Owner-safe reason when unavailable (never lists secret values). */
  unavailableReason: string | null;
  environment: QboEnvironment | null;
  webhooksEnabled: boolean;
  connector: null | {
    id: string;
    status: string;
    businessId: string | null;
    companyName: string | null;
    connectedAt: string;
    lastSyncAt: string | null;
    lastSyncRecords: number | null;
    syncFailureMessage: string | null;
    needsReconnect: boolean;
    refreshTokenExpiresAt: string | null;
    sync: {
      phase: QboSyncPhase | null;
      running: boolean;
      lastRunStatus: QboSyncRunStatus | null;
      lastRunAt: string | null;
      lastRunSummary: string | null;
      initialProgress: { completedEntities: number; totalEntities: number } | null;
      freshness: QboFreshness;
    };
  };
}
