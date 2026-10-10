/**
 * QuickBooks Online — connect + OAuth callback orchestration.
 *
 * Wires the released provider foundation (qbo-oauth.service) to the released persistence layer
 * (qbo-connection.service). It adds NO OAuth implementation, NO persistence and NO schema of its own.
 *
 * Authority (callers pass only what the canonical route verified server-side):
 *   workspaceId, actorId  — from the authenticated session, never from a request body or query string;
 *   environment           — from resolved server-side QuickBooks configuration, never from the callback;
 *   businessId            — recovered from the consumed one-time authorization record, never from the callback;
 *   realmId               — provider identity only; format-validated, never tenant authority.
 *
 * Callback order (security-critical): configuration -> query shape -> ATOMIC state consume (workspace + actor +
 * environment bound) -> code/realm validation -> code exchange -> finalize (one transaction). The authorization code
 * is never sent to Intuit unless this request won the state consume, so replayed or concurrent callbacks cannot
 * reach the token endpoint twice.
 *
 * Nothing here logs. No code, state, token, secret, provider body or tenant identifier of another tenant is placed
 * in a result, audit payload or thrown error; failures are closed codes (see qbo-connect-outcomes).
 */
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { AppError } from "@/infra/errors";
import { isValidRealmId, resolveQboConfig, type QboEnvironment } from "@/domain/quickbooks/qbo-config";
import { isQboProviderError } from "@/domain/quickbooks/qbo-errors";
import {
  classifyProviderDenial,
  QBO_CALLBACK_SUCCESS_NEXT_PATH,
  type QboConnectFailureCode,
} from "@/domain/quickbooks/qbo-connect-outcomes";
import {
  beginQboAuthorization,
  consumeQboAuthorizationState,
  finalizeQboConnection,
  assertQboTokenEncryptionReady,
  isQboRealmHeldLive,
  QboGrantNotStoredError,
  type QboPersistenceDeps,
} from "./qbo-connection.service";
import { exchangeQboAuthorizationCode, revokeQboToken } from "./qbo-oauth.service";
import { createQboReadClient } from "./qbo-client";
import { normalizeCompanyInfo } from "@/domain/quickbooks/qbo-normalize";
import type { QboFetch } from "./qbo-http";

export interface QboFlowDeps extends QboPersistenceDeps {
  /** Environment record (the route passes process.env). This module never reads process.env itself. */
  env: Record<string, string | undefined>;
  /** Test seam for the Intuit token call. */
  fetchImpl?: QboFetch;
}

/** Same shape rule the persistence layer enforces; checked here so garbage never reaches the database. */
const STATE_SHAPE = /^[A-Za-z0-9_-]{32,256}$/;
/** Authorization codes are opaque; bound only their size and character set (mirrors the provider module). */
const CODE_SHAPE = /^[\x21-\x7e]{1,2048}$/;

// ─── Connect ─────────────────────────────────────────────────────────────────

export type StartConnectResult =
  | { ok: true; authorizationUrl: string; stateExpiresAt: Date }
  | { ok: false; code: "CONFIGURATION_UNAVAILABLE" };

/**
 * Create the one-time authorization intent and the Intuit authorization URL.
 * Business eligibility (workspace scope, active, non-fixture) and the environment match are enforced by
 * beginQboAuthorization, which throws the owner-safe domain errors the canonical wrapper already maps.
 */
export async function startQboConnect(
  input: { workspaceId: string; actorId: string; businessId: string; environment: QboEnvironment },
  deps: QboFlowDeps,
): Promise<StartConnectResult> {
  const resolved = resolveQboConfig(deps.env);
  if (!resolved.available) return { ok: false, code: "CONFIGURATION_UNAVAILABLE" };
  const begun = await beginQboAuthorization(input, resolved.config, deps);
  return { ok: true, authorizationUrl: begun.authorizationUrl, stateExpiresAt: begun.stateExpiresAt };
}

// ─── Callback ────────────────────────────────────────────────────────────────

class QboRealmNotProven extends Error {}

export type CallbackResult =
  | { ok: true; businessId: string; environment: QboEnvironment; reconnected: boolean; next: typeof QBO_CALLBACK_SUCCESS_NEXT_PATH }
  | { ok: false; code: QboConnectFailureCode };

function single(params: URLSearchParams, name: string): string | null {
  const all = params.getAll(name);
  return all.length === 1 ? all[0] : null; // a repeated parameter is ambiguous: treated as absent
}

