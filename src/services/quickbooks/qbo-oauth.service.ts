/**
 * QuickBooks Online — pure OAuth provider calls.
 *
 * No DB access here: this module only talks to Intuit's OAuth endpoints and
 * classifies the result into `QboApiError`. Callers (qbo-token.service,
 * qbo-connection.service) own persistence, locking and audit.
 *
 * Endpoint behaviour (verified against Intuit's own oauth-jsclient source):
 *  - authorize: GET-style URL, params response_type=code, client_id,
 *    redirect_uri, scope=com.intuit.quickbooks.accounting, state.
 *  - token: POST, Basic auth (clientId:clientSecret), form-encoded body,
 *    Accept: application/json. Returns access_token, refresh_token (Intuit
 *    ROTATES the refresh token on every use — the caller MUST persist the new
 *    one every time), expires_in, x_refresh_token_expires_in and optionally
 *    x_refresh_token_hard_expires_in (all seconds).
 *  - revoke: POST, Basic auth, JSON body {"token": <refresh or access token>}.
 *    200 = revoked.
 *
 * No token, code, client secret or state value is ever placed in a thrown
 * error message or log line from this module.
 */

import { z } from "zod";
import {
  QBO_OAUTH_ENDPOINTS,
  QBO_ACCOUNTING_SCOPE,
  type QboAppConfig,
} from "@/domain/quickbooks/qbo-config";
import { QboApiError, type QboErrorKind } from "@/domain/quickbooks/qbo-contracts";

/** Injectable fetch, so tests never hit the network. Defaults to global fetch. */
export type FetchImpl = typeof fetch;

export interface QboOauthCallOpts {
  fetchImpl?: FetchImpl;
  /** Client-side deadline for the HTTP call. Default 15s. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 15_000;

// ─── Token response contract ───────────────────────────────────────────────

const QboTokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  token_type: z.string().min(1),
  expires_in: z.number().int().positive(),
  x_refresh_token_expires_in: z.number().int().positive(),
  x_refresh_token_hard_expires_in: z.number().int().positive().optional(),
});

export interface QboTokenResult {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresInSeconds: number;
  refreshTokenExpiresInSeconds: number;
  refreshTokenHardExpiresInSeconds: number | null;
}

function toTokenResult(parsed: z.infer<typeof QboTokenResponseSchema>): QboTokenResult {
  return {
    accessToken: parsed.access_token,
    refreshToken: parsed.refresh_token,
    tokenType: parsed.token_type,
    expiresInSeconds: parsed.expires_in,
    refreshTokenExpiresInSeconds: parsed.x_refresh_token_expires_in,
    refreshTokenHardExpiresInSeconds: parsed.x_refresh_token_hard_expires_in ?? null,
  };
}

// ─── Shared HTTP plumbing ───────────────────────────────────────────────────

function basicAuthHeader(config: QboAppConfig): string {
  return `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`;
}

/** Classify a non-2xx OAuth HTTP response. Never echoes the response body. */
function classifyOauthHttpFailure(status: number, parsedErrorCode: string | null): QboApiError {
  if (status === 401 || parsedErrorCode === "invalid_grant") {
    return new QboApiError({
      kind: "AUTH",
      httpStatus: status,
      message: "QuickBooks rejected the authorization credentials. Reconnect QuickBooks.",
    });
  }
  if (status >= 500) {
    return new QboApiError({
      kind: "TRANSIENT",
      httpStatus: status,
      message: "QuickBooks was temporarily unavailable. Try again.",
    });
  }
  return new QboApiError({
    kind: "VALIDATION",
    httpStatus: status,
    message: "QuickBooks rejected the OAuth request.",
  });
}

interface RawFetchResult {
  status: number;
  bodyText: string;
}

async function doFetch(
  url: string,
  init: { method: "POST"; headers: Record<string, string>; body: string },
  opts?: QboOauthCallOpts,
): Promise<RawFetchResult> {
  const fetchImpl = opts?.fetchImpl ?? fetch;
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetchImpl(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new QboApiError({ kind: "TIMEOUT", message: "QuickBooks did not respond in time." });
    }
    throw new QboApiError({
      kind: "TRANSIENT",
      message: "QuickBooks could not be reached.",
    });
  } finally {
    clearTimeout(timer);
  }
  const bodyText = await res.text();
  return { status: res.status, bodyText };
}

