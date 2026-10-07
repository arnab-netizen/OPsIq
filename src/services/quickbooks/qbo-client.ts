/**
 * QuickBooks Online — READ-ONLY API client (native fetch).
 *
 * Surface: company info, read one entity by id, structured queries (with pagination primitives), and
 * the allowlisted reports. Every request is an HTTP GET built from fixed hosts and allowlisted
 * resource names; there is deliberately NO create / update / delete / void / sparse-update / batch
 * method, and the only HTTP verb used in this file is GET.
 *
 * Safety properties
 *  - Host: the base URL comes from the validated config (two fixed Intuit hosts); the realm id is
 *    pattern-checked (digits only) before it is placed in the path; the final URL's origin is re-checked.
 *  - Auth: the bearer token comes from `getAccessToken()` on every attempt (so a refreshed token is used)
 *    and is checked to be a header-safe token. A 401 triggers AT MOST ONE `onAuthExpired()` refresh and one
 *    retry; a second 401 is a terminal AUTH_EXPIRED — there is no refresh loop.
 *  - Throttling: every attempt acquires a per-realm permit first (QboRealmRateLimiter, PROCESS_LOCAL).
 *    HTTP 429 penalizes the whole realm and retries with bounded back-off honoring Retry-After.
 *  - Retries: RATE_LIMITED / TRANSIENT_PROVIDER_FAILURE / TIMEOUT retry up to `maxRetries` (default 3) with
 *    exponential back-off and jitter, each wait capped; nothing else retries.
 *  - Errors: only QboProviderError (fixed operator-safe message + secret-free diagnostics incl. intuit_tid).
 *    Response bodies are parsed, never forwarded. Nothing is logged here.
 *  - Cancellation: an AbortSignal (e.g. a scheduler TaskContext.signal) cancels waiting, in-flight and
 *    back-off sleeping.
 */

import { z } from "zod";
import {
  QBO_PROVIDER_LIMITS,
  isResolvedQboConfig,
  isValidRealmId,
  type QboProviderConfig,
} from "@/domain/quickbooks/qbo-config";
import {
  QboProviderError,
  classifyApiHttpFailure,
  sanitizeProviderCode,
} from "@/domain/quickbooks/qbo-errors";
import {
  buildQboQuery,
  isReadableEntity,
  isReportName,
  validateReportParams,
  type QboQuerySpec,
  type QboReadableEntity,
  type QboReportName,
  type QboReportParams,
} from "@/domain/quickbooks/qbo-read-catalog";
import { qboHttp, parseJsonObjectLenient, parseRetryAfterMs, type QboFetch } from "./qbo-http";
import { getSharedQboRateLimiter, type QboRealmRateLimiter } from "./qbo-rate-limiter";

const ACCESS_TOKEN_PATTERN = /^[\x21-\x7e]{1,8192}$/;
const ENTITY_ID_PATTERN = /^[0-9]{1,20}$/;
const MAX_API_BODY_BYTES = 20 * 1024 * 1024;

export interface QboClientOptions {
  config: QboProviderConfig;
  realmId: string;
  /** Returns the current access token. Called on every attempt. */
  getAccessToken: () => Promise<string>;
  /**
   * Called at most once per request after a 401. Return a fresh access token (after the caller has
   * refreshed and persisted it), or null to give up. Omit to treat a 401 as terminal.
   */
  onAuthExpired?: () => Promise<string | null>;
  fetchImpl?: QboFetch;
  limiter?: QboRealmRateLimiter;
  /** Default signal for every call; a per-call signal overrides it. */
  signal?: AbortSignal;
  /** Per-request deadline. Default 30s. */
  timeoutMs?: number;
  /** Retries after the first attempt, for retryable failures. Default 3. */
  maxRetries?: number;
  /** Upper bound for one back-off wait. Default 60s (Intuit asks for ~60s after a 429). */
  maxBackoffMs?: number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  random?: () => number;
}

export interface QboCallOptions {
  signal?: AbortSignal;
}

export interface QboQueryPage {
  entity: QboReadableEntity;
  records: Array<Record<string, unknown>>;
  startPosition: number;
  maxResults: number;
  intuitTid: string | null;
}

