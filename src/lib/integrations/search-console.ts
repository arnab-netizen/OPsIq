/**
 * Google Search Console (GSC) API client — scaffold.
 *
 * Code-only preparation: this module makes NO live network call unless the caller supplies
 * real auth (a service-account JSON key, or an already-minted access token). Every exported
 * function accepts an optional `fetchImpl` for tests to inject fixtures/mocks (same pattern as
 * src/services/external-systems/google-sheets-oauth.service.ts) — there is no live credential
 * in this repo, so all tests in src/__tests__/lib/integrations/search-console.test.ts run
 * entirely against fixtures and never touch the network.
 *
 * Covers three Search Console v1 ("webmasters" API surface, still current for this data) read
 * operations, all gated by the read-only scope `https://www.googleapis.com/auth/webmasters.readonly`:
 *   - searchanalytics.query  → searchAnalyticsQuery()
 *   - sitemaps.list          → sitemapsList()
 *   - urlInspection.index:inspect → urlInspect()
 *
 * Auth — two supported modes (SearchConsoleAuth), deliberately NOT using the `googleapis` or
 * `google-auth-library` npm packages: this repo's only existing Google integration
 * (google-sheets-oauth.service.ts) hand-rolls OAuth as plain REST calls against hardcoded
 * Google hosts with injectable fetch, and does not depend on either package. Matching that
 * house style here means zero new runtime dependencies.
 *
 *   1. "service_account_key" — the simple path. A downloaded JSON key
 *      (client_email + private_key) is used to mint a self-signed JWT (RS256, signed with
 *      Node's built-in node:crypto — no JWT library needed) and exchange it for a short-lived
 *      access token via the standard OAuth2 JWT Bearer flow
 *      (https://oauth2.googleapis.com/token, grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer).
 *      This is a long-lived secret (the private key) that must be stored in GitHub
 *      Environment secrets / Vercel env vars, never committed.
 *
 *   2. "access_token" — the Workload Identity Federation (WIF) path. In GitHub Actions, the
 *      *workflow* (not this module) is responsible for exchanging the job's OIDC token for a
 *      short-lived Google access token, using google-github-actions/auth with
 *      `token_format: 'access_token'` and `access_token_scopes:
 *      'https://www.googleapis.com/auth/webmasters.readonly'` (see the setup doc). That token
 *      is then passed into this module as plain `accessToken` — this module never performs the
 *      WIF/STS exchange itself, since the GitHub Action already does it correctly and
 *      reimplementing an OIDC↔STS client here would be pure risk for no benefit. No long-lived
 *      key exists anywhere in this mode.
 *
 * GSC reporting delay: Search Console's performance data is typically 2-3 days behind "today" —
 * a query for yesterday or today routinely returns zero or partial rows, not because anything
 * failed, but because Google has not finished aggregating it yet. Every query result below
 * carries an explicit `freshness` object (see computeDataFreshness()) so callers — and anything
 * that renders this data — can see unambiguously which report date it covers and whether that
 * date falls inside the reporting-delay window, instead of silently presenting a stale or
 * incomplete number as if it were current.
 */

import { createHash, createSign } from "node:crypto";
import {
  UnauthorizedError,
  ValidationError,
  NotFoundError,
  TooManyRequestsError,
  ServiceUnavailableError,
} from "@/infra/errors";

// Hardcoded Google API hosts — never substituted from user input (SSRF protection), matching
// the convention in google-sheets-oauth.service.ts.
const GOOGLE_OAUTH_TOKEN_HOST = "https://oauth2.googleapis.com";
const SEARCH_CONSOLE_LEGACY_HOST = "https://www.googleapis.com"; // searchanalytics.query, sitemaps.list
const SEARCH_CONSOLE_V1_HOST = "https://searchconsole.googleapis.com"; // urlInspection

/** The one scope this integration ever requests. Read-only by design — see the setup doc. */
export const SEARCH_CONSOLE_READONLY_SCOPE =
  "https://www.googleapis.com/auth/webmasters.readonly";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

