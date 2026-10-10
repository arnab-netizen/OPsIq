/**
 * QuickBooks Online — usable access token for a connection (decrypt server-side, refresh only when needed).
 *
 * Wires the released refresh mechanism (refreshQboTokens) to the released revision-fenced persistence
 * (loadQboTokensForUse / rotateQboTokens / markQboReauthorizationRequired). It owns NO crypto and NO SQL.
 *
 *  - The decrypted access token is returned to the in-process sync caller only; it is never put in a result type that
 *    reaches a route, an audit payload, a log line or an error message.
 *  - Refresh happens only when the access token is within `skewMs` of expiry (or when a 401 forces it, at most once per
 *    sync — enforced by the caller's `forced` flag, so there is no refresh loop).
 *  - Intuit ROTATES the refresh token. The refreshed grant is persisted with a compare-and-set on the token `revision`
 *    the refresh started from. If another writer rotated first (STALE_REVISION), this caller's grant is discarded
 *    unpersisted and the winner's stored token is re-read and used — a stale writer can never overwrite newer tokens.
 *  - invalid_grant on refresh, or a refresh token past either expiry, marks the connection REAUTH_REQUIRED
 *    (idempotent, audited) and returns REAUTH_REQUIRED; the caller must not retry. Transient provider failures change
 *    no state and return a retryable code. A refresh call is never retried here (a lost response may already have
 *    rotated the token), the next scheduled attempt decides.
 */
import { isQboProviderError } from "@/domain/quickbooks/qbo-errors";
import { syncFailureFromError, type QboSyncFailureCode } from "@/domain/quickbooks/qbo-sync-model";
import type { QboEnvironment, QboProviderConfig } from "@/domain/quickbooks/qbo-config";
import { loadQboTokensForUse, markQboReauthorizationRequired, rotateQboTokens, type QboPersistenceDeps, type QboTokensForUse } from "./qbo-connection.service";
import { refreshQboTokens } from "./qbo-oauth.service";
import type { QboFetch } from "./qbo-http";

/** Refresh when the access token has less than this left. */
export const QBO_ACCESS_TOKEN_SKEW_MS = 2 * 60 * 1000;

export interface QboTokenAccessDeps extends QboPersistenceDeps {
  config: QboProviderConfig;
  fetchImpl?: QboFetch;
  skewMs?: number;
}

export type QboTokenAccessResult =
  | { ok: true; accessToken: string; realmId: string; environment: QboEnvironment; refreshed: boolean }
  | { ok: false; code: QboSyncFailureCode; retryAfterMs: number | null };

const fail = (code: QboSyncFailureCode, retryAfterMs: number | null = null): QboTokenAccessResult => ({ ok: false, code, retryAfterMs });

function accessStillValid(t: QboTokensForUse, now: Date, skewMs: number): boolean {
  return t.accessTokenExpiresAt.getTime() - now.getTime() > skewMs;
}

function refreshTokenDead(t: QboTokensForUse, now: Date): boolean {
  if (t.refreshTokenExpiresAt.getTime() <= now.getTime()) return true;
  return t.refreshTokenHardExpiresAt !== null && t.refreshTokenHardExpiresAt.getTime() <= now.getTime();
}

export async function getUsableQboAccessToken(
  input: { workspaceId: string; connectionId: string; forceRefresh?: boolean },
  deps: QboTokenAccessDeps,
): Promise<QboTokenAccessResult> {
  const now = (deps.now ?? (() => new Date()))();
  const skewMs = deps.skewMs ?? QBO_ACCESS_TOKEN_SKEW_MS;
  const ref = { workspaceId: input.workspaceId, connectionId: input.connectionId };

  const loaded = await loadQboTokensForUse(ref, deps);
  if (!loaded.ok) return fail(loaded.reason === "NOT_FOUND" ? "CONNECTION_NOT_FOUND" : "CONNECTION_NOT_ACTIVE");
  const tokens = loaded.tokens;
  // Credentials are per environment; never present sandbox tokens to the production host or vice versa.
  if (tokens.environment !== deps.config.environment) return fail("ENVIRONMENT_MISMATCH");

  if (!input.forceRefresh && accessStillValid(tokens, now, skewMs)) {
    return { ok: true, accessToken: tokens.accessToken, realmId: tokens.realmId, environment: tokens.environment, refreshed: false };
  }

  if (refreshTokenDead(tokens, now)) {
    await markQboReauthorizationRequired({ ...ref, reasonCode: "REFRESH_TOKEN_EXPIRED" }, deps);
    return fail("REAUTH_REQUIRED");
  }

  let grant;
  try {
    grant = await refreshQboTokens(deps.config, tokens.refreshToken, { fetchImpl: deps.fetchImpl, now: () => now });
  } catch (e) {
    if (isQboProviderError(e) && e.kind === "REFRESH_INVALID") {
      await markQboReauthorizationRequired({ ...ref, reasonCode: "REFRESH_INVALID" }, deps);
      return fail("REAUTH_REQUIRED");
    }
    const mapped = syncFailureFromError(e);
    return fail(mapped.code, mapped.retryAfterMs);
  }

  const rotated = await rotateQboTokens({ ...ref, expectedRevision: tokens.revision, grant }, deps);
  if (rotated.ok) {
    return { ok: true, accessToken: grant.accessToken, realmId: tokens.realmId, environment: tokens.environment, refreshed: true };
  }
  if (rotated.reason === "CONNECTION_NOT_ACTIVE") return fail("CONNECTION_NOT_ACTIVE");

  // STALE_REVISION: another writer rotated first. Discard our grant and use what won.
  const winner = await loadQboTokensForUse(ref, deps);
  if (!winner.ok) return fail(winner.reason === "NOT_FOUND" ? "CONNECTION_NOT_FOUND" : "CONNECTION_NOT_ACTIVE");
  if (accessStillValid(winner.tokens, now, skewMs)) {
    return { ok: true, accessToken: winner.tokens.accessToken, realmId: winner.tokens.realmId, environment: winner.tokens.environment, refreshed: true };
  }
  // The winner's token is already unusable too: let the caller back off rather than refresh in a loop.
  return fail("PROVIDER_UNAVAILABLE");
}
