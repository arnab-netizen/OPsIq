/**
 * QuickBooks Online — token lifecycle for one connection (refresh-on-demand).
 *
 * There is no dedicated refresh scheduler: every sync run (daily, plus webhook- or owner-triggered) obtains its access token
 * through this provider, which refreshes only when the token is within REFRESH_SKEW of expiry, or after a 401.
 *
 * Concurrency: Intuit ROTATES the refresh token on every refresh, so two concurrent refreshes would race to invalidate each
 * other. Refresh is therefore serialised per connection with an advisory lock (qbo-connection-lock, "refresh"); inside it the
 * stored token is re-read first (a waiter that finds a newer revision simply uses it), and the new grant is persisted with a
 * compare-and-set on `revision` (rotateQboTokens). A stale writer writes nothing.
 *
 * Failure semantics
 *   - Intuit rejects the refresh token (invalid_grant)            -> connection becomes REAUTH_REQUIRED, QboReauthRequiredError.
 *   - the stored refresh token is already past its expiry          -> same.
 *   - network / 5xx / 429 / timeout                                -> the provider error propagates; the scheduler retries.
 * Tokens are never logged and never appear in errors.
 */
import type { QboProviderConfig } from "@/domain/quickbooks/qbo-config";
import { QboProviderError, isQboProviderError } from "@/domain/quickbooks/qbo-errors";
import { loadQboTokensForUse, markQboReauthorizationRequired, rotateQboTokens, type QboPersistenceDeps } from "./qbo-connection.service";
import { refreshQboTokens } from "./qbo-oauth.service";
import { withQboConnectionLock } from "./qbo-connection-lock";
import type { QboFetch } from "./qbo-http";
import { logger } from "@/infra/logger";

/** Refresh when the access token has less than this left (Intuit access tokens live ~1 hour). */
export const QBO_REFRESH_SKEW_MS = 120_000;
export const QBO_ROTATION_PERSIST_ATTEMPTS = 4;
export const QBO_ROTATION_PERSIST_BACKOFF_MS = 250;

export class QboReauthRequiredError extends Error {
  readonly code = "REAUTH_REQUIRED" as const;
  constructor(readonly reason: "REFRESH_TOKEN_REJECTED" | "REFRESH_TOKEN_EXPIRED") {
    super("The QuickBooks connection must be re-authorized.");
    this.name = "QboReauthRequiredError";
  }
}

export class QboConnectionNotActiveError extends Error {
  readonly code = "CONNECTION_NOT_ACTIVE" as const;
  constructor() {
    super("The QuickBooks connection is not active.");
    this.name = "QboConnectionNotActiveError";
  }
}

export interface QboTokenProviderOptions extends QboPersistenceDeps {
  workspaceId: string;
  connectionId: string;
  config: QboProviderConfig;
  fetchImpl?: QboFetch;
  signal?: AbortSignal;
  /** Backoff between persistence attempts (tests inject an instant one). */
  sleep?: (ms: number) => Promise<void>;
}

export interface QboTokenProvider {
  getAccessToken(): Promise<string>;
  /** After a 401 with `failedToken`: refresh unless another worker already replaced it. Returns the token to retry with. */
  refreshAfterRejection(failedToken: string): Promise<string>;
}