export async function completeQboCallback(
  input: { workspaceId: string; actorId: string; query: URLSearchParams },
  deps: QboFlowDeps,
): Promise<CallbackResult> {
  const resolved = resolveQboConfig(deps.env);
  if (!resolved.available) return { ok: false, code: "CONFIGURATION_UNAVAILABLE" };
  const config = resolved.config;
  const { workspaceId, actorId, query } = input;

  const state = single(query, "state");
  if (state === null || !STATE_SHAPE.test(state)) return { ok: false, code: "INVALID_STATE" };
  const providerError = single(query, "error");
  const code = single(query, "code");
  const realmId = single(query, "realmId");

  // Query-shape gate for a success callback (no side effects yet). A denial carries no code.
  if (providerError === null) {
    if (code === null || !CODE_SHAPE.test(code)) return { ok: false, code: "MALFORMED_CALLBACK" };
    if (realmId === null || !isValidRealmId(realmId)) return { ok: false, code: "INVALID_REALM" };
  }

  // Atomic consume. Workspace + actor come from the session, environment from configuration — nothing from the query.
  const consumed = await consumeQboAuthorizationState(
    { workspaceId, actorId, environment: config.environment, state },
    deps,
  );
  if (!consumed.ok) return { ok: false, code: consumed.reason };
  const authorization = consumed.authorization;

  const audit = (eventName: (typeof AUDIT_EVENTS)[keyof typeof AUDIT_EVENTS], payload: Record<string, unknown>) =>
    emitAuditEvent({
      eventName, workspaceId, actorId, entityType: "qbo_oauth_state", entityId: authorization.authorizationId,
      visibility: "internal", payload: { businessId: authorization.businessId, environment: authorization.environment, ...payload },
    });

  // Provider returned an OAuth error: the state is now burned, no code is exchanged, nothing is connected.
  if (providerError !== null) {
    const denial = classifyProviderDenial(providerError);
    await audit(AUDIT_EVENTS.QBO_AUTHORIZATION_DENIED, { providerError: denial });
    return { ok: false, code: denial === "access_denied" ? "USER_DENIED" : "PROVIDER_DENIED" };
  }

  // Both are non-null and shape-valid here (checked above, before any side effect).
  const authorizationCode = code as string;
  const verifiedRealm = realmId as string;

  // Fail closed BEFORE Intuit issues a long-lived refresh token that this deployment could not store (missing / short encryption key).
  try {
    assertQboTokenEncryptionReady(workspaceId);
  } catch (e) {
    if (!(e instanceof QboGrantNotStoredError)) throw e;
    await audit(AUDIT_EVENTS.QBO_AUTHORIZATION_FAILED, { stage: "PREFLIGHT", reason: "TOKEN_STORAGE_UNAVAILABLE" });
    return { ok: false, code: "CONFIGURATION_UNAVAILABLE" };
  }

  let grant;
  try {
    grant = await exchangeQboAuthorizationCode(config, authorizationCode, { fetchImpl: deps.fetchImpl, now: deps.now });
  } catch (e) {
    const failure = classifyExchangeFailure(e);
    await audit(AUDIT_EVENTS.QBO_AUTHORIZATION_FAILED, { stage: "TOKEN_EXCHANGE", reason: failure });
    return { ok: false, code: failure };
  }

  /**
   * A grant OpsIQ will not keep should not stay live at Intuit, but an Intuit revocation may be app/company-wide: it is attempted ONLY when
   * no not-disconnected connection holds the verified company. If that cannot be established (the lookup fails) the grant is NOT
   * revoked - leaving an unrecorded token is the lesser harm than killing a working connection (an operator revokes it at Intuit;
   * see QBO_CONNECTION_PERSISTENCE.md, "Grant revocation"). Revocation errors are swallowed; nothing is logged.
   */
  const discardGrant = async (): Promise<void> => {
    try {
      if (await isQboRealmHeldLive({ environment: authorization.environment, realmId: verifiedRealm }, deps)) return;
      await revokeQboToken(config, grant.refreshToken, { fetchImpl: deps.fetchImpl });
    } catch {
      // best effort only
    }
  };

  // The realm in the callback URL is client-relayed: bind it only if the NEW token can actually read that company and the company
  // reports that same id. One read-only GET (companyinfo) with the just-issued token; nothing is persisted from it.
  try {
    const probe = createQboReadClient({
      config, realmId: verifiedRealm, getAccessToken: async () => grant.accessToken,
      fetchImpl: deps.fetchImpl, maxRetries: 1, timeoutMs: 15_000,
    });
    const company = normalizeCompanyInfo(await probe.companyInfo(), verifiedRealm);
    if (!company.ok || company.record.normalized.reportedRealmId !== verifiedRealm) throw new QboRealmNotProven();
  } catch (e) {
    const transient = isQboProviderError(e) && (e.kind === "TIMEOUT" || e.kind === "TRANSIENT_PROVIDER_FAILURE" || e.kind === "RATE_LIMITED");
    await discardGrant();
    await audit(AUDIT_EVENTS.QBO_AUTHORIZATION_FAILED, { stage: "REALM_VERIFICATION", reason: transient ? "PROVIDER_TEMPORARY" : "REALM_NOT_PROVEN" });
    return { ok: false, code: transient ? "PROVIDER_TEMPORARY" : "INVALID_REALM" };
  }

  try {
    const finalized = await finalizeQboConnection({ authorization, realmId: verifiedRealm, grant }, deps);
    if (!finalized.ok) {
      // Revoke ONLY for a business already bound to another company (and then only if no live connection holds the verified company,
      // see discardGrant). REALM_ALREADY_BOUND (another connection holds this company - an Intuit revoke may be app/company-wide) and
      // the state-race refusals (AUTHORIZATION_NOT_CONSUMED / _ALREADY_FINALIZED: a stored grant may belong to the request that won)
      // are NOT revoked: that could kill a working connection.
      if (finalized.reason === "BUSINESS_BOUND_TO_OTHER_REALM") await discardGrant();
      return { ok: false, code: mapFinalizeFailure(finalized.reason) };
    }
    return {
      ok: true, businessId: authorization.businessId, environment: authorization.environment,
      reconnected: finalized.reconnected, next: QBO_CALLBACK_SUCCESS_NEXT_PATH,
    };
  } catch (e) {
    // Owner-safe domain rejection (business archived or removed mid-flow): closed code, no detail. Anything else is a
    // genuine fault and is rethrown to the canonical wrapper, which reports it generically.
    if (e instanceof AppError && e.statusCode >= 400 && e.statusCode < 500) {
      await discardGrant();
      await audit(AUDIT_EVENTS.QBO_AUTHORIZATION_FAILED, { stage: "FINALIZE", reason: "BUSINESS_NOT_ELIGIBLE" });
      return { ok: false, code: "BUSINESS_NOT_ELIGIBLE" };
    }
    // The grant was certainly NOT stored (encryption failed before the transaction opened): discard it (guarded), then fail generically.
    if (e instanceof QboGrantNotStoredError) {
      await discardGrant();
      await audit(AUDIT_EVENTS.QBO_AUTHORIZATION_FAILED, { stage: "FINALIZE", reason: "TOKEN_STORAGE_UNAVAILABLE" });
      throw e;
    }
    // Any error from the transaction itself leaves it UNKNOWN whether the grant was stored (e.g. a commit that timed out): it is
    // deliberately not revoked - killing a stored, working connection is the worse outcome; the consumed one-time state prevents reuse.
    throw e;
  }
}