const RecordArraySchema = z.array(z.record(z.string(), z.unknown()));

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new QboProviderError({ kind: "CANCELLED" }));
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new QboProviderError({ kind: "CANCELLED" }));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export interface QboReadClient {
  readonly realmId: string;
  companyInfo(options?: QboCallOptions): Promise<Record<string, unknown>>;
  readEntity(entity: QboReadableEntity, id: string, options?: QboCallOptions): Promise<Record<string, unknown>>;
  query(spec: QboQuerySpec, options?: QboCallOptions): Promise<QboQueryPage>;
  /** Pages through a query (1000 per page by default) until a short page, lazily. */
  paginate(spec: Omit<QboQuerySpec, "startPosition">, options?: QboCallOptions & { maxPages?: number }): AsyncGenerator<QboQueryPage, void, void>;
  report(name: QboReportName, params?: QboReportParams, options?: QboCallOptions): Promise<Record<string, unknown>>;
}

export function createQboReadClient(opts: QboClientOptions): QboReadClient {
  if (!isResolvedQboConfig(opts.config)) {
    throw new QboProviderError({ kind: "CONFIGURATION_ERROR", localReason: "UNRESOLVED_CONFIG" });
  }
  if (!isValidRealmId(opts.realmId)) {
    throw new QboProviderError({ kind: "CONFIGURATION_ERROR", localReason: "INVALID_REALM_ID" });
  }
  const { config, realmId } = opts;
  const limiter = opts.limiter ?? getSharedQboRateLimiter();
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const maxRetries = opts.maxRetries ?? 3;
  const maxBackoffMs = opts.maxBackoffMs ?? 60_000;
  const sleep = opts.sleep ?? defaultSleep;
  const random = opts.random ?? Math.random;
  const baseOrigin = new URL(config.apiBaseUrl).origin;

  function buildUrl(resourcePath: string, query: Record<string, string>): string {
    const url = new URL(`${config.apiBaseUrl}/v3/company/${realmId}/${resourcePath}`);
    if (url.origin !== baseOrigin || !url.pathname.startsWith(`/v3/company/${realmId}/`)) {
      throw new QboProviderError({ kind: "CONFIGURATION_ERROR", localReason: "URL_ESCAPED_BASE" });
    }
    url.searchParams.set("minorversion", String(config.minorVersion));
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    return url.toString();
  }

  function backoffMs(attempt: number, err: QboProviderError): number {
    const exp = Math.min(maxBackoffMs, 1000 * 2 ** attempt);
    const jittered = Math.floor(exp / 2 + random() * (exp / 2));
    const hinted = err.retryAfterMs ?? 0;
    return Math.min(maxBackoffMs, Math.max(jittered, hinted));
  }

  /** One GET, with permit, deadline, classification, bounded retry and a single 401 refresh. */
  async function getJson(resourcePath: string, query: Record<string, string>, call?: QboCallOptions): Promise<{ body: Record<string, unknown>; intuitTid: string | null }> {
    const signal = call?.signal ?? opts.signal;
    const url = buildUrl(resourcePath, query);
    let refreshedOnce = false;
    let refreshedToken: string | null = null; // used for the single retry that follows a refresh
    let retriesUsed = 0;

    for (;;) {
      if (signal?.aborted) throw new QboProviderError({ kind: "CANCELLED" });
      // The current token is read on every attempt, so a token persisted by another worker mid-retry is used.
      const token: string = refreshedToken ?? (await opts.getAccessToken());
      refreshedToken = null;
      if (typeof token !== "string" || !ACCESS_TOKEN_PATTERN.test(token)) {
        throw new QboProviderError({ kind: "AUTH_EXPIRED", localReason: "INVALID_ACCESS_TOKEN_FORMAT" });
      }

      const permit = await limiter.acquire(realmId, { signal });
      let failure: QboProviderError;
      try {
        const res = await qboHttp(
          url,
          { method: "GET", headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } },
          { fetchImpl: opts.fetchImpl, timeoutMs, signal, maxBodyBytes: MAX_API_BODY_BYTES },
        );
        if (res.status >= 200 && res.status < 300) {
          const body = parseJsonObjectLenient(res.bodyText);
          if (!body) {
            throw new QboProviderError({ kind: "MALFORMED_RESPONSE", httpStatus: res.status, intuitTid: res.intuitTid });
          }
          return { body, intuitTid: res.intuitTid };
        }
        const errBody = parseJsonObjectLenient(res.bodyText);
        const fault = errBody?.Fault as { Error?: Array<{ code?: unknown }> } | undefined;
        failure = classifyApiHttpFailure({
          status: res.status,
          intuitTid: res.intuitTid,
          providerCode: sanitizeProviderCode(fault?.Error?.[0]?.code),
          retryAfterMs: parseRetryAfterMs(res.headers),
        });
      } catch (err) {
        if (!(err instanceof QboProviderError)) throw new QboProviderError({ kind: "TRANSIENT_PROVIDER_FAILURE" });
        failure = err;
      } finally {
        permit.release();
      }

      if (failure.kind === "RATE_LIMITED" && failure.httpStatus === 429) {
        limiter.penalize(realmId, Math.min(failure.retryAfterMs ?? 60_000, maxBackoffMs), maxBackoffMs);
      }

      if (failure.kind === "AUTH_EXPIRED" && failure.httpStatus === 401) {
        if (refreshedOnce || !opts.onAuthExpired) throw failure;
        refreshedOnce = true;
        const fresh = await opts.onAuthExpired();
        if (!fresh) throw failure;
        refreshedToken = fresh;
        continue; // one refresh retry; does not consume the retry budget, and cannot repeat
      }

      if (!failure.retryable || retriesUsed >= maxRetries) throw failure;
      await sleep(backoffMs(retriesUsed, failure), signal);
      retriesUsed++;
    }
  }

  async function runQuery(spec: QboQuerySpec, call?: QboCallOptions): Promise<QboQueryPage> {
    let statement: string;
    try {
      statement = buildQboQuery(spec);
    } catch {
      throw new QboProviderError({ kind: "BAD_REQUEST", localReason: "INVALID_QUERY_SPEC" });
    }
    const { body, intuitTid } = await getJson("query", { query: statement }, call);
    const qr = body.QueryResponse;
    if (typeof qr !== "object" || qr === null || Array.isArray(qr)) {
      throw new QboProviderError({ kind: "MALFORMED_RESPONSE", intuitTid });
    }
    const raw = (qr as Record<string, unknown>)[spec.entity];
    // Intuit omits the entity key entirely for an empty page.
    const parsed = raw === undefined ? { success: true as const, data: [] as Array<Record<string, unknown>> } : RecordArraySchema.safeParse(raw);
    if (!parsed.success) throw new QboProviderError({ kind: "MALFORMED_RESPONSE", intuitTid });
    return {
      entity: spec.entity,
      records: parsed.data,
      startPosition: spec.startPosition ?? 1,
      maxResults: spec.maxResults ?? QBO_PROVIDER_LIMITS.queryMaxResults,
      intuitTid,
    };
  }

  return {
    realmId,

    async companyInfo(call) {
      const { body, intuitTid } = await getJson(`companyinfo/${realmId}`, {}, call);
      const info = body.CompanyInfo;
      if (typeof info !== "object" || info === null || Array.isArray(info)) {
        throw new QboProviderError({ kind: "MALFORMED_RESPONSE", intuitTid });
      }
      return info as Record<string, unknown>;
    },

    async readEntity(entity, id, call) {
      if (!isReadableEntity(entity) || typeof id !== "string" || !ENTITY_ID_PATTERN.test(id)) {
        throw new QboProviderError({ kind: "BAD_REQUEST", localReason: "INVALID_ENTITY_REQUEST" });
      }
      const { body, intuitTid } = await getJson(`${entity.toLowerCase()}/${id}`, {}, call);
      const record = body[entity];
      if (typeof record !== "object" || record === null || Array.isArray(record)) {
        throw new QboProviderError({ kind: "MALFORMED_RESPONSE", intuitTid });
      }
      return record as Record<string, unknown>;
    },

    query: runQuery,

    async *paginate(spec, call) {
      const pageSize = spec.maxResults ?? QBO_PROVIDER_LIMITS.queryMaxResults;
      const maxPages = call?.maxPages ?? 1000;
      let start = 1;
      for (let page = 0; page < maxPages; page++) {
        const result = await runQuery({ ...spec, startPosition: start, maxResults: pageSize }, call);
        yield result;
        if (result.records.length < pageSize) return;
        start += pageSize;
      }
      // The bound was reached with more data possibly remaining: fail loudly rather than truncate silently.
      throw new QboProviderError({ kind: "BAD_REQUEST", localReason: "PAGINATION_LIMIT_REACHED" });
    },

    async report(name, params, call) {
      if (!isReportName(name)) throw new QboProviderError({ kind: "BAD_REQUEST", localReason: "INVALID_REPORT" });
      let clean: Record<string, string>;
      try {
        clean = validateReportParams(params);
      } catch {
        throw new QboProviderError({ kind: "BAD_REQUEST", localReason: "INVALID_REPORT_PARAMS" });
      }
      const { body } = await getJson(`reports/${name}`, clean, call);
      return body;
    },
  };
}
