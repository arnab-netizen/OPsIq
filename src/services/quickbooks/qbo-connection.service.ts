/**
 * QuickBooks Online — business-scoped connection, one-time OAuth state and encrypted token persistence.
 *
 * Service layer only: no routes, no sync, no evidence, no QBO API calls. Callers (a later PR) own the HTTP surface,
 * the capability check and the Intuit code exchange; this module owns the durable, tenant-safe state.
 *
 * Flow:   beginQboAuthorization -> (browser at Intuit) -> consumeQboAuthorizationState -> exchange code (caller)
 *         -> finalizeQboConnection.
 *
 * Guarantees
 *  - The clear-text OAuth state is never stored; only its SHA-256 (qbo_oauth_states.state_hash, format-checked by the DB).
 *  - Consumption is ONE conditional UPDATE (state hash + workspace + actor + environment + not consumed + not expired):
 *    two concurrent callbacks cannot both win, and there is no find-then-update window.
 *  - Workspace / business / actor / environment are recovered from the consumed state row. The realm id from Intuit's
 *    callback is untrusted: it is format-validated and bound here, never used to pick a tenant.
 *  - finalize runs in ONE transaction: realm + business advisory locks, state re-verification, tenancy re-check, realm
 *    uniqueness, connection upsert, encrypted token upsert, state finalization, audit. Any failure rolls all of it back,
 *    so a connection is never ACTIVE without a bound realm and persisted tokens.
 *  - Tokens are encrypted with the shared encryptOAuthToken() (AES-256-GCM, workspace-bound HKDF key) BEFORE any write.
 *    Plaintext never reaches a row, audit payload, log line or error message from this module.
 *  - Token rotation is a compare-and-set on `revision`; a stale writer gets a typed refusal and writes nothing.
 *  - Rows are never deleted except the token row on disconnect (secret hygiene); the connection row is kept as history.
 */
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError, ValidationError } from "@/infra/errors";
import { isValidRealmId, type QboEnvironment, type QboProviderConfig } from "@/domain/quickbooks/qbo-config";
import {
  QBO_CONNECTION_STATUS,
  QBO_GRANTED_SCOPE,
  QboBeginAuthorizationSchema,
  QboConsumeStateSchema,
  QboDisconnectSchema,
  QboReauthSchema,
  QboRotateSchema,
  QboConnectionRefSchema,
  type ConsumedQboAuthorization,
  type QboConnectionStatus,
  type QboConnectionSummary,
  type QboFinalizeFailure,
  type QboStateConsumeFailure,
  type QboTokenWriteFailure,
} from "@/domain/quickbooks/qbo-connection-model";
import { assertBusinessInWorkspace, BusinessScopeError } from "@/services/owner-mode/business-scope";
import { decryptOAuthToken, encryptOAuthToken } from "@/services/external-systems/oauth-token.service";
import {
  createQboAuthorizationRequest,
  hashQboOAuthState,
  toOAuthToken,
  type QboTokenGrant,
} from "./qbo-oauth.service";

type Tx = Prisma.TransactionClient;
export type QboPersistenceClient = typeof db;

export interface QboPersistenceDeps {
  client?: QboPersistenceClient;
  now?: () => Date;
}

const STATE_SHAPE = /^[A-Za-z0-9_-]{32,256}$/;
const LIVE = { not: QBO_CONNECTION_STATUS.DISCONNECTED } as const;

function parse<T>(schema: { safeParse(v: unknown): { success: true; data: T } | { success: false; error: { issues: Array<{ path: PropertyKey[]; message: string }> } } }, input: unknown): T {
  const r = schema.safeParse(input);
  if (!r.success) {
    throw new ValidationError("Invalid QuickBooks connection request.", {
      fieldErrors: r.error.issues.map((i) => ({ path: i.path.map(String).join("."), message: i.message })),
    });
  }
  return r.data;
}

