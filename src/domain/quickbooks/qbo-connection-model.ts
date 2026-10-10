/**
 * QuickBooks Online — connection persistence vocabulary (pure: no DB, no network).
 *
 * Tenancy model (enforced by services AND by database constraints in 20261008090000_qbo_connection_tenancy_persistence):
 *  - a connection belongs to exactly one workspace + OwnerBusiness + Intuit realm + environment;
 *  - the realm id returned by Intuit's callback is untrusted input and is never tenancy authority: the workspace,
 *    business, actor and environment are recovered from the consumed one-time authorization state;
 *  - an (environment, realm) pair is bound to at most ONE live connection across all tenants;
 *  - a business has at most ONE live connection per environment (a different realm needs an explicit disconnect first);
 *  - sandbox and production are separate namespaces and are always explicit.
 *
 * Lifecycle. A "pending" connection is the unconsumed/unfinalized authorization state (qbo_oauth_states); a connection
 * row is only ever created ACTIVE, in the same transaction that binds the realm and persists the encrypted tokens.
 *    ACTIVE -> REAUTH_REQUIRED | ERROR | DISCONNECTED;  REAUTH_REQUIRED/ERROR -> DISCONNECTED;
 *    DISCONNECTED -> ACTIVE only through a fresh, validated authorization (reconnect of the same realm to the same business).
 */
import { z } from "zod";
import { QBO_ACCOUNTING_SCOPE, type QboEnvironment } from "./qbo-config";

export const QBO_CONNECTION_STATUS = Object.freeze({
  ACTIVE: "ACTIVE",
  REAUTH_REQUIRED: "REAUTH_REQUIRED",
  DISCONNECTED: "DISCONNECTED",
  ERROR: "ERROR",
});
export type QboConnectionStatus = (typeof QBO_CONNECTION_STATUS)[keyof typeof QBO_CONNECTION_STATUS];

export const QBO_STATE_CONSUME_FAILURES = ["INVALID_STATE", "EXPIRED", "ALREADY_CONSUMED", "CONTEXT_MISMATCH"] as const;
export type QboStateConsumeFailure = (typeof QBO_STATE_CONSUME_FAILURES)[number];

export const QBO_FINALIZE_FAILURES = [
  "AUTHORIZATION_NOT_CONSUMED",
  "AUTHORIZATION_ALREADY_FINALIZED",
  "REALM_ALREADY_BOUND",
  "BUSINESS_BOUND_TO_OTHER_REALM",
] as const;
export type QboFinalizeFailure = (typeof QBO_FINALIZE_FAILURES)[number];

export const QBO_TOKEN_WRITE_FAILURES = ["STALE_REVISION", "CONNECTION_NOT_ACTIVE"] as const;
export type QboTokenWriteFailure = (typeof QBO_TOKEN_WRITE_FAILURES)[number];

export const QBO_GRANTED_SCOPE = QBO_ACCOUNTING_SCOPE;

const uuid = z.string().uuid();
const environment = z.enum(["sandbox", "production"]);

export const QboBeginAuthorizationSchema = z.object({
  workspaceId: uuid,
  actorId: uuid,
  businessId: uuid,
  environment,
});
export const QboConsumeStateSchema = z.object({
  workspaceId: uuid,
  actorId: uuid,
  environment,
  state: z.string().min(1).max(512),
});
export const QboConnectionRefSchema = z.object({ workspaceId: uuid, connectionId: uuid });
export const QboDisconnectSchema = QboConnectionRefSchema.extend({ actorId: uuid });
export const QboReauthSchema = QboConnectionRefSchema.extend({
  reasonCode: z.string().regex(/^[A-Z0-9_]{1,64}$/),
  /** When set, the connection is marked only if its stored token is STILL at this revision (a concurrent rotation then wins). */
  expectedTokenRevision: z.number().int().min(1).optional(),
});
export const QboRotateSchema = QboConnectionRefSchema.extend({ expectedRevision: z.number().int().min(1) });

/** The proof that a one-time state was consumed. Finalize re-verifies every field against the database. */
export interface ConsumedQboAuthorization {
  authorizationId: string;
  workspaceId: string;
  businessId: string;
  actorId: string;
  environment: QboEnvironment;
}

/** Token-free view of a connection. Never contains ciphertext or plaintext. */
export interface QboConnectionSummary {
  id: string;
  workspaceId: string;
  businessId: string;
  environment: QboEnvironment;
  realmId: string;
  status: QboConnectionStatus;
  connectedAt: Date;
  reauthRequiredAt: Date | null;
  disconnectedAt: Date | null;
  version: number;
}
