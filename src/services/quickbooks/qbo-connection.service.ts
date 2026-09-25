/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma `db` proxy rows are untyped; pragmatic any at the persistence boundary */
/**
 * QuickBooks Online — connection lifecycle: connect start, OAuth callback,
 * disconnect, owner-facing status.
 *
 * Workspace-scoped throughout. All mutations audited. The OAuth `state` is
 * never stored in the clear (only its SHA-256 hash), is bound to the
 * initiating actor and an expiry, and is consumed with a single
 * compare-and-set `updateMany` so a replayed/foreign-workspace/foreign-actor/
 * expired callback is rejected and cannot re-bind a connector.
 */

import { randomBytes, createHash } from "crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { logger } from "@/infra/logger";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { toAuditActor } from "@/domain/owner-budget/system-actor";
import { decryptOAuthToken } from "@/services/external-systems/oauth-token.service";
import { assertBusinessInWorkspace, BusinessScopeError } from "@/services/owner-mode/business-scope";
import { FeatureDisabledError, ValidationError, ConflictError, NotFoundError, UnauthorizedError } from "@/infra/errors";
import {
  QBO_PROVIDER,
  QBO_OAUTH_STATE_TTL_SECONDS,
  QBO_REALM_ID_PATTERN,
  resolveQboConfig,
  isValidRealmId,
} from "@/domain/quickbooks/qbo-config";
import {
  initialQboSyncState,
  parseQboSyncState,
  QBO_STALE_AFTER_HOURS,
  type QboFreshness,
  type QuickBooksStatusDTO,
} from "@/domain/quickbooks/qbo-contracts";
import { QBO_SYNC_ENTITY_ORDER } from "@/domain/quickbooks/qbo-entities";
import { buildQboAuthorizationUrl, exchangeQboAuthorizationCode, revokeQboToken, type FetchImpl } from "./qbo-oauth.service";
import { storeQboTokens } from "./qbo-token.service";

const OWNER_SAFE_UNAVAILABLE_REASON = "QuickBooks is not configured for this OpsIQ deployment.";

// ─── Input validation ───────────────────────────────────────────────────────

const StartInputSchema = z.object({
  workspaceId: z.string().uuid(),
  actorId: z.string().uuid(),
  businessId: z.string().uuid(),
});

const CompleteInputSchema = z.object({
  workspaceId: z.string().uuid(),
  actorId: z.string().uuid(),
  code: z.string().min(1).max(2048),
  state: z.string().min(1).max(512),
  realmId: z.string().regex(QBO_REALM_ID_PATTERN, "Invalid QuickBooks company id."),
});

const DisconnectInputSchema = z.object({
  workspaceId: z.string().uuid(),
  actorId: z.string().uuid(),
});

const StatusInputSchema = z.object({
  workspaceId: z.string().uuid(),
});

function parseOrValidationError<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError("Invalid QuickBooks request.", { issues: parsed.error.issues.map((i) => i.path.join(".")) });
  }
  return parsed.data;
}

async function assertBusinessScope(workspaceId: string, businessId: string): Promise<void> {
  try {
    await assertBusinessInWorkspace(db as any, workspaceId, businessId);
  } catch (err) {
    if (err instanceof BusinessScopeError) {
      throw new ValidationError("This business does not belong to your workspace.");
    }
    throw err;
  }
}

// ─── startQuickBooksConnect ─────────────────────────────────────────────────

export interface StartQuickBooksConnectInput {
  workspaceId: string;
  actorId: string;
  businessId: string;
  env?: Record<string, string | undefined>;
}

export interface StartQuickBooksConnectResult {
  authorizeUrl: string;
  connectorId: string;
}

