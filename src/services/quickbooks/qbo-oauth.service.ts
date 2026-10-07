/**
 * QuickBooks Online — pure OAuth 2.0 provider calls (Intuit authorization-code flow).
 *
 * No database, no routes, no persistence: this module only builds the authorization request and
 * talks to Intuit's OAuth endpoints. The later connection-flow PR will persist what it needs.
 *
 * CONTRACT FOR THE LATER CONNECTION-FLOW PR
 *   start:    createQboAuthorizationRequest(config) -> { authorizationUrl, state, stateHash, stateExpiresAt }
 *             Persist ONLY { stateHash, stateExpiresAt } bound to the initiating actor + workspace +
 *             business; send the browser to authorizationUrl. The clear-text state is not stored.
 *   callback: hash the returned `state` with hashQboOAuthState() and consume the stored row once, by
 *             compare-and-set, against actor + workspace + expiry. Only after that, call
 *             exchangeQboAuthorizationCode(). The `realmId` query parameter is untrusted input: validate
 *             with isValidRealmId() and bind it to the workspace/business there, never here.
 *   tokens:   a returned QboTokenGrant carries the access token, the (rotated) refresh token and both
 *             expiries. The persistence layer MUST store the new refresh token from every refresh
 *             (Intuit rotates it; the previous one stays valid only briefly). toOAuthToken() maps a grant
 *             onto the generic OAuthToken so the existing AES-256-GCM / HKDF encryption is used as-is.
 *
 * Provider facts: see qbo-config.ts. Token and revoke calls use HTTP Basic client authentication.
 * The token endpoint takes form-encoded bodies; revoke takes JSON. No PKCE parameters are sent.
 * Calls are NOT retried here: a refresh whose response was lost may already have rotated the token,
 * so the retry decision belongs to the caller (which also owns persistence).
 *
 * Nothing in this module logs, and no token, code, secret, URL or response body is placed in an error.
 */

import { createHash } from "node:crypto";
import { z } from "zod";
import { generateOAuthState, type OAuthToken } from "@/services/external-systems/oauth-token.service";
import { isResolvedQboConfig, type QboProviderConfig } from "@/domain/quickbooks/qbo-config";
import {
  QboProviderError,
  classifyOauthHttpFailure,
  sanitizeProviderCode,
} from "@/domain/quickbooks/qbo-errors";
import {
  qboHttp,
  parseJsonObjectLenient,
  parseRetryAfterMs,
  type QboFetch,
} from "./qbo-http";