export function createQboTokenProvider(opts: QboTokenProviderOptions): QboTokenProvider {
  const now = opts.now ?? (() => new Date());
  const persistence: QboPersistenceDeps = { client: opts.client, now: opts.now };
  const ref = { workspaceId: opts.workspaceId, connectionId: opts.connectionId };

  async function load() {
    const r = await loadQboTokensForUse(ref, persistence);
    if (!r.ok) throw new QboConnectionNotActiveError();
    return r.tokens;
  }

  async function reauth(reason: "REFRESH_TOKEN_REJECTED" | "REFRESH_TOKEN_EXPIRED"): Promise<never> {
    await markQboReauthorizationRequired({ ...ref, reasonCode: reason }, persistence);
    throw new QboReauthRequiredError(reason);
  }

  /**
   * Intuit may answer a refresh with a NEW refresh token and, once it has, treats the previous one as dead. The new grant is
   * therefore the only credential that still works, and losing it to a transient database error would end the connection until
   * the owner re-authorizes. The write is retried (it is a compare-and-set on `revision`, so a retry can never overwrite a
   * newer rotation), and after a thrown error the stored token is re-read first: if the first attempt actually committed, the
   * stored access token is the grant's and nothing more is written. Only after every attempt fails does the error propagate.
   */
  async function persistRotation(expectedRevision: number, previousAccessToken: string, grant: Awaited<ReturnType<typeof refreshQboTokens>>) {
    const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
    for (let attempt = 0; attempt < QBO_ROTATION_PERSIST_ATTEMPTS; attempt++) {
      if (attempt > 0) await sleep(QBO_ROTATION_PERSIST_BACKOFF_MS * 2 ** (attempt - 1));
      try {
        return await rotateQboTokens({ ...ref, expectedRevision, grant }, persistence);
      } catch {
        try {
          const stored = await loadQboTokensForUse(ref, persistence);
          if (stored.ok && stored.tokens.accessToken === grant.accessToken) return { ok: true as const, revision: stored.tokens.revision };
          if (stored.ok && stored.tokens.accessToken !== previousAccessToken) return { ok: false as const, reason: "STALE_REVISION" as const };
        } catch {
          /* the database is still unavailable: retry the write */
        }
      }
    }
    logger.error("QBO token rotation could not be persisted", { workspaceId: opts.workspaceId, connectionId: opts.connectionId, code: "TOKEN_PERSIST_FAILED" });
    throw new QboProviderError({ kind: "TRANSIENT_PROVIDER_FAILURE", localReason: "TOKEN_PERSIST_FAILED" });
  }

  /** Under the refresh lock: re-read, decide, refresh, persist. `failedToken` set => a rejected token must be replaced. */
  async function refreshLocked(failedToken: string | null): Promise<string> {
    const outcome = await withQboConnectionLock(
      "refresh",
      opts.workspaceId,
      opts.connectionId,
      async () => {
        const t = await load();
        const stillUsable = t.accessTokenExpiresAt.getTime() - now().getTime() > QBO_REFRESH_SKEW_MS;
        if (failedToken === null ? stillUsable : t.accessToken !== failedToken) return t.accessToken; // another worker refreshed
        const hardExpiry = t.refreshTokenHardExpiresAt?.getTime() ?? Number.POSITIVE_INFINITY;
        if (t.refreshTokenExpiresAt.getTime() <= now().getTime() || hardExpiry <= now().getTime()) return reauth("REFRESH_TOKEN_EXPIRED");
        let grant;
        try {
          grant = await refreshQboTokens(opts.config, t.refreshToken, { fetchImpl: opts.fetchImpl, signal: opts.signal, now });
        } catch (e) {
          if (isQboProviderError(e) && e.kind === "REFRESH_INVALID") return reauth("REFRESH_TOKEN_REJECTED");
          throw e;
        }
        const rotated = await persistRotation(t.revision, t.accessToken, grant);
        if (rotated.ok) return grant.accessToken;
        if (rotated.reason === "CONNECTION_NOT_ACTIVE") throw new QboConnectionNotActiveError();
        // STALE_REVISION: someone else rotated first (their grant is the live one); use whatever is stored now.
        return (await load()).accessToken;
      },
      { ttlMs: 60_000, waitMs: 30_000, client: opts.client },
    );
    // Another worker held the refresh lock for the whole wait window: surface as a transient provider failure (scheduler retry).
    if (!outcome.acquired) throw new QboProviderError({ kind: "TRANSIENT_PROVIDER_FAILURE", localReason: "REFRESH_LOCK_BUSY" });
    return outcome.value;
  }

  return {
    async getAccessToken() {
      const t = await load();
      if (t.accessTokenExpiresAt.getTime() - now().getTime() > QBO_REFRESH_SKEW_MS) return t.accessToken;
      return refreshLocked(null);
    },
    refreshAfterRejection(failedToken) {
      return refreshLocked(failedToken);
    },
  };
}