// ─────────────────────────────────────────────────────────────────────────────
// Auth
// ─────────────────────────────────────────────────────────────────────────────

/** Shape of a downloaded GCP service-account JSON key (only the fields this module uses). */
export interface ServiceAccountKey {
  client_email: string;
  private_key: string;
  /** Defaults to https://oauth2.googleapis.com/token when omitted. */
  token_uri?: string;
  project_id?: string;
}

export type SearchConsoleAuth =
  | {
      mode: "access_token";
      /** A short-lived OAuth2 access token obtained elsewhere (e.g. google-github-actions/auth
       * with token_format: 'access_token' in CI, or any other WIF exchange). This module trusts
       * it as-is and performs no token exchange of its own in this mode. */
      accessToken: string;
    }
  | {
      mode: "service_account_key";
      serviceAccountKey: ServiceAccountKey;
      /** Defaults to SEARCH_CONSOLE_READONLY_SCOPE. Overridable only for tests. */
      scope?: string;
      /** Domain-wide delegation subject, if ever needed. Not required for this integration. */
      subject?: string;
    };

interface AccessTokenResult {
  accessToken: string;
  expiresInSeconds?: number;
}

function base64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

/**
 * Self-signed JWT Bearer flow for a service-account key (RFC 7523 / Google's variant).
 * Uses only node:crypto — no jsonwebtoken dependency.
 */
function buildServiceAccountJwt(
  key: ServiceAccountKey,
  scope: string,
  subject: string | undefined,
  nowSeconds: number,
): string {
  const header = { alg: "RS256", typ: "JWT" };
  const claims: Record<string, unknown> = {
    iss: key.client_email,
    scope,
    aud: key.token_uri ?? `${GOOGLE_OAUTH_TOKEN_HOST}/token`,
    iat: nowSeconds,
    exp: nowSeconds + 3600,
  };
  if (subject) claims.sub = subject;

  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;
  const signature = createSign("RSA-SHA256").update(signingInput).sign(key.private_key);
  return `${signingInput}.${base64url(signature)}`;
}

function validateServiceAccountKey(key: ServiceAccountKey): void {
  if (!key || typeof key.client_email !== "string" || key.client_email.length === 0) {
    throw new ValidationError(
      "Search Console service-account key is missing client_email — download a fresh JSON key from the GCP Console",
    );
  }
  if (typeof key.private_key !== "string" || !key.private_key.includes("BEGIN PRIVATE KEY")) {
    throw new ValidationError(
      "Search Console service-account key is missing a valid PEM private_key",
    );
  }
}

/**
 * Resolve a usable access token for one of the two supported auth modes.
 * Mode "access_token": returned as-is, no network call.
 * Mode "service_account_key": mints a JWT and exchanges it at Google's token endpoint —
 * the ONE live network call this module ever makes for auth, and only when real key material
 * is supplied (never in tests, which inject fetchImpl fixtures).
 */
export async function getAccessToken(
  auth: SearchConsoleAuth,
  fetchImpl: FetchLike = fetch,
): Promise<AccessTokenResult> {
  if (auth.mode === "access_token") {
    if (!auth.accessToken) {
      throw new ValidationError("SearchConsoleAuth access_token mode requires a non-empty accessToken");
    }
    return { accessToken: auth.accessToken };
  }

  validateServiceAccountKey(auth.serviceAccountKey);
  const scope = auth.scope ?? SEARCH_CONSOLE_READONLY_SCOPE;
  const tokenUri = auth.serviceAccountKey.token_uri ?? `${GOOGLE_OAUTH_TOKEN_HOST}/token`;
  const nowSeconds = Math.floor(Date.now() / 1000);
  const assertion = buildServiceAccountJwt(auth.serviceAccountKey, scope, auth.subject, nowSeconds);

  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  });

  const response = await fetchImpl(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const errData = (await response.json().catch(() => ({}))) as TokenErrorBody;
    const description: string =
      errData.error_description ?? errData.error ?? "Service-account token exchange rejected";
    if (response.status === 400 || response.status === 401) {
      throw new UnauthorizedError(
        "AUTH_INVALID",
        `Google rejected the Search Console service-account credentials: ${description}`,
      );
    }
    throw new ServiceUnavailableError(
      "SYSTEM_DEGRADED",
      `Google OAuth token exchange failed with status ${response.status}`,
    );
  }

  const data = (await response.json()) as TokenSuccessBody;
  return {
    accessToken: data.access_token,
    expiresInSeconds: data.expires_in,
  };
}

