/**
 * QuickBooks Online — usable access token for a connection (decrypt server-side, refresh only when needed).
 *
 * Wires the released refresh mechanism (refreshQboTokens) to the released revision-fenced persistence
 * (loadQboTokensForUse / rotateQboTokens / markQboReauthorizationRequired). It owns NO crypto and NO SQL.
 *
 *  - The decrypted access token is returned to the in-process sync caller only; it is never put in a result type that
 *    reaches a route, an audit payload, a log line or an error message.
 *  - Refresh happens only when the access token is within `skewMs` of expiry (or when a 401 forces it for the revision that was
 *    rejected). Refreshes of one connection are serialized by a short DB claim, so Intuit is called once, not once per racer.
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
import { releaseTokenRefreshClaim, tryClaimTokenRefresh } from "./qbo-sync-store.service";
import { refreshQboTokens } from "./qbo-oauth.service";
import type { QboFetch } from "./qbo-http";

/** Refresh when the access token has less than this left. */
export const QBO_ACCESS_TOKEN_SKEW_MS = 2 * 60 * 1000;

export interface QboTokenAccessDeps extends QboPersistenceDeps {
  config: QboProviderConfig;
  fetchImpl?: QboFetch;
  skewMs?: number;
  /** Waiting for another refresher: poll interval and total wait. Defaults 250ms / 30s. */
  claimPollMs?: number;
  claimMaxWaitMs?: number;
  sleep?: (ms: number) => Promise<void>;
  /**
   * Invocation-level cancellation: aborts the claim wait and the refresh request in flight (the caller's hard deadline). An aborted
   * refresh persists nothing and is reported as CANCELLED (retryable); it never changes the connection state.
   */
  signal?: AbortSignal;
}

export type QboTokenAccessResult =
  | { ok: true; accessToken: string; realmId: string; environment: QboEnvironment; refreshed: boolean; revision: number }
  | { ok: false; code: QboSyncFailureCode; retryAfterMs: number | null };

const fail = (code: QboSyncFailureCode, retryAfterMs: number | null = null): QboTokenAccessResult => ({ ok: false, code, retryAfterMs });

function accessStillValid(t: QboTokensForUse, now: Date, skewMs: number): boolean {
  return t.accessTokenExpiresAt.getTime() - now.getTime() > skewMs;
}

function refreshTokenDead(t: QboTokensForUse, now: Date): boolean {
  if (t.refreshTokenExpiresAt.getTime() <= now.getTime()) return true;
  return t.refreshTokenHardExpiresAt !== null && t.refreshTokenHardExpiresAt.getTime() <= now.getTime();
}

const ROTATE_ATTEMPTS = 3;

const ok = (t: QboTokensForUse, refreshed: boolean): QboTokenAccessResult => ({ ok: true, accessToken: t.accessToken, realmId: t.realmId, environment: t.environment, refreshed, revision: t.revision });

/**
 * `forceRefresh` is the "the API rejected the token I have" path. `knownRevision` is the token revision that was rejected:
 * if the stored revision is already newer, someone else has refreshed since, and the stored token is returned WITHOUT calling
 * Intuit again (no refresh storm after a concurrent refresh).
 */