function classifyExchangeFailure(e: unknown): QboConnectFailureCode {
  if (!isQboProviderError(e)) return "PROVIDER_ERROR";
  switch (e.kind) {
    case "AUTHORIZATION_INVALID": return "CODE_REJECTED";
    case "RATE_LIMITED":
    case "TRANSIENT_PROVIDER_FAILURE":
    case "TIMEOUT": return "PROVIDER_TEMPORARY";
    case "MALFORMED_RESPONSE": return "PROVIDER_MALFORMED";
    case "CONFIGURATION_ERROR": return "CONFIGURATION_UNAVAILABLE";
    default: return "PROVIDER_ERROR";
  }
}

function mapFinalizeFailure(reason: string): QboConnectFailureCode {
  switch (reason) {
    case "AUTHORIZATION_NOT_CONSUMED": return "AUTHORIZATION_NOT_CONSUMED";
    case "AUTHORIZATION_ALREADY_FINALIZED": return "AUTHORIZATION_ALREADY_FINALIZED";
    case "BUSINESS_BOUND_TO_OTHER_REALM": return "BUSINESS_HAS_OTHER_COMPANY";
    // REALM_ALREADY_BOUND: never reveal that, or by whom, the company is held.
    default: return "REALM_UNAVAILABLE";
  }
}