/** Real, active, non-fixture business inside the workspace; a foreign or missing id is a uniform NotFound. */
async function requireEligibleBusiness(client: Pick<Tx, "ownerBusiness">, workspaceId: string, businessId: string): Promise<void> {
  try {
    await assertBusinessInWorkspace(client as never, workspaceId, businessId);
  } catch (e) {
    if (e instanceof BusinessScopeError) throw new NotFoundError("OwnerBusiness", businessId);
    throw e;
  }
  const b = (await client.ownerBusiness.findFirst({
    where: { id: businessId, workspaceId },
    select: { isActive: true, isFixtureBusiness: true },
  })) as { isActive: boolean; isFixtureBusiness: boolean } | null;
  if (!b) throw new NotFoundError("OwnerBusiness", businessId);
  if (!b.isActive) {
    throw new ValidationError("QuickBooks can't be connected to an archived business.", {
      fieldErrors: [{ path: "businessId", message: "Business is archived" }],
    });
  }
  if (b.isFixtureBusiness) {
    throw new ValidationError("QuickBooks can't be connected to a test business.", {
      fieldErrors: [{ path: "businessId", message: "Test businesses can't be connected" }],
    });
  }
}

function summarize(r: {
  id: string; workspaceId: string; businessId: string; environment: string; realmId: string; status: string;
  connectedAt: Date; reauthRequiredAt: Date | null; disconnectedAt: Date | null; version: number;
}): QboConnectionSummary {
  return {
    id: r.id, workspaceId: r.workspaceId, businessId: r.businessId, environment: r.environment as QboEnvironment,
    realmId: r.realmId, status: r.status as QboConnectionStatus, connectedAt: r.connectedAt,
    reauthRequiredAt: r.reauthRequiredAt, disconnectedAt: r.disconnectedAt, version: r.version,
  };
}

const realmLockKey = (env: string, realm: string) => `qbo_realm:${env}:${realm}`;
const businessLockKey = (ws: string, biz: string, env: string) => `qbo_business:${ws}:${biz}:${env}`;
async function advisoryLock(tx: Pick<Tx, "$executeRaw">, key: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}

function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: unknown }).code === "P2002";
}

/** Thrown inside a transaction to roll it back with a typed, non-secret reason. */
/**
 * The grant was NOT stored because it could not be encrypted (missing / short key). Raised before the transaction opens, so nothing
 * was written: the caller may safely discard the grant it just obtained.
 */
export class QboGrantNotStoredError extends Error {
  constructor(message = "QUICKBOOKS_GRANT_NOT_STORED") {
    super(message); // the encryption layer's own (secret-free) configuration message is preserved
    this.name = "QboGrantNotStoredError";
  }
}

/**
 * Fail-closed pre-flight: can this workspace's tokens be encrypted at all? The callback calls it BEFORE the authorization code is
 * exchanged, so a missing / short OAUTH_TOKEN_ENCRYPTION_KEY stops the flow before Intuit issues a long-lived refresh token that
 * could not be stored. Throws QboGrantNotStoredError; encrypts a throw-away value and persists nothing.
 */
export function assertQboTokenEncryptionReady(workspaceId: string): void {
  try {
    encryptOAuthToken({ accessToken: "preflight", refreshToken: "preflight", expiresAt: new Date(0), tokenType: "Bearer" } as never, workspaceId);
  } catch (e) {
    throw new QboGrantNotStoredError(e instanceof Error ? e.message : undefined);
  }
}

/**
 * Does a not-disconnected connection (any workspace) hold this company in this environment? Used before a best-effort revoke: an
 * Intuit revocation may be app/company-wide, so a grant is never revoked while a live connection may depend on the same company.
 */
export async function isQboRealmHeldLive(input: { environment: QboEnvironment; realmId: string }, deps: QboPersistenceDeps = {}): Promise<boolean> {
  const client = deps.client ?? db;
  const row = await client.qboConnection.findFirst({ where: { environment: input.environment, realmId: input.realmId, status: LIVE }, select: { id: true } });
  return row !== null;
}

