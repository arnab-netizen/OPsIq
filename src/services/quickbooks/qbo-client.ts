/**
 * QuickBooks Online API adapter — implements the frozen `QboClient` contract
 * (src/domain/quickbooks/qbo-contracts.ts) over native `fetch`.
 *
 * Design:
 *  - Reads (read/query/cdc/report) retry on RATE_LIMITED/TRANSIENT/TIMEOUT up
 *    to `maxReadRetries` times with exponential backoff + full jitter,
 *    honouring `Retry-After` when present (capped).
 *  - Writes (create/update/delete/void/inactivate) retry the SAME `requestId`
 *    on RATE_LIMITED (never committed) and TRANSIENT/TIMEOUT (safe to re-send
 *    because QBO deduplicates writes by requestid per realm — see
 *    QboWriteOptions doc in qbo-contracts.ts). A write that exhausts its
 *    retries keeps the `ambiguous` flag from the underlying QboApiError so
 *    the caller knows to reconcile rather than blindly resubmit with a new id.
 *  - A single 401 triggers `tokenProvider.forceRefresh` and one retry (does
 *    not consume the read/write retry budget); a second 401 is a terminal AUTH.
 *  - Every response is shape-checked before being handed back; a body that
 *    doesn't match the documented QBO shape is rejected as MALFORMED rather
 *    than passed through partially parsed.
 *  - No Batch API: OpsIQ has no product need for batched QBO requests today
 *    (documented here rather than silently omitted).
 */

import {
  QBO_API_HOSTS,
  QBO_CDC_MAX_LOOKBACK_DAYS,
  QBO_MINOR_VERSION,
  QBO_QUERY_MAX_RESULTS,
  isValidQboEntityId,
  isValidRealmId,
} from "@/domain/quickbooks/qbo-config";
import { QBO_ENTITIES, type QboEntityName, type QboReportName } from "@/domain/quickbooks/qbo-entities";
import {
  QboApiError,
  isQboApiError,
  type QboCdcEntityChanges,
  type QboCdcResult,
  type QboClient,
  type QboEntityBody,
  type QboQueryPage,
  type QboReportParams,
  type QboTokenProvider,
  type QboWriteOptions,
} from "@/domain/quickbooks/qbo-contracts";
import { classifyQboHttpFailure, classifyQboNetworkFailure } from "@/domain/quickbooks/qbo-errors";

// ─── Injectable primitives (deterministic tests) ───────────────────────────

export type QboFetch = (url: string, init: RequestInit) => Promise<Response>;
export type QboSleep = (ms: number) => Promise<void>;
export type QboRandom = () => number;
export type QboNow = () => Date;

export interface CreateQboClientOptions {
  tokenProvider: QboTokenProvider;
  fetchImpl?: QboFetch;
  sleep?: QboSleep;
  random?: QboRandom;
  now?: QboNow;
  timeoutMs?: number;
  maxReadRetries?: number;
  maxWriteRetries?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_READ_RETRIES = 3;
const DEFAULT_MAX_WRITE_RETRIES = 2;
const BACKOFF_BASE_MS = 500;
const BACKOFF_CAP_MS = 60_000;
const CDC_ENTITY_TRUNCATION_LIMIT = 1000;

const REQUEST_ID_PATTERN = /^[A-Za-z0-9-]{1,50}$/;
const WHERE_FORBIDDEN_PATTERN = /[;\\]/;

const defaultFetch: QboFetch = (url, init) => fetch(url, init);
const defaultSleep: QboSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const defaultRandom: QboRandom = () => Math.random();
const defaultNow: QboNow = () => new Date();

// ─── Small JSON helpers ─────────────────────────────────────────────────────

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function malformed(reason: string): QboApiError {
  const ownerSafeText = `QuickBooks response did not match the expected shape: ${reason}`;
  const built = new QboApiError({ kind: "MALFORMED", message: ownerSafeText });
  return built;
}

function validationError(ownerSafeText: string): QboApiError {
  const built = new QboApiError({ kind: "VALIDATION", message: ownerSafeText });
  return built;
}

// ─── Request id / where-clause validation ──────────────────────────────────

function assertValidRequestId(requestId: string): void {
  if (!REQUEST_ID_PATTERN.test(requestId)) {
    throw validationError("requestId must match /^[A-Za-z0-9-]{1,50}$/");
  }
}

function assertValidWhere(where: string): void {
  if (WHERE_FORBIDDEN_PATTERN.test(where)) {
    throw validationError("WHERE clause contains a forbidden character (';' or '\\\\')");
  }
  const quoteCount = (where.match(/'/g) ?? []).length;
  if (quoteCount % 2 !== 0) {
    throw validationError("WHERE clause has an unbalanced single quote");
  }
}

function assertValidEntityId(id: string, field = "id"): void {
  if (!isValidQboEntityId(id)) {
    throw validationError(`${field} is not a valid QuickBooks entity id`);
  }
}

// ─── Client factory ─────────────────────────────────────────────────────────

export async function createQboClient(opts: CreateQboClientOptions): Promise<QboClient> {
  const fetchImpl = opts.fetchImpl ?? defaultFetch;
  const sleep = opts.sleep ?? defaultSleep;
  const random = opts.random ?? defaultRandom;
  const now = opts.now ?? defaultNow;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxReadRetries = opts.maxReadRetries ?? DEFAULT_MAX_READ_RETRIES;
  const maxWriteRetries = opts.maxWriteRetries ?? DEFAULT_MAX_WRITE_RETRIES;
  const tokenProvider = opts.tokenProvider;

  const initialCredentials = await tokenProvider.getCredentials();
  if (!isValidRealmId(initialCredentials.realmId)) {
    throw validationError("realmId returned by tokenProvider is not a valid QuickBooks realm id");
  }
  const realmId = initialCredentials.realmId;
  const environment = initialCredentials.environment;
  const host = QBO_API_HOSTS[environment];
  const baseUrl = `${host}/v3/company/${realmId}`;

  function buildUrl(path: string, params: Record<string, string | number | undefined>): string {
    const search = new URLSearchParams();
    search.set("minorversion", String(QBO_MINOR_VERSION));
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) search.set(key, String(value));
    }
    return `${baseUrl}${path}?${search.toString()}`;
  }

  // ── Backoff ────────────────────────────────────────────────────────────
  function computeDelayMs(err: QboApiError, attempt: number): number {
    if (err.retryAfterMs !== null) return Math.min(err.retryAfterMs, BACKOFF_CAP_MS);
    const cap = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** attempt);
    return random() * cap;
  }