interface TokenErrorBody {
  error?: string;
  error_description?: string;
}

interface TokenSuccessBody {
  access_token: string;
  expires_in?: number;
}

/**
 * Resolve a SearchConsoleAuth from environment variables, preferring the WIF/CI access-token
 * path over the long-lived JSON-key path when both happen to be set:
 *   - GSC_ACCESS_TOKEN — a short-lived token already minted elsewhere (e.g.
 *     google-github-actions/auth's `access_token` output in CI). No key material involved.
 *   - GSC_SERVICE_ACCOUNT_KEY_JSON (raw JSON) or GSC_SERVICE_ACCOUNT_KEY_BASE64 (base64 of the
 *     same) — the downloaded service-account JSON key, for the simple/local path.
 * Throws (does not silently return a broken auth value) when neither is configured — a missing
 * credential is an owner-setup gap, not something this function should paper over.
 */
export function getSearchConsoleAuthFromEnv(
  env: Partial<Record<string, string | undefined>> = process.env,
): SearchConsoleAuth {
  const accessToken = env.GSC_ACCESS_TOKEN;
  if (accessToken) {
    return { mode: "access_token", accessToken };
  }

  const rawJson = env.GSC_SERVICE_ACCOUNT_KEY_BASE64
    ? Buffer.from(env.GSC_SERVICE_ACCOUNT_KEY_BASE64, "base64").toString("utf8")
    : env.GSC_SERVICE_ACCOUNT_KEY_JSON;

  if (!rawJson) {
    throw new ValidationError(
      "No Search Console credential configured. Set GSC_ACCESS_TOKEN (WIF/CI path) or " +
        "GSC_SERVICE_ACCOUNT_KEY_JSON / GSC_SERVICE_ACCOUNT_KEY_BASE64 (JSON-key path) — see " +
        "docs/opsiq/product/GSC_INTEGRATION_SETUP.md. This is a pending owner setup step, not a bug.",
    );
  }

  let parsed: ServiceAccountKey;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new ValidationError(
      "GSC_SERVICE_ACCOUNT_KEY_JSON / GSC_SERVICE_ACCOUNT_KEY_BASE64 does not contain valid JSON",
    );
  }

  return { mode: "service_account_key", serviceAccountKey: parsed };
}

// ─────────────────────────────────────────────────────────────────────────────
// Data freshness — GSC's ~2-3 day reporting delay, made explicit everywhere.
// ─────────────────────────────────────────────────────────────────────────────

export const GSC_REPORTING_DELAY_DAYS_MIN = 2;
export const GSC_REPORTING_DELAY_DAYS_MAX = 3;

export interface DataFreshness {
  /** The report date this result covers (the query's endDate), e.g. "2026-11-14". */
  asOfDate: string;
  /** Always GSC_REPORTING_DELAY_DAYS_{MIN,MAX} — stated as data, not just documented in a comment. */
  reportingDelayDays: { min: number; max: number };
  /** True when asOfDate is within the last GSC_REPORTING_DELAY_DAYS_MAX days of `now` — i.e. GSC
   * may still have no data, or only partial data, for this date. */
  withinReportingDelayWindow: boolean;
  /** Human-readable, safe to surface directly in UI/logs — never implies "today's data". */
  note: string;
}

function toUtcDateOnly(dateIso: string): Date {
  // dateIso is "YYYY-MM-DD"; parse as UTC midnight to avoid local-timezone drift.
  return new Date(`${dateIso}T00:00:00.000Z`);
}