class FinalizeRefusal extends Error {
  constructor(readonly reason: QboFinalizeFailure) {
    super(reason);
    this.name = "FinalizeRefusal";
  }
}

// ─── 1. Begin ────────────────────────────────────────────────────────────────

export interface BeginQboAuthorizationResult {
  authorizationId: string;
  /** Send the browser here. Contains the clear-text state, which is NOT persisted. */
  authorizationUrl: string;
  stateExpiresAt: Date;
}

export async function beginQboAuthorization(
  input: { workspaceId: string; actorId: string; businessId: string; environment: QboEnvironment },
  config: QboProviderConfig,
  deps: QboPersistenceDeps = {},
): Promise<BeginQboAuthorizationResult> {
  const v = parse(QboBeginAuthorizationSchema, input);
  if (config.environment !== v.environment) {
    throw new ValidationError("The requested QuickBooks environment does not match the configured environment.", {
      fieldErrors: [{ path: "environment", message: "Environment mismatch" }],
    });
  }
  const client = deps.client ?? db;
  const now = deps.now ?? (() => new Date());
  await requireEligibleBusiness(client, v.workspaceId, v.businessId);

  const req = createQboAuthorizationRequest(config, { now });
  const createdAt = now();
  const authorizationId = randomUUID();
  await client.$transaction(async (tx: Tx) => {
    await tx.qboOAuthState.create({
      data: {
        id: authorizationId, workspaceId: v.workspaceId, businessId: v.businessId, initiatedById: v.actorId,
        environment: v.environment, scope: QBO_GRANTED_SCOPE, stateHash: req.stateHash, createdAt, expiresAt: req.stateExpiresAt,
      },
    });
    await emitAuditEvent(
      {
        eventName: AUDIT_EVENTS.QBO_AUTHORIZATION_STARTED, workspaceId: v.workspaceId, actorId: v.actorId,
        entityType: "qbo_oauth_state", entityId: authorizationId, visibility: "internal",
        payload: { businessId: v.businessId, environment: v.environment, expiresAt: req.stateExpiresAt.toISOString() },
      },
      tx,
    );
  });
  return { authorizationId, authorizationUrl: req.authorizationUrl, stateExpiresAt: req.stateExpiresAt };
}

// ─── 2. Consume ──────────────────────────────────────────────────────────────

export type ConsumeQboStateResult =
  | { ok: true; authorization: ConsumedQboAuthorization }
  | { ok: false; reason: QboStateConsumeFailure };

/**
 * Atomically consume a callback `state`. Every binding is part of the single conditional UPDATE; on a miss the row is
 * re-read ONLY to choose a typed reason, and a state belonging to another workspace is reported exactly like an unknown one.
 */
export async function consumeQboAuthorizationState(
  input: { workspaceId: string; actorId: string; environment: QboEnvironment; state: string },
  deps: QboPersistenceDeps = {},
): Promise<ConsumeQboStateResult> {
  const v = parse(QboConsumeStateSchema, input);
  if (!STATE_SHAPE.test(v.state)) return { ok: false, reason: "INVALID_STATE" };
  const client = deps.client ?? db;
  const now = (deps.now ?? (() => new Date()))();
  const stateHash = hashQboOAuthState(v.state);

  const won = await client.qboOAuthState.updateMany({
    where: {
      stateHash, workspaceId: v.workspaceId, initiatedById: v.actorId, environment: v.environment,
      consumedAt: null, expiresAt: { gt: now },
    },
    data: { consumedAt: now },
  });

  if (won.count === 1) {
    const row = await client.qboOAuthState.findUnique({ where: { stateHash } });
    if (!row || row.workspaceId !== v.workspaceId) return { ok: false, reason: "INVALID_STATE" };
    return {
      ok: true,
      authorization: {
        authorizationId: row.id, workspaceId: row.workspaceId, businessId: row.businessId,
        actorId: row.initiatedById, environment: row.environment as QboEnvironment,
      },
    };
  }

  const row = await client.qboOAuthState.findUnique({ where: { stateHash } });
  if (!row || row.workspaceId !== v.workspaceId) return { ok: false, reason: "INVALID_STATE" };
  if (row.consumedAt) return { ok: false, reason: "ALREADY_CONSUMED" };
  if (row.expiresAt.getTime() <= now.getTime()) return { ok: false, reason: "EXPIRED" };
  return { ok: false, reason: "CONTEXT_MISMATCH" };
}

