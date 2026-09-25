/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma `db` proxy rows are untyped; pragmatic any at the persistence boundary */
/**
 * QuickBooks Online — token persistence and race-safe refresh.
 *
 * Owns:
 *  - storeQboTokens: encrypt + persist a token pair (initial connect or a
 *    completed refresh), bumping OwnerConnectorToken.version atomically.
 *  - createQboTokenProvider: a QboTokenProvider (qbo-contracts) implementation.
 *    getCredentials returns a live access token, refreshing it when it is
 *    within QBO_ACCESS_TOKEN_REFRESH_SKEW_SECONDS of expiry. Refresh is
 *    race-safe: exactly one caller across concurrent processes/requests calls
 *    Intuit's token endpoint per rotation, via a DB-leased compare-and-set on
 *    OwnerConnectorToken.version + refreshLockedUntil. Losers poll (bounded)
 *    until the winner's new version is visible, then return its token.
 *
 * No raw token, code, client secret or state value is ever logged, audited or
 * placed in a thrown error message.
 */

import { db } from "@/lib/db";
import { logger } from "@/infra/logger";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { encryptOAuthToken, decryptOAuthToken } from "@/services/external-systems/oauth-token.service";
import { toAuditActor, type AuditActor } from "@/domain/owner-budget/system-actor";
import {
  QBO_PROVIDER,
  QBO_ACCESS_TOKEN_REFRESH_SKEW_SECONDS,
  resolveQboConfig,
  type QboEnvironment,
} from "@/domain/quickbooks/qbo-config";
import { QboApiError, type QboConnectionCredentials, type QboTokenProvider } from "@/domain/quickbooks/qbo-contracts";
import { refreshQboTokens, type QboTokenResult, type FetchImpl } from "./qbo-oauth.service";

// ─── storeQboTokens ─────────────────────────────────────────────────────────

/** Minimal Prisma-client surface this module needs; `db` and a `$transaction` tx both satisfy it. */
type QboTokenDbClient = typeof db;

export interface StoreQboTokensInput {
  workspaceId: string;
  connectorId: string;
  tokens: QboTokenResult;
  now?: Date;
  /** Pass the transaction client when called from inside a caller-owned $transaction. */
  client?: QboTokenDbClient;
}

export interface StoreQboTokensResult {
  version: number;
  accessTokenExpiresAt: Date;
  refreshTokenExpiresAt: Date;
}

/**
 * Encrypt and persist a fresh token pair, bumping OwnerConnectorToken.version
 * atomically (Prisma `increment`, so no read-then-write race on update) and
 * mirroring the access-token expiry onto OwnerConnector.tokenExpiresAt.
 */
export async function storeQboTokens(input: StoreQboTokensInput): Promise<StoreQboTokensResult> {
  const c = (input.client ?? db) as typeof db;
  const now = input.now ?? new Date();

  const encrypted = encryptOAuthToken(
    { accessToken: input.tokens.accessToken, refreshToken: input.tokens.refreshToken, tokenType: input.tokens.tokenType },
    input.workspaceId,
  );

  const accessTokenExpiresAt = new Date(now.getTime() + input.tokens.expiresInSeconds * 1000);
  const refreshExpirySeconds =
    input.tokens.refreshTokenHardExpiresInSeconds != null
      ? Math.min(input.tokens.refreshTokenExpiresInSeconds, input.tokens.refreshTokenHardExpiresInSeconds)
      : input.tokens.refreshTokenExpiresInSeconds;
  const refreshTokenExpiresAt = new Date(now.getTime() + refreshExpirySeconds * 1000);

  const row = await (c as any).ownerConnectorToken.upsert({
    where: { connectorId: input.connectorId },
    create: {
      connectorId: input.connectorId,
      encryptedAccessToken: encrypted.accessToken,
      encryptedRefreshToken: encrypted.refreshToken ?? null,
      tokenType: encrypted.tokenType,
      refreshTokenExpiresAt,
      version: 0,
      refreshLockedUntil: null,
    },
    update: {
      encryptedAccessToken: encrypted.accessToken,
      encryptedRefreshToken: encrypted.refreshToken ?? null,
      tokenType: encrypted.tokenType,
      refreshTokenExpiresAt,
      version: { increment: 1 },
      refreshLockedUntil: null,
    },
  });

  await (c as any).ownerConnector.update({
    where: { id: input.connectorId },
    data: { tokenExpiresAt: accessTokenExpiresAt },
  });

  return { version: row.version as number, accessTokenExpiresAt, refreshTokenExpiresAt };
}