export function computeDataFreshness(endDateIso: string, now: Date = new Date()): DataFreshness {
  const endDate = toUtcDateOnly(endDateIso);
  const ageDays = Math.floor((now.getTime() - endDate.getTime()) / (24 * 60 * 60 * 1000));
  const withinReportingDelayWindow = ageDays < GSC_REPORTING_DELAY_DAYS_MAX;

  const note = withinReportingDelayWindow
    ? `Report date ${endDateIso} is within Google Search Console's ${GSC_REPORTING_DELAY_DAYS_MIN}-${GSC_REPORTING_DELAY_DAYS_MAX}-day reporting delay — data for this date may be missing or incomplete, and will likely still change if re-fetched later. This is NOT today's/live data.`
    : `Report date ${endDateIso} is outside Google Search Console's reporting-delay window and should be stable, but is still ${ageDays} day(s) old, not real-time.`;

  return {
    asOfDate: endDateIso,
    reportingDelayDays: { min: GSC_REPORTING_DELAY_DAYS_MIN, max: GSC_REPORTING_DELAY_DAYS_MAX },
    withinReportingDelayWindow,
    note,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared error mapping
// ─────────────────────────────────────────────────────────────────────────────

/** Maps a non-ok Google API response to this repo's typed AppError hierarchy. Mirrors the
 * status-code mapping already established in google-sheets-oauth.service.ts, extended with an
 * explicit Retry-After pass-through for 429s. */
async function throwForGoogleApiError(response: Response, context: string): Promise<never> {
  const retryAfterHeader = response.headers?.get?.("Retry-After") ?? undefined;
  const errBody = (await response.json().catch(() => ({}))) as GoogleApiErrorBody;
  const description: string =
    errBody.error?.message ?? errBody.error_description ?? `${context} failed`;

  if (response.status === 401) {
    throw new UnauthorizedError("AUTH_INVALID", `Search Console auth failed: ${description}`);
  }
  if (response.status === 403) {
    throw new UnauthorizedError(
      "AUTH_REVOKED",
      `Search Console access denied (${description}) — the service account most likely has not been ` +
        `granted access on this property yet. Ask the owner to add its email as a Restricted user under ` +
        `Search Console → Settings → Users and permissions.`,
    );
  }
  if (response.status === 404) {
    throw new NotFoundError("Search Console property", context);
  }
  if (response.status === 429) {
    throw new TooManyRequestsError(
      `Search Console API quota exceeded (${context}) — retry after backoff`,
      retryAfterHeader ? { retryAfterSeconds: Number(retryAfterHeader) || undefined } : undefined,
    );
  }
  throw new ServiceUnavailableError(
    "SYSTEM_DEGRADED",
    `Search Console API returned ${response.status} for ${context}: ${description}`,
  );
}

interface GoogleApiErrorBody {
  error?: { message?: string; status?: string };
  error_description?: string;
}

async function authorizedFetch(
  fetchImpl: FetchLike,
  url: string,
  auth: SearchConsoleAuth,
  init: RequestInit,
): Promise<Response> {
  const { accessToken } = await getAccessToken(auth, fetchImpl);
  return fetchImpl(url, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// searchanalytics.query
// ─────────────────────────────────────────────────────────────────────────────

export type SearchAnalyticsDimension = "query" | "page" | "device" | "country" | "date";

export interface SearchAnalyticsQueryRequest {
  /** e.g. "sc-domain:opsiq.solutions" for a Domain property, or a full URL-prefix property. */
  siteUrl: string;
  /** "YYYY-MM-DD" (inclusive). */
  startDate: string;
  /** "YYYY-MM-DD" (inclusive). Must never be "today" — see computeDataFreshness(). */
  endDate: string;
  dimensions?: SearchAnalyticsDimension[];
  /** Default 1000. Google's own max is 25000. */
  rowLimit?: number;
  startRow?: number;
  /** Passed through to Google verbatim; not deeply typed in this scaffold. */
  dimensionFilterGroups?: unknown[];
  /** "all" (default, fresh but possibly incomplete) vs "final" (stable, more delayed). */
  dataState?: "all" | "final";
  auth: SearchConsoleAuth;
  fetchImpl?: FetchLike;
}

export interface SearchAnalyticsRow {
  /** Present when `dimensions` was non-empty, one entry per requested dimension, in order. */
  keys?: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface SearchAnalyticsQueryResult {
  rows: SearchAnalyticsRow[];
  rowCount: number;
  rowLimitRequested: number;
  /** True when rowCount === rowLimitRequested: there may be MORE rows beyond what was returned
   * (Google truncates silently at rowLimit — this flag makes that explicit instead of letting a
   * caller assume `rows` is the complete set). Also true if Google's response itself signals
   * truncation via responseAggregationType in a way this scaffold cannot fully resolve without a
   * live call — treated conservatively (uncertain = flagged, not assumed complete). */
  possiblyIncomplete: boolean;
  responseAggregationType?: string;
  freshness: DataFreshness;
}

const DEFAULT_ROW_LIMIT = 1000;

export async function searchAnalyticsQuery(
  request: SearchAnalyticsQueryRequest,
): Promise<SearchAnalyticsQueryResult> {
  const fetchImpl = request.fetchImpl ?? fetch;
  const rowLimit = request.rowLimit ?? DEFAULT_ROW_LIMIT;

  if (!request.siteUrl) {
    throw new ValidationError("searchAnalyticsQuery requires siteUrl");
  }
  if (!request.startDate || !request.endDate) {
    throw new ValidationError("searchAnalyticsQuery requires startDate and endDate");
  }

  const url = `${SEARCH_CONSOLE_LEGACY_HOST}/webmasters/v3/sites/${encodeURIComponent(request.siteUrl)}/searchAnalytics/query`;

  const response = await authorizedFetch(fetchImpl, url, request.auth, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      startDate: request.startDate,
      endDate: request.endDate,
      dimensions: request.dimensions,
      rowLimit,
      startRow: request.startRow,
      dimensionFilterGroups: request.dimensionFilterGroups,
      dataState: request.dataState ?? "all",
    }),
  });

  if (!response.ok) {
    await throwForGoogleApiError(response, `searchanalytics.query(${request.siteUrl})`);
  }

  const data = (await response.json()) as SearchAnalyticsResponseBody;
  // Google omits `rows` entirely (rather than returning []) when there is no data at all for the
  // requested window — e.g. a property that was just verified, or a date range with zero
  // traffic. That is a valid, non-error outcome: handled as an empty result, not thrown.
  const rows: SearchAnalyticsRow[] = Array.isArray(data.rows) ? data.rows : [];

  return {
    rows,
    rowCount: rows.length,
    rowLimitRequested: rowLimit,
    possiblyIncomplete: rows.length >= rowLimit,
    responseAggregationType: data.responseAggregationType,
    freshness: computeDataFreshness(request.endDate),
  };
}

interface SearchAnalyticsResponseBody {
  rows?: SearchAnalyticsRow[];
  responseAggregationType?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// sitemaps.list
// ─────────────────────────────────────────────────────────────────────────────

export interface SitemapEntry {
  path?: string;
  lastSubmitted?: string;
  isPending?: boolean;
  isSitemapsIndex?: boolean;
  type?: string;
  lastDownloaded?: string;
  warnings?: string;
  errors?: string;
  contents?: Array<{ type?: string; submitted?: string; indexed?: string }>;
}

export interface SitemapsListRequest {
  siteUrl: string;
  auth: SearchConsoleAuth;
  fetchImpl?: FetchLike;
}

export interface SitemapsListResult {
  sitemaps: SitemapEntry[];
}

export async function sitemapsList(request: SitemapsListRequest): Promise<SitemapsListResult> {
  const fetchImpl = request.fetchImpl ?? fetch;
  if (!request.siteUrl) {
    throw new ValidationError("sitemapsList requires siteUrl");
  }

  const url = `${SEARCH_CONSOLE_LEGACY_HOST}/webmasters/v3/sites/${encodeURIComponent(request.siteUrl)}/sitemaps`;
  const response = await authorizedFetch(fetchImpl, url, request.auth, { method: "GET" });

  if (!response.ok) {
    await throwForGoogleApiError(response, `sitemaps.list(${request.siteUrl})`);
  }

  const data = (await response.json()) as SitemapsResponseBody;
  return { sitemaps: Array.isArray(data.sitemap) ? data.sitemap : [] };
}

interface SitemapsResponseBody {
  sitemap?: SitemapEntry[];
}

// ─────────────────────────────────────────────────────────────────────────────
// urlInspection.index:inspect
// ─────────────────────────────────────────────────────────────────────────────

export interface UrlInspectionRequest {
  /** The full, absolute URL being inspected — must belong to siteUrl's property. */
  inspectionUrl: string;
  siteUrl: string;
  languageCode?: string;
  auth: SearchConsoleAuth;
  fetchImpl?: FetchLike;
}

export interface UrlInspectionResult {
  inspectionResultLink?: string;
  indexStatus?: {
    verdict?: string; // "PASS" | "PARTIAL" | "FAIL" | "NEUTRAL" | "VERDICT_UNSPECIFIED"
    coverageState?: string;
    robotsTxtState?: string;
    indexingState?: string;
    lastCrawlTime?: string;
    pageFetchState?: string;
    googleCanonical?: string;
    userCanonical?: string;
    crawledAs?: string;
  };
}

export async function urlInspect(request: UrlInspectionRequest): Promise<UrlInspectionResult> {
  const fetchImpl = request.fetchImpl ?? fetch;
  if (!request.inspectionUrl || !request.siteUrl) {
    throw new ValidationError("urlInspect requires inspectionUrl and siteUrl");
  }

  const url = `${SEARCH_CONSOLE_V1_HOST}/v1/urlInspection/index:inspect`;
  const response = await authorizedFetch(fetchImpl, url, request.auth, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      inspectionUrl: request.inspectionUrl,
      siteUrl: request.siteUrl,
      languageCode: request.languageCode ?? "en-US",
    }),
  });

  if (!response.ok) {
    await throwForGoogleApiError(response, `urlInspection.index:inspect(${request.inspectionUrl})`);
  }

  const data = (await response.json()) as UrlInspectionResponseBody;
  const ir = data.inspectionResult ?? {};
  return {
    inspectionResultLink: ir.inspectionResultLink,
    indexStatus: ir.indexStatusResult
      ? {
          verdict: ir.indexStatusResult.verdict,
          coverageState: ir.indexStatusResult.coverageState,
          robotsTxtState: ir.indexStatusResult.robotsTxtState,
          indexingState: ir.indexStatusResult.indexingState,
          lastCrawlTime: ir.indexStatusResult.lastCrawlTime,
          pageFetchState: ir.indexStatusResult.pageFetchState,
          googleCanonical: ir.indexStatusResult.googleCanonical,
          userCanonical: ir.indexStatusResult.userCanonical,
          crawledAs: ir.indexStatusResult.crawledAs,
        }
      : undefined,
  };
}

interface UrlInspectionResponseBody {
  inspectionResult?: {
    inspectionResultLink?: string;
    indexStatusResult?: {
      verdict?: string;
      coverageState?: string;
      robotsTxtState?: string;
      indexingState?: string;
      lastCrawlTime?: string;
      pageFetchState?: string;
      googleCanonical?: string;
      userCanonical?: string;
      crawledAs?: string;
    };
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Idempotency helper (shared with the ingestion service)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Deterministic key for one (siteUrl, date, dimension-values) row, used by the ingestion
 * service to upsert instead of insert — the same inputs always produce the same key, so
 * re-ingesting a day that was already written updates those rows in place rather than
 * duplicating them.
 */
export function computeSearchConsoleRowKey(input: {
  siteUrl: string;
  date: string;
  query?: string;
  page?: string;
  device?: string;
  country?: string;
}): string {
  const parts = [
    input.siteUrl,
    input.date,
    input.query ?? "",
    input.page ?? "",
    input.device ?? "",
    input.country ?? "",
  ];
  return createHash("sha256").update(parts.join("|")).digest("hex");
}