export async function startQuickBooksConnect(input: StartQuickBooksConnectInput): Promise<StartQuickBooksConnectResult> {
  const parsed = parseOrValidationError(StartInputSchema, input);

  const configResult = resolveQboConfig(input.env ?? process.env);
  if (!configResult.available) {
    throw new FeatureDisabledError("QuickBooks", OWNER_SAFE_UNAVAILABLE_REASON);
  }

  await assertBusinessScope(parsed.workspaceId, parsed.businessId);

  const now = new Date();
  const state = randomBytes(32).toString("base64url");
  const oauthStateHash = createHash("sha256").update(state).digest("hex");
  const oauthStateExpiresAt = new Date(now.getTime() + QBO_OAUTH_STATE_TTL_SECONDS * 1000);

  const connectorId: string = await (db as any).$transaction(async (tx: any) => {
    const existing = await tx.ownerConnector.findFirst({
      where: { workspaceId: parsed.workspaceId, provider: QBO_PROVIDER },
    });

    if (existing && existing.status === "ACTIVE" && existing.businessId && existing.businessId !== parsed.businessId) {
      throw new ConflictError(
        "This OpsIQ workspace's QuickBooks connection is already linked to a different business; disconnect first.",
      );
    }

    // A reconnect of an ACTIVE/REFRESH_FAILED connector keeps its current status
    // until the callback succeeds; every other state starts (or restarts) as PENDING_AUTH.
    const keepStatus = existing != null && (existing.status === "ACTIVE" || existing.status === "REFRESH_FAILED");
    const mutableFields = {
      businessId: parsed.businessId,
      oauthStateHash,
      oauthStateActorId: parsed.actorId,
      oauthStateExpiresAt,
    };

    if (existing) {
      const updated = await tx.ownerConnector.update({
        where: { id: existing.id },
        data: keepStatus ? mutableFields : { ...mutableFields, status: "PENDING_AUTH" },
      });
      return updated.id as string;
    }

    try {
      const created = await tx.ownerConnector.create({
        data: {
          workspaceId: parsed.workspaceId,
          provider: QBO_PROVIDER,
          status: "PENDING_AUTH",
          registeredBy: parsed.actorId,
          ...mutableFields,
        },
      });
      return created.id as string;
    } catch (err: any) {
      // Unique(workspaceId, provider) race: another concurrent start already created the row.
      if (err?.code === "P2002") {
        const updated = await tx.ownerConnector.update({
          where: { workspaceId_provider: { workspaceId: parsed.workspaceId, provider: QBO_PROVIDER } },
          data: mutableFields,
        });
        return updated.id as string;
      }
      throw err;
    }
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.QUICKBOOKS_CONNECT_STARTED,
    workspaceId: parsed.workspaceId,
    entityType: "OwnerConnector",
    entityId: connectorId,
    payload: { businessId: parsed.businessId },
    ...toAuditActor(parsed.actorId),
  });

  return { authorizeUrl: buildQboAuthorizationUrl(configResult.config, state), connectorId };
}

// ─── completeQuickBooksConnect ──────────────────────────────────────────────

export interface CompleteQuickBooksConnectInput {
  workspaceId: string;
  actorId: string;
  code: string;
  state: string;
  realmId: string;
  env?: Record<string, string | undefined>;
  fetchImpl?: FetchImpl;
}

export interface CompleteQuickBooksConnectResult {
  connectorId: string;
  businessId: string | null;
  reconnected: boolean;
}