// ─── 3. Finalize ─────────────────────────────────────────────────────────────

export type FinalizeQboConnectionResult =
  | { ok: true; connection: QboConnectionSummary; reconnected: boolean; tokenRevision: number }
  | { ok: false; reason: QboFinalizeFailure };

export async function finalizeQboConnection(
  input: { authorization: ConsumedQboAuthorization; realmId: string; grant: QboTokenGrant },
  deps: QboPersistenceDeps = {},
): Promise<FinalizeQboConnectionResult> {
  const { authorization: a, realmId, grant } = input;
  if (!isValidRealmId(realmId)) {
    throw new ValidationError("The QuickBooks company id is not valid.", {
      fieldErrors: [{ path: "realmId", message: "Invalid company id" }],
    });
  }
  const client = deps.client ?? db;
  const now = (deps.now ?? (() => new Date()))();
  // Encrypt first: a missing/short key fails closed here, before anything is written.
  let enc: ReturnType<typeof encryptOAuthToken>;
  try {
    enc = encryptOAuthToken(toOAuthToken(grant), a.workspaceId);
  } catch (e) {
    throw new QboGrantNotStoredError(e instanceof Error ? e.message : undefined);
  }
  if (!enc.refreshToken) throw new ValidationError("The QuickBooks grant has no refresh token.");

  try {
    return await client.$transaction(async (tx: Tx) => {
      await advisoryLock(tx, realmLockKey(a.environment, realmId));
      await advisoryLock(tx, businessLockKey(a.workspaceId, a.businessId, a.environment));

      const state = await tx.qboOAuthState.findFirst({ where: { id: a.authorizationId, workspaceId: a.workspaceId } });
      if (
        !state || !state.consumedAt || state.businessId !== a.businessId || state.initiatedById !== a.actorId ||
        state.environment !== a.environment
      ) {
        throw new FinalizeRefusal("AUTHORIZATION_NOT_CONSUMED");
      }
      if (state.finalizedAt) throw new FinalizeRefusal("AUTHORIZATION_ALREADY_FINALIZED");

      // Holder / binding refusals come BEFORE the eligibility check: a typed refusal about a company another connection holds must
      // never be pre-empted by an eligibility error, because the caller treats those two outcomes differently when deciding
      // whether the just-issued grant may be discarded.
      const holder = await tx.qboConnection.findFirst({ where: { environment: a.environment, realmId, status: LIVE } });
      if (holder && (holder.workspaceId !== a.workspaceId || holder.businessId !== a.businessId)) {
        throw new FinalizeRefusal("REALM_ALREADY_BOUND");
      }
      const businessLive = await tx.qboConnection.findFirst({
        where: { workspaceId: a.workspaceId, businessId: a.businessId, environment: a.environment, status: LIVE },
      });
      if (businessLive && businessLive.realmId !== realmId) throw new FinalizeRefusal("BUSINESS_BOUND_TO_OTHER_REALM");
      await requireEligibleBusiness(tx, a.workspaceId, a.businessId); // still before any write

      const existing = await tx.qboConnection.findFirst({
        where: { workspaceId: a.workspaceId, businessId: a.businessId, environment: a.environment, realmId },
      });
      const reconnected = existing !== null;
      const connection = existing
        ? await tx.qboConnection.update({
            where: { id: existing.id },
            data: {
              status: QBO_CONNECTION_STATUS.ACTIVE, connectedById: a.actorId, connectedAt: now, reauthRequiredAt: null,
              lastErrorCode: null, disconnectedAt: null, disconnectedById: null, version: { increment: 1 },
            },
          })
        : await tx.qboConnection.create({
            data: {
              id: randomUUID(), workspaceId: a.workspaceId, businessId: a.businessId, environment: a.environment, realmId,
              status: QBO_CONNECTION_STATUS.ACTIVE, connectedById: a.actorId, connectedAt: now,
            },
          });

      const tokenData = {
        accessTokenCiphertext: enc.accessToken, refreshTokenCiphertext: enc.refreshToken as string, tokenType: enc.tokenType,
        accessTokenExpiresAt: grant.accessTokenExpiresAt, refreshTokenExpiresAt: grant.refreshTokenExpiresAt,
        refreshTokenHardExpiresAt: grant.refreshTokenHardExpiresAt, grantedScope: state.scope, intuitTid: grant.intuitTid,
      };
      const prior = await tx.qboConnectionToken.findFirst({ where: { connectionId: connection.id, workspaceId: a.workspaceId } });
      const token = prior
        ? await tx.qboConnectionToken.update({
            where: { connectionId: connection.id },
            data: { ...tokenData, revision: { increment: 1 }, rotatedAt: now },
          })
        : await tx.qboConnectionToken.create({ data: { connectionId: connection.id, workspaceId: a.workspaceId, ...tokenData } });

      const fin = await tx.qboOAuthState.updateMany({
        where: { id: a.authorizationId, workspaceId: a.workspaceId, finalizedAt: null },
        data: { finalizedAt: now },
      });
      if (fin.count !== 1) throw new FinalizeRefusal("AUTHORIZATION_ALREADY_FINALIZED");

      await emitAuditEvent(
        {
          eventName: AUDIT_EVENTS.QBO_AUTHORIZATION_COMPLETED, workspaceId: a.workspaceId, actorId: a.actorId,
          entityType: "qbo_connection", entityId: connection.id, visibility: "internal",
          payload: { businessId: a.businessId, environment: a.environment, realmId, reconnected, authorizationId: a.authorizationId, tokenRevision: token.revision },
        },
        tx,
      );
      return { ok: true as const, connection: summarize(connection), reconnected, tokenRevision: token.revision };
    });
  } catch (e) {
    const reason: QboFinalizeFailure | null =
      e instanceof FinalizeRefusal ? e.reason : isUniqueViolation(e) ? "REALM_ALREADY_BOUND" : null;
    if (!reason) throw e;
    if (reason === "REALM_ALREADY_BOUND" || reason === "BUSINESS_BOUND_TO_OTHER_REALM") {
      // Reported to the REQUESTING workspace only; never names the other tenant or business. A failure to WRITE this audit row must not
      // turn the typed refusal (already decided, nothing stored) into an exception: the caller's revoke / no-revoke decision depends on
      // receiving the refusal reason.
      try {
        await emitAuditEvent({
          eventName: AUDIT_EVENTS.QBO_REALM_BINDING_CONFLICT, workspaceId: a.workspaceId, actorId: a.actorId,
          entityType: "qbo_oauth_state", entityId: a.authorizationId, visibility: "internal",
          payload: { businessId: a.businessId, environment: a.environment, realmId, reason },
        }, client);
      } catch {
        // Refusal outcome is authoritative; the audit store being unavailable is reported by its own health signals.
      }
    }
    return { ok: false, reason };
  }
}