// ─── createQboTokenProvider ─────────────────────────────────────────────────

export interface CreateQboTokenProviderOptions {
  workspaceId: string;
  connectorId: string;
  fetchImpl?: FetchImpl;
  /** Injectable clock for tests. Defaults to `() => new Date()`. */
  now?: () => Date;
  /** Injectable sleep for the bounded refresh-lease poll. Defaults to a real timer. */
  sleep?: (ms: number) => Promise<void>;
  /** Injectable env for resolveQboConfig. Defaults to process.env. */
  env?: Record<string, string | undefined>;
  /** Audit actor for refresh events. Omit for a purely system-driven refresh. */
  actorId?: string;
}

interface OwnerConnectorRow {
  id: string;
  workspaceId: string;
  provider: string;
  status: string;
  externalAccountId: string | null;
  environment: string | null;
  tokenExpiresAt: Date | null;
  businessId: string | null;
}

interface OwnerConnectorTokenRow {
  connectorId: string;
  encryptedAccessToken: string;
  encryptedRefreshToken: string | null;
  tokenType: string;
  refreshTokenExpiresAt: Date | null;
  version: number;
  refreshLockedUntil: Date | null;
}

const REFRESH_LEASE_MS = 30_000;
const REFRESH_POLL_TIMEOUT_MS = 10_000;
const REFRESH_POLL_INTERVAL_MS = 250;

// Exported (export-only change) so qbo-sync.service.ts's own AUTH-failure
// summary text can reuse this exact wording instead of maintaining a second,
// shorter copy that could drift from what the token layer itself persists
// as OwnerConnector.syncFailureMessage when it transitions the connector to
// REFRESH_FAILED — see performRefresh()/transitionToRefreshFailed() below.
export const REFRESH_FAILED_MESSAGE = "QuickBooks authorization expired or was revoked. Reconnect QuickBooks.";

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function actorFor(actorId?: string): AuditActor {
  return actorId ? toAuditActor(actorId) : { actorType: "system" };
}

function decryptStoredToken(row: OwnerConnectorTokenRow, workspaceId: string): { accessToken: string; refreshToken?: string } {
  return decryptOAuthToken(
    { accessToken: row.encryptedAccessToken, refreshToken: row.encryptedRefreshToken ?? undefined, tokenType: row.tokenType },
    workspaceId,
  );
}