export async function completeQuickBooksConnect(input: CompleteQuickBooksConnectInput): Promise<CompleteQuickBooksConnectResult> {
  const parsed = parseOrValidationError(CompleteInputSchema, input);
  if (!isValidRealmId(parsed.realmId)) {
    throw new ValidationError("Invalid QuickBooks company id.");
  }

  const configResult = resolveQboConfig(input.env ?? process.env);
  if (!configResult.available) {
    throw new FeatureDisabledError("QuickBooks", OWNER_SAFE_UNAVAILABLE_REASON);
  }

  const now = new Date();
  const stateHash = createHash("sha256").update(parsed.state).digest("hex");

  // Single compare-and-set consumption of the one-time state. This alone covers replay
  // (hash already cleared), a foreign workspace (workspaceId mismatch), a foreign actor
  // (oauthStateActorId mismatch) and an expired state (oauthStateExpiresAt <= now).
  const consumed = await (db as any).ownerConnector.updateMany({
    where: {
      workspaceId: parsed.workspaceId,
      provider: QBO_PROVIDER,
      oauthStateHash: stateHash,
      oauthStateActorId: parsed.actorId,
      oauthStateExpiresAt: { gt: now },
    },
    data: { oauthStateHash: null, oauthStateActorId: null, oauthStateExpiresAt: null },
  });

  if (consumed.count !== 1) {
    await emitAuditEvent({
      eventName: AUDIT_EVENTS.QUICKBOOKS_CONNECT_FAILED,
      workspaceId: parsed.workspaceId,
      entityType: "OwnerConnector",
      payload: { reason: "STATE_INVALID_OR_EXPIRED" },
      ...toAuditActor(parsed.actorId),
    });
    throw new UnauthorizedError("AUTH_INVALID", "This QuickBooks connection link has expired or was already used. Start over.");
  }

  const connector = await (db as any).ownerConnector.findFirst({
    where: { workspaceId: parsed.workspaceId, provider: QBO_PROVIDER },
  });
  if (!connector) {
    throw new NotFoundError("OwnerConnector", "QUICKBOOKS");
  }

  let tokens;
  try {
    tokens = await exchangeQboAuthorizationCode(configResult.config, parsed.code, { fetchImpl: input.fetchImpl });
  } catch (err) {
    await emitAuditEvent({
      eventName: AUDIT_EVENTS.QUICKBOOKS_CONNECT_FAILED,
      workspaceId: parsed.workspaceId,
      entityType: "OwnerConnector",
      entityId: connector.id,
      payload: { reason: "TOKEN_EXCHANGE_FAILED" },
      ...toAuditActor(parsed.actorId),
    });
    throw err;
  }

  const realmChanged = connector.externalAccountId != null && connector.externalAccountId !== parsed.realmId;
  if (realmChanged) {
    const hasProvenance = await (db as any).ownerConnectorRecord.findFirst({
      where: { connectorId: connector.id },
      select: { id: true },
    });
    if (hasProvenance) {
      try {
        await revokeQboToken(configResult.config, tokens.refreshToken, { fetchImpl: input.fetchImpl });
      } catch {
        logger.warn(
          "Failed to revoke a QuickBooks token issued for a rejected realm-mismatch reconnect.",
          undefined,
          { connectorId: connector.id },
        );
      }
      await emitAuditEvent({
        eventName: AUDIT_EVENTS.QUICKBOOKS_CONNECT_FAILED,
        workspaceId: parsed.workspaceId,
        entityType: "OwnerConnector",
        entityId: connector.id,
        payload: { reason: "REALM_MISMATCH" },
        ...toAuditActor(parsed.actorId),
      });
      throw new ConflictError("This OpsIQ business is already linked to a different QuickBooks company; disconnect first.");
    }
  }

  const reconnected = connector.status === "ACTIVE" || connector.status === "REFRESH_FAILED";
  const sameRealm = connector.externalAccountId === parsed.realmId;
  const keepSyncState = reconnected && sameRealm && connector.syncState != null;

  await (db as any).$transaction(async (tx: any) => {
    const stored = await storeQboTokens({
      workspaceId: parsed.workspaceId,
      connectorId: connector.id,
      tokens,
      now,
      client: tx,
    });

    await tx.ownerConnector.update({
      where: { id: connector.id },
      data: {
        status: "ACTIVE",
        externalAccountId: parsed.realmId,
        environment: configResult.config.environment,
        connectedAt: now,
        syncFailureMessage: null,
        tokenExpiresAt: stored.accessTokenExpiresAt,
        syncState: keepSyncState ? undefined : (initialQboSyncState(now) as unknown as Record<string, unknown>),
      },
    });

    await emitAuditEvent(
      {
        eventName: AUDIT_EVENTS.QUICKBOOKS_CONNECTED,
        workspaceId: parsed.workspaceId,
        entityType: "OwnerConnector",
        entityId: connector.id,
        payload: {
          businessId: connector.businessId,
          environment: configResult.config.environment,
          reconnected,
          realmLast4: parsed.realmId.slice(-4),
        },
        ...toAuditActor(parsed.actorId),
      },
      tx,
    );
  });

  return { connectorId: connector.id, businessId: connector.businessId, reconnected };
}

// ─── disconnectQuickBooks ───────────────────────────────────────────────────

export interface DisconnectQuickBooksInput {
  workspaceId: string;
  actorId: string;
  env?: Record<string, string | undefined>;
  fetchImpl?: FetchImpl;
}

export interface DisconnectQuickBooksResult {
  connectorId: string;
  alreadyDisconnected: boolean;
}

export async function disconnectQuickBooks(input: DisconnectQuickBooksInput): Promise<DisconnectQuickBooksResult> {
  const parsed = parseOrValidationError(DisconnectInputSchema, input);

  const connector = await (db as any).ownerConnector.findFirst({
    where: { workspaceId: parsed.workspaceId, provider: QBO_PROVIDER },
  });
  if (!connector) {
    throw new NotFoundError("OwnerConnector", "QUICKBOOKS");
  }

  if (connector.status === "DISCONNECTED") {
    return { connectorId: connector.id, alreadyDisconnected: true };
  }

  const tokenRow = await (db as any).ownerConnectorToken.findUnique({ where: { connectorId: connector.id } });
  let revokedAtProvider = false;

  if (tokenRow?.encryptedRefreshToken) {
    const configResult = resolveQboConfig(input.env ?? process.env);
    if (configResult.available) {
      try {
        const plain = decryptOAuthToken(
          {
            accessToken: tokenRow.encryptedAccessToken,
            refreshToken: tokenRow.encryptedRefreshToken,
            tokenType: tokenRow.tokenType,
          },
          parsed.workspaceId,
        );
        if (plain.refreshToken) {
          await revokeQboToken(configResult.config, plain.refreshToken, { fetchImpl: input.fetchImpl });
          revokedAtProvider = true;
        }
      } catch {
        logger.warn(
          "QuickBooks token revoke at provider failed during disconnect; local credentials are deleted regardless.",
          undefined,
          { connectorId: connector.id },
        );
      }
    }
  }

  await (db as any).$transaction(async (tx: any) => {
    // Secret material must not survive disconnect, regardless of provider revoke outcome.
    await tx.ownerConnectorToken.deleteMany({ where: { connectorId: connector.id } });
    await tx.ownerConnector.update({
      where: { id: connector.id },
      data: {
        status: "DISCONNECTED",
        syncLeaseExpiresAt: null,
        oauthStateHash: null,
        oauthStateActorId: null,
        oauthStateExpiresAt: null,
      },
    });
    await emitAuditEvent(
      {
        eventName: AUDIT_EVENTS.QUICKBOOKS_DISCONNECTED,
        workspaceId: parsed.workspaceId,
        entityType: "OwnerConnector",
        entityId: connector.id,
        payload: { revokedAtProvider },
        ...toAuditActor(parsed.actorId),
      },
      tx,
    );
  });

  return { connectorId: connector.id, alreadyDisconnected: false };
}