// ─── 4. Tokens ───────────────────────────────────────────────────────────────

export type RotateQboTokensResult =
  | { ok: true; revision: number }
  | { ok: false; reason: QboTokenWriteFailure };

/** Persist a refreshed grant iff the stored token is still at `expectedRevision`. A stale writer writes nothing. */
export async function rotateQboTokens(
  input: { workspaceId: string; connectionId: string; expectedRevision: number; grant: QboTokenGrant },
  deps: QboPersistenceDeps = {},
): Promise<RotateQboTokensResult> {
  const v = parse(QboRotateSchema, input);
  const client = deps.client ?? db;
  const now = (deps.now ?? (() => new Date()))();
  const enc = encryptOAuthToken(toOAuthToken(input.grant), v.workspaceId);
  if (!enc.refreshToken) throw new ValidationError("The QuickBooks grant has no refresh token.");
  const g = input.grant;

  return client.$transaction(async (tx: Tx) => {
    const won = await tx.qboConnectionToken.updateMany({
      where: {
        connectionId: v.connectionId, workspaceId: v.workspaceId, revision: v.expectedRevision,
        connection: { status: QBO_CONNECTION_STATUS.ACTIVE },
      },
      data: {
        accessTokenCiphertext: enc.accessToken, refreshTokenCiphertext: enc.refreshToken as string, tokenType: enc.tokenType,
        accessTokenExpiresAt: g.accessTokenExpiresAt, refreshTokenExpiresAt: g.refreshTokenExpiresAt,
        refreshTokenHardExpiresAt: g.refreshTokenHardExpiresAt, intuitTid: g.intuitTid,
        revision: { increment: 1 }, rotatedAt: now,
      },
    });
    if (won.count !== 1) {
      const row = await tx.qboConnectionToken.findFirst({
        where: { connectionId: v.connectionId, workspaceId: v.workspaceId },
        select: { connection: { select: { status: true } } },
      });
      const active = row?.connection.status === QBO_CONNECTION_STATUS.ACTIVE;
      return { ok: false as const, reason: active ? ("STALE_REVISION" as const) : ("CONNECTION_NOT_ACTIVE" as const) };
    }
    const revision = v.expectedRevision + 1;
    await emitAuditEvent(
      {
        eventName: AUDIT_EVENTS.QBO_TOKENS_ROTATED, workspaceId: v.workspaceId, actorType: "system",
        entityType: "qbo_connection", entityId: v.connectionId, visibility: "internal", payload: { revision },
      },
      tx,
    );
    return { ok: true as const, revision };
  });
}

