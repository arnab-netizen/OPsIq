/**
 * QuickBooks Online — owner-facing outcomes of the connect / OAuth-callback flow (pure: no DB, no network).
 *
 * Every failure is a closed code with a FIXED sentence. Nothing a caller, Intuit or a downstream error supplies
 * (error_description, provider body, state, code, realm, tenant ids) can reach the public body: the body is built
 * only from this table. A realm bound elsewhere is deliberately indistinguishable from any other "unavailable" case.
 */

/** Fixed internal landing for the success marker. Never taken from the request. */
export const QBO_CALLBACK_SUCCESS_NEXT_PATH = "/owner/home" as const;

export const QBO_CONNECT_FAILURE_CODES = [
  "CONFIGURATION_UNAVAILABLE",
  "INVALID_STATE",
  "EXPIRED",
  "ALREADY_CONSUMED",
  "CONTEXT_MISMATCH",
  "MALFORMED_CALLBACK",
  "INVALID_REALM",
  "USER_DENIED",
  "PROVIDER_DENIED",
  "CODE_REJECTED",
  "PROVIDER_TEMPORARY",
  "PROVIDER_MALFORMED",
  "PROVIDER_ERROR",
  "AUTHORIZATION_NOT_CONSUMED",
  "AUTHORIZATION_ALREADY_FINALIZED",
  "REALM_UNAVAILABLE",
  "BUSINESS_HAS_OTHER_COMPANY",
  "BUSINESS_NOT_ELIGIBLE",
] as const;
export type QboConnectFailureCode = (typeof QBO_CONNECT_FAILURE_CODES)[number];

type Retry = "RESTART_CONNECTION" | "LATER" | "NONE";

const TABLE: Record<QboConnectFailureCode, { http: number; message: string; retry: Retry }> = {
  CONFIGURATION_UNAVAILABLE: { http: 503, message: "QuickBooks is not available in this OpsIQ deployment.", retry: "NONE" },
  INVALID_STATE: { http: 400, message: "This QuickBooks sign-in link is not valid. Start the connection again.", retry: "RESTART_CONNECTION" },
  EXPIRED: { http: 400, message: "This QuickBooks sign-in link has expired. Start the connection again.", retry: "RESTART_CONNECTION" },
  ALREADY_CONSUMED: { http: 409, message: "This QuickBooks sign-in link was already used. Start the connection again.", retry: "RESTART_CONNECTION" },
  CONTEXT_MISMATCH: { http: 400, message: "This QuickBooks sign-in link was not started from your session. Start the connection again.", retry: "RESTART_CONNECTION" },
  MALFORMED_CALLBACK: { http: 400, message: "The QuickBooks response was incomplete. Start the connection again.", retry: "RESTART_CONNECTION" },
  INVALID_REALM: { http: 400, message: "QuickBooks returned an unexpected company reference. Start the connection again.", retry: "RESTART_CONNECTION" },
  USER_DENIED: { http: 400, message: "QuickBooks access was not approved. Nothing was connected.", retry: "RESTART_CONNECTION" },
  PROVIDER_DENIED: { http: 400, message: "QuickBooks did not complete the sign-in. Nothing was connected.", retry: "RESTART_CONNECTION" },
  CODE_REJECTED: { http: 400, message: "QuickBooks rejected the sign-in. Start the connection again.", retry: "RESTART_CONNECTION" },
  PROVIDER_TEMPORARY: { http: 502, message: "QuickBooks is temporarily unavailable. Start the connection again shortly.", retry: "LATER" },
  PROVIDER_MALFORMED: { http: 502, message: "QuickBooks returned an unexpected response. Start the connection again.", retry: "RESTART_CONNECTION" },
  PROVIDER_ERROR: { http: 502, message: "QuickBooks could not complete the connection. Start the connection again.", retry: "RESTART_CONNECTION" },
  AUTHORIZATION_NOT_CONSUMED: { http: 409, message: "This QuickBooks sign-in could not be completed. Start the connection again.", retry: "RESTART_CONNECTION" },
  AUTHORIZATION_ALREADY_FINALIZED: { http: 409, message: "This QuickBooks sign-in was already completed.", retry: "NONE" },
  REALM_UNAVAILABLE: { http: 409, message: "This QuickBooks company can't be connected here.", retry: "NONE" },
  BUSINESS_HAS_OTHER_COMPANY: { http: 409, message: "This business already has a different QuickBooks company connected. Disconnect it first.", retry: "NONE" },
  BUSINESS_NOT_ELIGIBLE: { http: 400, message: "QuickBooks can't be connected to this business.", retry: "NONE" },
};

export interface PublicConnectFailureBody {
  status: "FAILED" | "DENIED";
  code: QboConnectFailureCode;
  message: string;
  retry: Retry;
}

export function mapConnectFailure(code: QboConnectFailureCode): { httpStatus: number; body: PublicConnectFailureBody } {
  const row = TABLE[code];
  const denied = code === "USER_DENIED" || code === "PROVIDER_DENIED";
  return { httpStatus: row.http, body: { status: denied ? "DENIED" : "FAILED", code, message: row.message, retry: row.retry } };
}

/** OAuth 2.0 authorization-error codes (RFC 6749 §4.1.2.1) we recognise; everything else collapses to OTHER. */
const KNOWN_PROVIDER_ERRORS = [
  "access_denied", "invalid_request", "unauthorized_client", "unsupported_response_type", "invalid_scope",
  "server_error", "temporarily_unavailable", "login_required", "consent_required", "interaction_required",
] as const;
export type QboProviderDenialCode = (typeof KNOWN_PROVIDER_ERRORS)[number] | "OTHER";

/** Closed-set classification of the attacker-controllable `error` query value. The raw value is never kept. */
export function classifyProviderDenial(raw: unknown): QboProviderDenialCode {
  return typeof raw === "string" && (KNOWN_PROVIDER_ERRORS as readonly string[]).includes(raw) ? (raw as QboProviderDenialCode) : "OTHER";
}