/** Parse a JSON body defensively; throws MALFORMED on any parse failure. Used only on the 2xx (success) path. */
function parseJsonBodyStrict(bodyText: string): Record<string, unknown> | null {
  if (!bodyText) return null;
  try {
    const parsed = JSON.parse(bodyText);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    throw new QboApiError({ kind: "MALFORMED", message: "QuickBooks returned an unexpected response." });
  }
}

/**
 * Best-effort JSON parse for a non-2xx error body: an unparsable error body must still be
 * classified by HTTP status (e.g. a 5xx with an HTML error page is TRANSIENT, not MALFORMED).
 */
function parseJsonBodyLenient(bodyText: string): Record<string, unknown> | null {
  if (!bodyText) return null;
  try {
    const parsed = JSON.parse(bodyText);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function postToken(
  config: QboAppConfig,
  params: URLSearchParams,
  opts?: QboOauthCallOpts,
): Promise<QboTokenResult> {
  const { status, bodyText } = await doFetch(
    QBO_OAUTH_ENDPOINTS.token,
    {
      method: "POST",
      headers: {
        Authorization: basicAuthHeader(config),
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: params.toString(),
    },
    opts,
  );

  if (status < 200 || status >= 300) {
    const body = parseJsonBodyLenient(bodyText);
    const errorCode = typeof body?.error === "string" ? body.error : null;
    throw classifyOauthHttpFailure(status, errorCode);
  }

  const body = parseJsonBodyStrict(bodyText);
  if (!body) {
    throw new QboApiError({ kind: "MALFORMED", message: "QuickBooks returned an empty token response." });
  }

  const parsed = QboTokenResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new QboApiError({ kind: "MALFORMED", message: "QuickBooks token response did not match the expected shape." });
  }

  return toTokenResult(parsed.data);
}

// ─── Public API ─────────────────────────────────────────────────────────────

/** Build the Intuit consent-screen URL. `state` is opaque to this module (caller mints/hashes it). */
export function buildQboAuthorizationUrl(config: QboAppConfig, state: string): string {
  if (typeof state !== "string" || state.length === 0) {
    throw new QboApiError({ kind: "VALIDATION", message: "Missing OAuth state." });
  }
  const url = new URL(QBO_OAUTH_ENDPOINTS.authorize);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("scope", QBO_ACCOUNTING_SCOPE);
  url.searchParams.set("state", state);
  return url.toString();
}

/** Exchange an authorization code (from the OAuth callback) for tokens. */
export async function exchangeQboAuthorizationCode(
  config: QboAppConfig,
  code: string,
  opts?: QboOauthCallOpts,
): Promise<QboTokenResult> {
  if (typeof code !== "string" || code.length === 0) {
    throw new QboApiError({ kind: "VALIDATION", message: "Missing authorization code." });
  }
  const params = new URLSearchParams();
  params.set("grant_type", "authorization_code");
  params.set("code", code);
  params.set("redirect_uri", config.redirectUri);
  return postToken(config, params, opts);
}

/** Refresh an access token using a stored refresh token. Intuit rotates the refresh token on every call. */
export async function refreshQboTokens(
  config: QboAppConfig,
  refreshToken: string,
  opts?: QboOauthCallOpts,
): Promise<QboTokenResult> {
  if (typeof refreshToken !== "string" || refreshToken.length === 0) {
    throw new QboApiError({ kind: "VALIDATION", message: "Missing refresh token." });
  }
  const params = new URLSearchParams();
  params.set("grant_type", "refresh_token");
  params.set("refresh_token", refreshToken);
  return postToken(config, params, opts);
}

/** Revoke a refresh (or access) token at Intuit. Resolves on 2xx; throws a classified error otherwise. */
export async function revokeQboToken(
  config: QboAppConfig,
  token: string,
  opts?: QboOauthCallOpts,
): Promise<void> {
  if (typeof token !== "string" || token.length === 0) {
    throw new QboApiError({ kind: "VALIDATION", message: "Missing token to revoke." });
  }
  const { status, bodyText } = await doFetch(
    QBO_OAUTH_ENDPOINTS.revoke,
    {
      method: "POST",
      headers: {
        Authorization: basicAuthHeader(config),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ token }),
    },
    opts,
  );

  if (status < 200 || status >= 300) {
    const body = parseJsonBodyLenient(bodyText);
    const errorCode = typeof body?.error === "string" ? body.error : null;
    throw classifyOauthHttpFailure(status, errorCode);
  }
}

export type { QboErrorKind };