export interface QboTokensForUse {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  accessTokenExpiresAt: Date;
  refreshTokenExpiresAt: Date;
  refreshTokenHardExpiresAt: Date | null;
  revision: number;
  realmId: string;
  environment: QboEnvironment;
}

/**
 * SERVER-SIDE ONLY. Returns decrypted tokens for an ACTIVE connection of this workspace. Never expose the result to a
 * client or log it. A foreign workspace's connection id resolves to NOT_FOUND; a ciphertext that does not verify under
 * this workspace's key throws a generic error that contains no token material.
 */
export async function loadQboTokensForUse(
  input: { workspaceId: string; connectionId: string },
  deps: QboPersistenceDeps = {},
): Promise<{ ok: true; tokens: QboTokensForUse } | { ok: false; reason: "NOT_FOUND" | "NOT_ACTIVE" }> {
  const v = parse(QboConnectionRefSchema, input);
  const client = deps.client ?? db;
  const row = await client.qboConnectionToken.findFirst({
    where: { connectionId: v.connectionId, workspaceId: v.workspaceId },
    include: { connection: true },
  });
  if (!row) return { ok: false, reason: "NOT_FOUND" };
  if (row.connection.status !== QBO_CONNECTION_STATUS.ACTIVE) return { ok: false, reason: "NOT_ACTIVE" };
  let plain;
  try {
    plain = decryptOAuthToken(
      { accessToken: row.accessTokenCiphertext, refreshToken: row.refreshTokenCiphertext, tokenType: row.tokenType },
      v.workspaceId,
    );
  } catch {
    throw new Error("QuickBooks token could not be decrypted for this workspace.");
  }
  return {
    ok: true,
    tokens: {
      accessToken: plain.accessToken, refreshToken: plain.refreshToken as string, tokenType: row.tokenType,
      accessTokenExpiresAt: row.accessTokenExpiresAt, refreshTokenExpiresAt: row.refreshTokenExpiresAt,
      refreshTokenHardExpiresAt: row.refreshTokenHardExpiresAt, revision: row.revision,
      realmId: row.connection.realmId, environment: row.connection.environment as QboEnvironment,
    },
  };
}