// ─── getQuickBooksStatus ─────────────────────────────────────────────────────

export interface GetQuickBooksStatusInput {
  workspaceId: string;
  env?: Record<string, string | undefined>;
}

export async function getQuickBooksStatus(input: GetQuickBooksStatusInput): Promise<QuickBooksStatusDTO> {
  const parsed = parseOrValidationError(StatusInputSchema, input);

  const configResult = resolveQboConfig(input.env ?? process.env);
  if (!configResult.available) {
    return {
      available: false,
      unavailableReason: OWNER_SAFE_UNAVAILABLE_REASON,
      environment: null,
      webhooksEnabled: false,
      connector: null,
    };
  }

  const connector = await (db as any).ownerConnector.findFirst({
    where: { workspaceId: parsed.workspaceId, provider: QBO_PROVIDER },
    select: {
      id: true,
      status: true,
      businessId: true,
      externalAccountName: true,
      connectedAt: true,
      lastSyncAt: true,
      lastSyncRecords: true,
      syncFailureMessage: true,
      syncState: true,
      syncLeaseExpiresAt: true,
      // token relation and externalAccountId (realm) are intentionally never selected here.
    },
  });

  if (!connector) {
    return {
      available: true,
      unavailableReason: null,
      environment: configResult.config.environment,
      webhooksEnabled: configResult.config.webhookVerifierToken != null,
      connector: null,
    };
  }

  const now = new Date();
  const tokenRow = await (db as any).ownerConnectorToken.findUnique({
    where: { connectorId: connector.id },
    select: { refreshTokenExpiresAt: true },
  });
  const refreshExpired = tokenRow?.refreshTokenExpiresAt != null && tokenRow.refreshTokenExpiresAt.getTime() < now.getTime();

  // Server-decided owner actions (QuickBooksStatusDTO.connector.allowedActions). The UI renders
  // controls ONLY from these flags — it never derives lifecycle decisions from `status` itself.
  const allowedActions = {
    sync: connector.status === "ACTIVE" && !refreshExpired,
    disconnect: connector.status !== "DISCONNECTED",
    reconnect: connector.status === "REFRESH_FAILED" || connector.status === "EXPIRED" || connector.status === "DISCONNECTED" || refreshExpired,
  };
  const needsReconnect = allowedActions.reconnect;

  const syncState = parseQboSyncState(connector.syncState);
  const running = connector.syncLeaseExpiresAt != null && connector.syncLeaseExpiresAt.getTime() > now.getTime();

  let freshness: QboFreshness = "NEVER_SYNCED";
  if (connector.lastSyncAt) {
    const hoursSince = (now.getTime() - connector.lastSyncAt.getTime()) / (1000 * 60 * 60);
    freshness = hoursSince > QBO_STALE_AFTER_HOURS ? "STALE" : "FRESH";
  }

  const initialProgress = syncState
    ? { completedEntities: syncState.initial.entityIndex, totalEntities: QBO_SYNC_ENTITY_ORDER.length }
    : null;

  return {
    available: true,
    unavailableReason: null,
    environment: configResult.config.environment,
    webhooksEnabled: configResult.config.webhookVerifierToken != null,
    connector: {
      id: connector.id,
      status: connector.status,
      businessId: connector.businessId,
      companyName: connector.externalAccountName,
      connectedAt: connector.connectedAt.toISOString(),
      lastSyncAt: connector.lastSyncAt ? connector.lastSyncAt.toISOString() : null,
      lastSyncRecords: connector.lastSyncRecords,
      syncFailureMessage: connector.syncFailureMessage,
      needsReconnect,
      allowedActions,
      refreshTokenExpiresAt: tokenRow?.refreshTokenExpiresAt ? tokenRow.refreshTokenExpiresAt.toISOString() : null,
      sync: {
        phase: syncState?.phase ?? null,
        running,
        lastRunStatus: syncState?.lastRunStatus ?? null,
        lastRunAt: syncState?.lastRunAt ?? null,
        lastRunSummary: syncState?.lastRunSummary ?? null,
        initialProgress,
        freshness,
      },
    },
  };
}