export async function getUsableQboAccessToken(
  input: { workspaceId: string; connectionId: string; forceRefresh?: boolean; knownRevision?: number },
  deps: QboTokenAccessDeps,
): Promise<QboTokenAccessResult> {
  const now = (deps.now ?? (() => new Date()))();
  const skewMs = deps.skewMs ?? QBO_ACCESS_TOKEN_SKEW_MS;
  const ref = { workspaceId: input.workspaceId, connectionId: input.connectionId };

  const usable = (t: QboTokensForUse): boolean =>
    input.forceRefresh ? input.knownRevision !== undefined && t.revision > input.knownRevision && accessStillValid(t, now, skewMs) : accessStillValid(t, now, skewMs);

  const loaded = await loadQboTokensForUse(ref, deps);
  if (!loaded.ok) return fail(loaded.reason === "NOT_FOUND" ? "CONNECTION_NOT_FOUND" : "CONNECTION_NOT_ACTIVE");
  // Credentials are per environment; never present sandbox tokens to the production host or vice versa.
  if (loaded.tokens.environment !== deps.config.environment) return fail("ENVIRONMENT_MISMATCH");
  if (usable(loaded.tokens)) return ok(loaded.tokens, false);
  if (refreshTokenDead(loaded.tokens, now)) {
    await markQboReauthorizationRequired({ ...ref, reasonCode: "REFRESH_TOKEN_EXPIRED" }, deps);
    return fail("REAUTH_REQUIRED");
  }

  // Become the one refresher (a short DB claim, no open transaction). If another refresher holds it, wait for its result:
  // when it finishes the stored tokens are fresh and Intuit is NOT called a second time.
  const poll = deps.claimPollMs ?? 250;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => {
    const t = setTimeout(done, ms);
    function done() { deps.signal?.removeEventListener("abort", done); clearTimeout(t); r(); }
    deps.signal?.addEventListener("abort", done, { once: true });
  }));
  const deadline = Date.now() + (deps.claimMaxWaitMs ?? 30_000);
  let claim = await tryClaimTokenRefresh(ref, deps);
  while (!claim.claimed) {
    if (deps.signal?.aborted) return fail("CANCELLED");
    if (Date.now() >= deadline) return fail("PROVIDER_UNAVAILABLE");
    await sleep(poll);
    const peek = await loadQboTokensForUse(ref, deps);
    if (!peek.ok) return fail(peek.reason === "NOT_FOUND" ? "CONNECTION_NOT_FOUND" : "CONNECTION_NOT_ACTIVE");
    if (usable(peek.tokens)) return ok(peek.tokens, true);
    claim = await tryClaimTokenRefresh(ref, deps);
  }
  const claimToken = claim.token;
  try {
    if (deps.signal?.aborted) return fail("CANCELLED");
    // Re-read under the claim: a refresher that held it before us may already have done the work.
    const again = await loadQboTokensForUse(ref, deps);
    if (!again.ok) return fail(again.reason === "NOT_FOUND" ? "CONNECTION_NOT_FOUND" : "CONNECTION_NOT_ACTIVE");
    const tokens = again.tokens;
    if (usable(tokens)) return ok(tokens, true);
    if (refreshTokenDead(tokens, now)) {
      await markQboReauthorizationRequired({ ...ref, reasonCode: "REFRESH_TOKEN_EXPIRED" }, deps);
      return fail("REAUTH_REQUIRED");
    }

    /** A newer stored revision than the one this refresh started from => someone else rotated: use it (or back off), never REAUTH. */
    const supersededBy = async (startedFrom: number): Promise<QboTokenAccessResult | null> => {
      const latest = await loadQboTokensForUse(ref, deps);
      if (!latest.ok || latest.tokens.revision <= startedFrom) return null;
      return accessStillValid(latest.tokens, now, skewMs) ? ok(latest.tokens, true) : fail("PROVIDER_UNAVAILABLE");
    };

    let grant;
    try {
      grant = await refreshQboTokens(deps.config, tokens.refreshToken, { fetchImpl: deps.fetchImpl, now: () => now, signal: deps.signal });
    } catch (e) {
      if (isQboProviderError(e) && e.kind === "REFRESH_INVALID") {
        // invalid_grant is only proof of a dead grant if the token we presented is still the CURRENT one. If our claim lapsed while
        // another refresher rotated (it holds a newer revision), Intuit correctly rejected the superseded token: that is not a
        // reason to demand a reconnect. The mark itself is fenced on the revision we presented, so a rotation landing between this
        // re-read and the mark also wins.
        const superseded = await supersededBy(tokens.revision);
        if (superseded) return superseded;
        const marked = await markQboReauthorizationRequired({ ...ref, reasonCode: "REFRESH_INVALID", expectedTokenRevision: tokens.revision }, deps);
        if (!marked.changed) {
          const raced = await supersededBy(tokens.revision);
          if (raced) return raced;
        }
        return fail("REAUTH_REQUIRED");
      }
      const mapped = syncFailureFromError(e);
      return fail(mapped.code, mapped.retryAfterMs);
    }

    // Intuit has now ROTATED the refresh token: persisting the new grant must not be lost to a transient database error.
    // The compare-and-set makes a retry safe (if an earlier attempt actually committed, the retry sees STALE_REVISION and the
    // re-read below finds our own grant stored).
    let rotated: Awaited<ReturnType<typeof rotateQboTokens>> | null = null;
    let lastError: unknown = null;
    for (let attempt = 0; attempt < ROTATE_ATTEMPTS && rotated === null; attempt++) {
      try {
        rotated = await rotateQboTokens({ ...ref, expectedRevision: tokens.revision, grant }, deps);
      } catch (e) {
        lastError = e;
      }
    }
    if (rotated === null) throw lastError;
    if (rotated.ok) {
      return { ok: true, accessToken: grant.accessToken, realmId: tokens.realmId, environment: tokens.environment, refreshed: true, revision: rotated.revision };
    }
    if (rotated.reason === "CONNECTION_NOT_ACTIVE") return fail("CONNECTION_NOT_ACTIVE");

    // STALE_REVISION: something outside the lock rotated first. Discard our grant and use what won.
    const winner = await loadQboTokensForUse(ref, deps);
    if (!winner.ok) return fail(winner.reason === "NOT_FOUND" ? "CONNECTION_NOT_FOUND" : "CONNECTION_NOT_ACTIVE");
    if (accessStillValid(winner.tokens, now, skewMs)) return ok(winner.tokens, true);
    // The winner's token is already unusable too: let the caller back off rather than refresh in a loop.
    return fail("PROVIDER_UNAVAILABLE");
  } finally {
    await releaseTokenRefreshClaim({ ...ref, token: claimToken }, deps);
  }
}