// ─── 5. Lifecycle ────────────────────────────────────────────────────────────

/** ACTIVE -> REAUTH_REQUIRED (idempotent: any other state is left untouched and reported as unchanged). */
export async function markQboReauthorizationRequired(
  input: { workspaceId: string; connectionId: string; reasonCode: string; expectedTokenRevision?: number },
  deps: QboPersistenceDeps = {},
): Promise<{ changed: boolean }> {
  const v = parse(QboReauthSchema, input);
  const client = deps.client ?? db;
  const now = (deps.now ?? (() => new Date()))();
  return client.$transaction(async (tx: Tx) => {
    const r = await tx.qboConnection.updateMany({
      where: {
        id: v.connectionId, workspaceId: v.workspaceId, status: QBO_CONNECTION_STATUS.ACTIVE,
        ...(v.expectedTokenRevision !== undefined ? { token: { is: { revision: v.expectedTokenRevision } } } : {}),
      },
      data: { status: QBO_CONNECTION_STATUS.REAUTH_REQUIRED, reauthRequiredAt: now, lastErrorCode: v.reasonCode, version: { increment: 1 } },
    });
    if (r.count !== 1) return { changed: false };
    await emitAuditEvent(
      {
        eventName: AUDIT_EVENTS.QBO_REAUTHORIZATION_REQUIRED, workspaceId: v.workspaceId, actorType: "system",
        entityType: "qbo_connection", entityId: v.connectionId, visibility: "internal", payload: { reasonCode: v.reasonCode },
      },
      tx,
    );
    return { changed: true };
  });
}

/**
 * Local disconnect: the connection becomes DISCONNECTED (row kept as history) and its token row is removed — the only
 * deletion this module performs, justified because ciphertext of a revoked grant has no further use. Revoking the grant at
 * Intuit (revokeQboToken) is the caller's step. Idempotent; a connection of another workspace is a uniform NotFound.
 */
export async function disconnectQboConnection(
  input: { workspaceId: string; actorId: string; connectionId: string },
  deps: QboPersistenceDeps = {},
): Promise<{ changed: boolean }> {
  const v = parse(QboDisconnectSchema, input);
  const client = deps.client ?? db;
  const now = (deps.now ?? (() => new Date()))();
  return client.$transaction(async (tx: Tx) => {
    const r = await tx.qboConnection.updateMany({
      where: { id: v.connectionId, workspaceId: v.workspaceId, status: LIVE },
      data: { status: QBO_CONNECTION_STATUS.DISCONNECTED, disconnectedAt: now, disconnectedById: v.actorId, version: { increment: 1 } },
    });
    if (r.count !== 1) {
      const exists = await tx.qboConnection.findFirst({ where: { id: v.connectionId, workspaceId: v.workspaceId }, select: { id: true } });
      if (!exists) throw new NotFoundError("QboConnection", v.connectionId);
      return { changed: false };
    }
    await tx.qboConnectionToken.deleteMany({ where: { connectionId: v.connectionId, workspaceId: v.workspaceId } });
    await emitAuditEvent(
      {
        eventName: AUDIT_EVENTS.QBO_CONNECTION_DISCONNECTED, workspaceId: v.workspaceId, actorId: v.actorId,
        entityType: "qbo_connection", entityId: v.connectionId, visibility: "internal", payload: {},
      },
      tx,
    );
    return { changed: true };
  });
}

/** Token-free connection summaries for one business of the workspace (foreign business -> uniform NotFound). */
export async function listQboConnectionsForBusiness(
  input: { workspaceId: string; businessId: string },
  deps: QboPersistenceDeps = {},
): Promise<QboConnectionSummary[]> {
  const client = deps.client ?? db;
  await requireEligibleBusiness(client, input.workspaceId, input.businessId);
  const rows = await client.qboConnection.findMany({
    where: { workspaceId: input.workspaceId, businessId: input.businessId },
    orderBy: { connectedAt: "desc" },
  });
  return rows.map(summarize);
}