export function createQboTokenProvider(opts: CreateQboTokenProviderOptions): QboTokenProvider {
  const now = opts.now ?? (() => new Date());
  const sleep = opts.sleep ?? defaultSleep;

  async function loadConnector(): Promise<OwnerConnectorRow> {
    const connector = await (db as any).ownerConnector.findFirst({
      where: { id: opts.connectorId, workspaceId: opts.workspaceId, provider: QBO_PROVIDER },
      select: {
        id: true,
        workspaceId: true,
        provider: true,
        status: true,
        externalAccountId: true,
        environment: true,
        tokenExpiresAt: true,
        businessId: true,
      },
    });
    if (!connector) {
      throw new QboApiError({ kind: "CONFIG", message: "QuickBooks connector not found." });
    }
    if (connector.status === "REFRESH_FAILED" || connector.status === "EXPIRED") {
      throw new QboApiError({ kind: "AUTH", message: REFRESH_FAILED_MESSAGE });
    }
    if (connector.status !== "ACTIVE") {
      throw new QboApiError({ kind: "CONFIG", message: "QuickBooks is not connected." });
    }
    if (!connector.externalAccountId || !connector.environment) {
      throw new QboApiError({ kind: "CONFIG", message: "QuickBooks connection is incomplete." });
    }
    return connector as OwnerConnectorRow;
  }

  async function loadToken(connectorId: string): Promise<OwnerConnectorTokenRow> {
    const token = await (db as any).ownerConnectorToken.findUnique({ where: { connectorId } });
    if (!token) {
      throw new QboApiError({ kind: "CONFIG", message: "QuickBooks credentials are missing. Reconnect QuickBooks." });
    }
    return token as OwnerConnectorTokenRow;
  }

  async function releaseLease(connectorId: string): Promise<void> {
    await (db as any).ownerConnectorToken.updateMany({
      where: { connectorId },
      data: { refreshLockedUntil: null },
    });
  }

  /**
   * Gate the connector into REFRESH_FAILED + audit exactly once (idempotent:
   * the status-not-already-REFRESH_FAILED predicate means a second caller
   * observing the same terminal failure is a no-op here).
   */
  async function transitionToRefreshFailed(connectorId: string, workspaceId: string): Promise<void> {
    const result = await (db as any).ownerConnector.updateMany({
      where: { id: connectorId, workspaceId, status: { not: "REFRESH_FAILED" } },
      data: { status: "REFRESH_FAILED", syncFailureMessage: REFRESH_FAILED_MESSAGE },
    });
    if (result.count === 1) {
      await emitAuditEvent({
        eventName: AUDIT_EVENTS.QUICKBOOKS_TOKEN_REFRESH_FAILED,
        workspaceId,
        entityType: "OwnerConnector",
        entityId: connectorId,
        payload: { provider: QBO_PROVIDER },
        ...actorFor(opts.actorId),
      });
    }
  }

  /**
   * Acquire the DB refresh lease via compare-and-set (connectorId + version
   * match + lease free). Returns "winner" when this call won the lease, or
   * the freshly-read token row once another process's rotation becomes
   * visible (version advanced past what we last observed). Bounded by
   * REFRESH_POLL_TIMEOUT_MS.
   */
  async function acquireLeaseOrWait(
    connectorId: string,
    observed: OwnerConnectorTokenRow,
  ): Promise<"winner" | OwnerConnectorTokenRow> {
    const deadline = now().getTime() + REFRESH_POLL_TIMEOUT_MS;
    let row = observed;
    for (;;) {
      const nowDate = now();
      const leaseFree = !row.refreshLockedUntil || row.refreshLockedUntil.getTime() < nowDate.getTime();
      if (leaseFree) {
        const cas = await (db as any).ownerConnectorToken.updateMany({
          where: {
            connectorId,
            version: row.version,
            OR: [{ refreshLockedUntil: null }, { refreshLockedUntil: { lt: nowDate } }],
          },
          data: { refreshLockedUntil: new Date(nowDate.getTime() + REFRESH_LEASE_MS) },
        });
        if (cas.count === 1) return "winner";
      }
      const fresh = await loadToken(connectorId);
      if (fresh.version > observed.version) {
        return fresh;
      }
      row = fresh;
      if (now().getTime() > deadline) {
        throw new QboApiError({
          kind: "TRANSIENT",
          message: "Timed out waiting for a QuickBooks token refresh already in progress.",
        });
      }
      await sleep(REFRESH_POLL_INTERVAL_MS);
    }
  }

  async function performRefresh(connector: OwnerConnectorRow, tokenRow: OwnerConnectorTokenRow): Promise<QboConnectionCredentials> {
    const configResult = resolveQboConfig(opts.env ?? process.env);
    if (!configResult.available) {
      await releaseLease(connector.id);
      throw new QboApiError({ kind: "CONFIG", message: "QuickBooks is not configured for this OpsIQ deployment." });
    }

    const decrypted = decryptStoredToken(tokenRow, opts.workspaceId);
    if (!decrypted.refreshToken) {
      await releaseLease(connector.id);
      await transitionToRefreshFailed(connector.id, opts.workspaceId);
      throw new QboApiError({ kind: "AUTH", message: REFRESH_FAILED_MESSAGE });
    }

    let tokens: QboTokenResult;
    try {
      tokens = await refreshQboTokens(configResult.config, decrypted.refreshToken, { fetchImpl: opts.fetchImpl });
    } catch (err) {
      if (err instanceof QboApiError && err.kind === "AUTH") {
        await transitionToRefreshFailed(connector.id, opts.workspaceId);
        await releaseLease(connector.id);
        throw err;
      }
      await releaseLease(connector.id);
      logger.warn(
        "QuickBooks token refresh failed transiently; connector left ACTIVE for retry.",
        { userId: undefined },
        { connectorId: connector.id, kind: err instanceof QboApiError ? err.kind : "UNKNOWN" },
      );
      throw err;
    }

    const nowDate = now();
    try {
      await (db as any).$transaction(async (tx: any) => {
        const stored = await storeQboTokens({
          workspaceId: opts.workspaceId,
          connectorId: connector.id,
          tokens,
          now: nowDate,
          client: tx,
        });
        await tx.ownerConnector.update({
          where: { id: connector.id },
          data: { tokenExpiresAt: stored.accessTokenExpiresAt, status: "ACTIVE", syncFailureMessage: null },
        });
        await emitAuditEvent(
          {
            eventName: AUDIT_EVENTS.QUICKBOOKS_TOKEN_REFRESHED,
            workspaceId: opts.workspaceId,
            entityType: "OwnerConnector",
            entityId: connector.id,
            payload: { provider: QBO_PROVIDER },
            ...actorFor(opts.actorId),
          },
          tx,
        );
      });
    } catch (persistErr) {
      // Intuit already rotated the refresh token server-side when refreshQboTokens
      // succeeded above: the OLD refresh token (still in the DB) is now dead at
      // Intuit, and the NEW one was never persisted. Leaving the connector ACTIVE
      // would let it silently limp along until its short-lived access token also
      // expires, only THEN discovering (via a second failed refresh) that it is
      // unrecoverable. Fail closed and visible now instead: release the lease
      // (never leave it to self-expire after 30s — a same-generation retry must
      // be able to try again immediately) and transition straight to
      // REFRESH_FAILED, exactly like an invalid_grant, since the practical
      // outcome (this connector cannot get a new access token) is identical.
      await releaseLease(connector.id);
      await transitionToRefreshFailed(connector.id, opts.workspaceId);
      logger.error(
        "QuickBooks token refresh succeeded at the provider but failed to persist; connector marked REFRESH_FAILED (the previous refresh token is no longer valid at Intuit).",
        persistErr instanceof Error ? persistErr : new Error(String(persistErr)),
        { connectorId: connector.id },
      );
      throw persistErr;
    }

    return {
      accessToken: tokens.accessToken,
      realmId: connector.externalAccountId as string,
      environment: connector.environment as QboEnvironment,
    };
  }

  async function loadOrRefresh(forcing: boolean, rejectedAccessToken?: string): Promise<QboConnectionCredentials> {
    const connector = await loadConnector();
    const tokenRow = await loadToken(connector.id);
    const nowDate = now();

    const decrypted = decryptStoredToken(tokenRow, opts.workspaceId);

    const freshEnough =
      connector.tokenExpiresAt != null &&
      connector.tokenExpiresAt.getTime() - nowDate.getTime() > QBO_ACCESS_TOKEN_REFRESH_SKEW_SECONDS * 1000;

    if (!forcing && freshEnough) {
      return {
        accessToken: decrypted.accessToken,
        realmId: connector.externalAccountId as string,
        environment: connector.environment as QboEnvironment,
      };
    }

    if (forcing && decrypted.accessToken !== rejectedAccessToken) {
      // Another process already rotated the token past the one that was rejected.
      return {
        accessToken: decrypted.accessToken,
        realmId: connector.externalAccountId as string,
        environment: connector.environment as QboEnvironment,
      };
    }

    if (tokenRow.refreshTokenExpiresAt && tokenRow.refreshTokenExpiresAt.getTime() < nowDate.getTime()) {
      await transitionToRefreshFailed(connector.id, opts.workspaceId);
      throw new QboApiError({ kind: "AUTH", message: REFRESH_FAILED_MESSAGE });
    }

    const lease = await acquireLeaseOrWait(connector.id, tokenRow);
    if (lease !== "winner") {
      const rotated = decryptStoredToken(lease, opts.workspaceId);
      return {
        accessToken: rotated.accessToken,
        realmId: connector.externalAccountId as string,
        environment: connector.environment as QboEnvironment,
      };
    }

    return performRefresh(connector, tokenRow);
  }

  return {
    getCredentials(): Promise<QboConnectionCredentials> {
      return loadOrRefresh(false);
    },
    forceRefresh(rejectedAccessToken: string): Promise<QboConnectionCredentials> {
      return loadOrRefresh(true, rejectedAccessToken);
    },
  };
}