export interface QboOauthCallOptions {
  fetchImpl?: QboFetch;
  /** Client-side deadline. Default 15s. */
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Clock injection for deterministic expiry arithmetic. */
  now?: () => Date;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_OAUTH_BODY_BYTES = 256 * 1024;

/** Lifetime of an authorization request's state. */
export const QBO_OAUTH_STATE_TTL_SECONDS = 600;

/** State must look like generated random state; anything else is refused before it reaches a URL. */
const STATE_PATTERN = /^[A-Za-z0-9_-]{32,256}$/;
/** Authorization codes are opaque; only bound their size and character set. */
const CODE_PATTERN = /^[\x21-\x7e]{1,2048}$/;
const TOKEN_PATTERN = /^[\x21-\x7e]{1,8192}$/;

function assertResolvedConfig(config: QboProviderConfig): void {
  if (!isResolvedQboConfig(config)) {
    throw new QboProviderError({ kind: "CONFIGURATION_ERROR", localReason: "UNRESOLVED_CONFIG" });
  }
}

// ─── Authorization request ──────────────────────────────────────────────────

export interface QboAuthorizationRequest {
  /** Send the browser here. Contains the client id, exact redirect URI, accounting scope and state — never a secret. */
  authorizationUrl: string;
  /** Clear-text state, returned to the caller only so it can be placed in the URL; do not persist it. */
  state: string;
  /** SHA-256 hex of the state: the value the persistence layer stores and later compares. */
  stateHash: string;
  stateExpiresAt: Date;
}

export function hashQboOAuthState(state: string): string {
  return createHash("sha256").update(state, "utf8").digest("hex");
}

/**
 * Build Intuit's authorization URL from validated server-side configuration and a generated state.
 * There is no parameter for a redirect URI, client id, scope or host: all come from `config`.
 */
export function buildQboAuthorizationUrl(config: QboProviderConfig, state: string): string {
  assertResolvedConfig(config);
  if (typeof state !== "string" || !STATE_PATTERN.test(state)) {
    throw new QboProviderError({ kind: "CONFIGURATION_ERROR", localReason: "INVALID_STATE" });
  }
  const url = new URL(config.authorizationUrl);
  url.searchParams.set("client_id", config.credentials.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", config.scope);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("state", state);
  return url.toString();
}

/** Generate cryptographically random state (via the shared OAuth primitives) and the authorization URL. */
export function createQboAuthorizationRequest(
  config: QboProviderConfig,
  options: { now?: () => Date } = {},
): QboAuthorizationRequest {
  const generated = generateOAuthState(QBO_OAUTH_STATE_TTL_SECONDS);
  const now = (options.now ?? (() => new Date()))();
  return {
    authorizationUrl: buildQboAuthorizationUrl(config, generated.state),
    state: generated.state,
    stateHash: hashQboOAuthState(generated.state),
    stateExpiresAt: new Date(now.getTime() + QBO_OAUTH_STATE_TTL_SECONDS * 1000),
  };
}

// ─── Token grant ────────────────────────────────────────────────────────────

const TokenResponseSchema = z.object({
  access_token: z.string().regex(TOKEN_PATTERN),
  refresh_token: z.string().regex(TOKEN_PATTERN),
  token_type: z.string().refine((v) => v.toLowerCase() === "bearer"),
  expires_in: z.number().int().positive(),
  x_refresh_token_expires_in: z.number().int().positive(),
  x_refresh_token_hard_expires_in: z.number().int().positive().optional(),
});

export interface QboTokenGrant {
  accessToken: string;
  /** On a refresh this is the ROTATED token and must replace the stored one. */
  refreshToken: string;
  tokenType: "Bearer";
  /** From the provider's `expires_in`; not assumed. */
  accessTokenExpiresAt: Date;
  /** From `x_refresh_token_expires_in`; not assumed. */
  refreshTokenExpiresAt: Date;
  /** Absolute cap on the refresh token's life when Intuit reports one, else null. */
  refreshTokenHardExpiresAt: Date | null;
  issuedAt: Date;
  intuitTid: string | null;
}

/** Map a grant onto the generic OAuthToken so the shared AES-256-GCM/HKDF encryption is reused. */
export function toOAuthToken(grant: QboTokenGrant): OAuthToken {
  return {
    accessToken: grant.accessToken,
    refreshToken: grant.refreshToken,
    expiresAt: grant.accessTokenExpiresAt,
    tokenType: grant.tokenType,
  };
}

function httpOptions(options: QboOauthCallOptions) {
  return {
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    signal: options.signal,
    maxBodyBytes: MAX_OAUTH_BODY_BYTES,
  };
}

async function postForm(
  config: QboProviderConfig,
  params: URLSearchParams,
  operation: "exchange" | "refresh",
  options: QboOauthCallOptions,
): Promise<QboTokenGrant> {
  assertResolvedConfig(config);
  const res = await qboHttp(
    config.tokenUrl,
    {
      method: "POST",
      headers: {
        Authorization: config.credentials.basicAuthorization(),
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: params.toString(),
    },
    httpOptions(options),
  );

  if (res.status < 200 || res.status >= 300) {
    const body = parseJsonObjectLenient(res.bodyText);
    throw classifyOauthHttpFailure(operation, {
      status: res.status,
      intuitTid: res.intuitTid,
      providerCode: sanitizeProviderCode(body?.error),
      retryAfterMs: parseRetryAfterMs(res.headers),
    });
  }

  const body = parseJsonObjectLenient(res.bodyText);
  const parsed = body ? TokenResponseSchema.safeParse(body) : null;
  if (!parsed || !parsed.success) {
    throw new QboProviderError({ kind: "MALFORMED_RESPONSE", httpStatus: res.status, intuitTid: res.intuitTid });
  }
  const t = parsed.data;
  const issuedAt = (options.now ?? (() => new Date()))();
  return {
    accessToken: t.access_token,
    refreshToken: t.refresh_token,
    tokenType: "Bearer",
    accessTokenExpiresAt: new Date(issuedAt.getTime() + t.expires_in * 1000),
    refreshTokenExpiresAt: new Date(issuedAt.getTime() + t.x_refresh_token_expires_in * 1000),
    refreshTokenHardExpiresAt:
      t.x_refresh_token_hard_expires_in === undefined
        ? null
        : new Date(issuedAt.getTime() + t.x_refresh_token_hard_expires_in * 1000),
    issuedAt,
    intuitTid: res.intuitTid,
  };
}

/** Exchange a one-time authorization code for tokens. The redirect URI is the configured one, exactly. */
export async function exchangeQboAuthorizationCode(
  config: QboProviderConfig,
  code: string,
  options: QboOauthCallOptions = {},
): Promise<QboTokenGrant> {
  if (typeof code !== "string" || !CODE_PATTERN.test(code)) {
    throw new QboProviderError({ kind: "AUTHORIZATION_INVALID", localReason: "INVALID_CODE_FORMAT" });
  }
  const params = new URLSearchParams();
  params.set("grant_type", "authorization_code");
  params.set("code", code);
  params.set("redirect_uri", config.redirectUri);
  return postForm(config, params, "exchange", options);
}

/**
 * Refresh an access token. Intuit rotates the refresh token: the returned grant's `refreshToken`
 * is the one to store from now on.
 */
export async function refreshQboTokens(
  config: QboProviderConfig,
  refreshToken: string,
  options: QboOauthCallOptions = {},
): Promise<QboTokenGrant> {
  if (typeof refreshToken !== "string" || !TOKEN_PATTERN.test(refreshToken)) {
    throw new QboProviderError({ kind: "REFRESH_INVALID", localReason: "INVALID_REFRESH_TOKEN_FORMAT" });
  }
  const params = new URLSearchParams();
  params.set("grant_type", "refresh_token");
  params.set("refresh_token", refreshToken);
  return postForm(config, params, "refresh", options);
}

// ─── Revocation ─────────────────────────────────────────────────────────────

export interface QboRevocationResult {
  outcome: "REVOKED";
  intuitTid: string | null;
}

/**
 * Revoke a refresh token (or access token) at Intuit. Resolves with { outcome: "REVOKED" } on a 2xx.
 * A token Intuit no longer recognises (already revoked or expired) is reported as a typed
 * REFRESH_INVALID error rather than silently treated as success: a disconnect flow may decide that
 * "already unusable" is acceptable, but this module does not assume it.
 */
export async function revokeQboToken(
  config: QboProviderConfig,
  token: string,
  options: QboOauthCallOptions = {},
): Promise<QboRevocationResult> {
  assertResolvedConfig(config);
  if (typeof token !== "string" || !TOKEN_PATTERN.test(token)) {
    throw new QboProviderError({ kind: "REFRESH_INVALID", localReason: "INVALID_TOKEN_FORMAT" });
  }
  const res = await qboHttp(
    config.revokeUrl,
    {
      method: "POST",
      headers: {
        Authorization: config.credentials.basicAuthorization(),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ token }),
    },
    httpOptions(options),
  );
  if (res.status >= 200 && res.status < 300) return { outcome: "REVOKED", intuitTid: res.intuitTid };
  const body = parseJsonObjectLenient(res.bodyText);
  throw classifyOauthHttpFailure("revoke", {
    status: res.status,
    intuitTid: res.intuitTid,
    providerCode: sanitizeProviderCode(body?.error),
    retryAfterMs: parseRetryAfterMs(res.headers),
  });
}