  // ── One HTTP attempt ──────────────────────────────────────────────────
  async function sendOnce(
    url: string,
    init: { method: string; headers: Record<string, string>; body?: string },
    isWrite: boolean,
  ): Promise<{ status: number; json: unknown }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetchImpl(url, { ...init, signal: controller.signal });
    } catch (err) {
      const timedOut = err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError");
      throw classifyQboNetworkFailure({ error: err, isWrite, timedOut });
    } finally {
      clearTimeout(timer);
    }

    let text = "";
    try {
      text = await res.text();
    } catch (err) {
      throw classifyQboNetworkFailure({ error: err, isWrite, timedOut: false });
    }

    let json: unknown;
    if (text.length > 0) {
      try {
        json = JSON.parse(text);
      } catch {
        if (!res.ok) {
          // Non-JSON error body (e.g. gateway HTML) — classify on status alone.
          json = undefined;
        } else {
          throw malformed("response body was not valid JSON");
        }
      }
    }

    if (!res.ok) {
      throw classifyQboHttpFailure({ status: res.status, body: json, headers: res.headers, isWrite, now: now() });
    }
    return { status: res.status, json };
  }

  // ── Retry / auth-refresh orchestration ───────────────────────────────
  async function withRetry<T>(
    isWrite: boolean,
    maxRetries: number,
    run: (accessToken: string) => Promise<T>,
  ): Promise<T> {
    let token = (await tokenProvider.getCredentials()).accessToken;
    let usedForceRefresh = false;
    let attempt = 0;

    for (;;) {
      try {
        return await run(token);
      } catch (err) {
        if (!isQboApiError(err)) throw err;

        if (err.kind === "AUTH" && !usedForceRefresh) {
          usedForceRefresh = true;
          const refreshed = await tokenProvider.forceRefresh(token);
          token = refreshed.accessToken;
          continue;
        }

        if (err.retryable && attempt < maxRetries) {
          attempt += 1;
          await sleep(computeDelayMs(err, attempt));
          continue;
        }

        throw err;
      }
    }
  }

  function headers(isWrite: boolean, token: string): Record<string, string> {
    const h: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    };
    if (isWrite) h["Content-Type"] = "application/json";
    return h;
  }

  // ── Response-shape extraction ────────────────────────────────────────
  function extractEntity(entityKey: string, json: unknown): QboEntityBody {
    const rec = asRecord(json);
    const entity = rec ? asRecord(rec[entityKey]) : null;
    if (!entity) throw malformed(`missing '${entityKey}'`);
    return entity as QboEntityBody;
  }

  function extractQueryPage(entity: QboEntityName, json: unknown, startPosition: number): QboQueryPage {
    const rec = asRecord(json);
    const qr = rec ? asRecord(rec.QueryResponse) : null;
    if (!qr) throw malformed("missing 'QueryResponse'");
    const items = asArray(qr[entity]).filter((x): x is QboEntityBody => asRecord(x) !== null) as QboEntityBody[];
    const sp = typeof qr.startPosition === "number" ? qr.startPosition : startPosition;
    const mr = typeof qr.maxResults === "number" ? qr.maxResults : items.length;
    return { entity, items, startPosition: sp, maxResults: mr };
  }

  function extractCdc(entities: readonly QboEntityName[], json: unknown): QboCdcResult {
    const rec = asRecord(json);
    const cdcArr = rec ? asArray(rec.CDCResponse) : [];
    const first = asRecord(cdcArr[0]);
    if (!first) throw malformed("missing 'CDCResponse'");
    const qrList = asArray(first.QueryResponse)
      .map(asRecord)
      .filter((x): x is Record<string, unknown> => x !== null);

    const results: QboCdcEntityChanges[] = entities.map((entity) => {
      const match = qrList.find((qr) => entity in qr);
      const rawItems = match ? asArray(match[entity]) : [];
      const changed: QboEntityBody[] = [];
      const deleted: Array<{ Id: string; lastUpdated: string | null }> = [];

      for (const raw of rawItems) {
        const item = asRecord(raw);
        if (!item) continue;
        if (item.status === "Deleted") {
          const md = asRecord(item.MetaData);
          deleted.push({
            Id: typeof item.Id === "string" ? item.Id : "",
            lastUpdated: md && typeof md.LastUpdatedTime === "string" ? md.LastUpdatedTime : null,
          });
        } else {
          changed.push(item as QboEntityBody);
        }
      }

      const totalCount = match && typeof match.totalCount === "number" ? match.totalCount : null;
      const truncated = rawItems.length >= CDC_ENTITY_TRUNCATION_LIMIT || (totalCount !== null && totalCount > rawItems.length);
      return { entity, changed, deleted, truncated };
    });

    const time = rec && typeof rec.time === "string" ? rec.time : null;
    return { entities: results, serverTime: time };
  }

  // ── QboClient methods ─────────────────────────────────────────────────

  async function companyInfo(): Promise<QboEntityBody> {
    return withRetry(false, maxReadRetries, async (token) => {
      const url = buildUrl(`/companyinfo/${realmId}`, {});
      const { json } = await sendOnce(url, { method: "GET", headers: headers(false, token) }, false);
      return extractEntity("CompanyInfo", json);
    });
  }

  async function preferences(): Promise<QboEntityBody> {
    return withRetry(false, maxReadRetries, async (token) => {
      const url = buildUrl("/preferences", {});
      const { json } = await sendOnce(url, { method: "GET", headers: headers(false, token) }, false);
      return extractEntity("Preferences", json);
    });
  }

  async function read(entity: QboEntityName, id: string): Promise<QboEntityBody> {
    assertValidEntityId(id);
    const spec = QBO_ENTITIES[entity];
    return withRetry(false, maxReadRetries, async (token) => {
      const url = buildUrl(`/${spec.resource}/${id}`, {});
      const { json } = await sendOnce(url, { method: "GET", headers: headers(false, token) }, false);
      return extractEntity(entity, json);
    });
  }

  async function query(
    entity: QboEntityName,
    queryOpts: { where?: string; startPosition: number; maxResults: number; orderBy?: string },
  ): Promise<QboQueryPage> {
    if (queryOpts.where) assertValidWhere(queryOpts.where);
    const maxResults = Math.min(queryOpts.maxResults, QBO_QUERY_MAX_RESULTS);

    let select = `SELECT * FROM ${entity}`;
    if (queryOpts.where) select += ` WHERE ${queryOpts.where}`;
    if (queryOpts.orderBy) select += ` ORDERBY ${queryOpts.orderBy}`;
    select += ` STARTPOSITION ${queryOpts.startPosition} MAXRESULTS ${maxResults}`;

    return withRetry(false, maxReadRetries, async (token) => {
      const url = buildUrl("/query", { query: select });
      const { json } = await sendOnce(url, { method: "GET", headers: headers(false, token) }, false);
      return extractQueryPage(entity, json, queryOpts.startPosition);
    });
  }

  async function cdc(entities: readonly QboEntityName[], changedSince: Date): Promise<QboCdcResult> {
    const ageMs = now().getTime() - changedSince.getTime();
    if (ageMs > QBO_CDC_MAX_LOOKBACK_DAYS * 24 * 60 * 60 * 1000) {
      throw validationError(`changedSince is older than the ${QBO_CDC_MAX_LOOKBACK_DAYS}-day CDC lookback window; a full resync is required`);
    }
    return withRetry(false, maxReadRetries, async (token) => {
      const url = buildUrl("/cdc", { entities: entities.join(","), changedSince: changedSince.toISOString() });
      const { json } = await sendOnce(url, { method: "GET", headers: headers(false, token) }, false);
      return extractCdc(entities, json);
    });
  }

  async function report(name: QboReportName, params: QboReportParams): Promise<Record<string, unknown>> {
    return withRetry(false, maxReadRetries, async (token) => {
      const url = buildUrl(`/reports/${name}`, params as Record<string, string | undefined>);
      const { json } = await sendOnce(url, { method: "GET", headers: headers(false, token) }, false);
      const rec = asRecord(json);
      if (!rec) throw malformed("report body was not a JSON object");
      return rec;
    });
  }

  async function create(entity: QboEntityName, body: QboEntityBody, opts: QboWriteOptions): Promise<QboEntityBody> {
    assertValidRequestId(opts.requestId);
    const spec = QBO_ENTITIES[entity];
    if (!spec.create) throw validationError(`${entity} does not support create`);

    return withRetry(true, maxWriteRetries, async (token) => {
      const url = buildUrl(`/${spec.resource}`, { requestid: opts.requestId });
      const { json } = await sendOnce(url, { method: "POST", headers: headers(true, token), body: JSON.stringify(body) }, true);
      return extractEntity(entity, json);
    });
  }

  async function update(
    entity: QboEntityName,
    body: QboEntityBody & { Id: string; SyncToken: string },
    opts: QboWriteOptions,
  ): Promise<QboEntityBody> {
    assertValidRequestId(opts.requestId);
    assertValidEntityId(body.Id, "Id");
    const spec = QBO_ENTITIES[entity];
    if (!spec.sparseUpdate) throw validationError(`${entity} does not support update`);

    const outBody = { ...body, sparse: true };
    return withRetry(true, maxWriteRetries, async (token) => {
      const url = buildUrl(`/${spec.resource}`, { requestid: opts.requestId });
      const { json } = await sendOnce(url, { method: "POST", headers: headers(true, token), body: JSON.stringify(outBody) }, true);
      return extractEntity(entity, json);
    });
  }

  async function del(entity: QboEntityName, ref: { Id: string; SyncToken: string }, opts: QboWriteOptions): Promise<QboEntityBody> {
    assertValidRequestId(opts.requestId);
    assertValidEntityId(ref.Id, "Id");
    const spec = QBO_ENTITIES[entity];
    if (!spec.delete) throw validationError(`${entity} does not support delete`);

    return withRetry(true, maxWriteRetries, async (token) => {
      const url = buildUrl(`/${spec.resource}`, { operation: "delete", requestid: opts.requestId });
      const outBody = { Id: ref.Id, SyncToken: ref.SyncToken };
      const { json } = await sendOnce(url, { method: "POST", headers: headers(true, token), body: JSON.stringify(outBody) }, true);
      return extractEntity(entity, json);
    });
  }

  async function voidTxn(entity: QboEntityName, ref: { Id: string; SyncToken: string }, opts: QboWriteOptions): Promise<QboEntityBody> {
    assertValidRequestId(opts.requestId);
    assertValidEntityId(ref.Id, "Id");
    const spec = QBO_ENTITIES[entity];
    if (spec.void === null) throw validationError(`${entity} does not support void`);

    return withRetry(true, maxWriteRetries, async (token) => {
      if (spec.void === "operation-void") {
        const url = buildUrl(`/${spec.resource}`, { operation: "void", requestid: opts.requestId });
        const outBody = { Id: ref.Id, SyncToken: ref.SyncToken };
        const { json } = await sendOnce(url, { method: "POST", headers: headers(true, token), body: JSON.stringify(outBody) }, true);
        return extractEntity(entity, json);
      }
      // update-include-void
      const url = buildUrl(`/${spec.resource}`, { operation: "update", include: "void", requestid: opts.requestId });
      const outBody = { Id: ref.Id, SyncToken: ref.SyncToken, sparse: true };
      const { json } = await sendOnce(url, { method: "POST", headers: headers(true, token), body: JSON.stringify(outBody) }, true);
      return extractEntity(entity, json);
    });
  }

  async function inactivate(entity: QboEntityName, ref: { Id: string; SyncToken: string }, opts: QboWriteOptions): Promise<QboEntityBody> {
    assertValidRequestId(opts.requestId);
    assertValidEntityId(ref.Id, "Id");
    const spec = QBO_ENTITIES[entity];
    if (!spec.inactivate) throw validationError(`${entity} does not support inactivate`);

    return withRetry(true, maxWriteRetries, async (token) => {
      const url = buildUrl(`/${spec.resource}`, { requestid: opts.requestId });
      const outBody = { Id: ref.Id, SyncToken: ref.SyncToken, sparse: true, Active: false };
      const { json } = await sendOnce(url, { method: "POST", headers: headers(true, token), body: JSON.stringify(outBody) }, true);
      return extractEntity(entity, json);
    });
  }

  return {
    realmId,
    environment,
    companyInfo,
    preferences,
    read,
    query,
    cdc,
    report,
    create,
    update,
    delete: del,
    void: voidTxn,
    inactivate,
  };
}
