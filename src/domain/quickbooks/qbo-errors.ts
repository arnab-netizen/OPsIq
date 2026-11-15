/**
 * QuickBooks Online — provider error taxonomy.
 *
 * `QboProviderError.message` is ALWAYS a fixed, operator-safe sentence chosen from the error kind.
 * Raw Intuit response bodies, fault messages, tokens, codes, secrets and URLs never reach
 * `message`, so any generic handler that prints `error.message` stays safe. Diagnostic fields
 * (HTTP status, Intuit's `intuit_tid`, the provider fault code, retry guidance) are separate,
 * structured, and contain no secrets; `qboErrorLogContext` is the one approved way to log them.
 *
 * Kinds
 *  AUTH_EXPIRED            access token rejected (HTTP 401) — refresh, then retry once
 *  REFRESH_INVALID         refresh token rejected (invalid_grant) — owner must reconnect
 *  AUTHORIZATION_INVALID   authorization code rejected (invalid_grant on the code exchange)
 *  FORBIDDEN               HTTP 403 — scope, entitlement or company access problem
 *  NOT_FOUND               HTTP 404
 *  BAD_REQUEST             other HTTP 4xx — OpsIQ sent something Intuit rejected
 *  RATE_LIMITED            HTTP 429, or OpsIQ's own per-realm limiter refusing/queue overflow
 *  TRANSIENT_PROVIDER_FAILURE  HTTP 5xx or a network failure
 *  TIMEOUT                 no response within the client deadline
 *  MALFORMED_RESPONSE      2xx (or error) body that is not the expected shape
 *  CONFIGURATION_ERROR     missing/invalid OpsIQ config, or Intuit rejecting the app credentials
 *  CANCELLED               the caller aborted (e.g. scheduler lease lost)
 */

export const QBO_ERROR_KINDS = [
  "AUTH_EXPIRED",
  "REFRESH_INVALID",
  "AUTHORIZATION_INVALID",
  "FORBIDDEN",
  "NOT_FOUND",
  "BAD_REQUEST",
  "RATE_LIMITED",
  "TRANSIENT_PROVIDER_FAILURE",
  "TIMEOUT",
  "MALFORMED_RESPONSE",
  "CONFIGURATION_ERROR",
  "CANCELLED",
] as const;

export type QboErrorKind = (typeof QBO_ERROR_KINDS)[number];

const OPERATOR_MESSAGES: Record<QboErrorKind, string> = {
  AUTH_EXPIRED: "QuickBooks did not accept the saved sign-in. It needs to be refreshed.",
  REFRESH_INVALID: "The QuickBooks connection has expired or was revoked. Reconnect QuickBooks.",
  AUTHORIZATION_INVALID: "The QuickBooks sign-in link has expired or was already used. Start the connection again.",
  FORBIDDEN: "QuickBooks did not allow access to this company's data.",
  NOT_FOUND: "QuickBooks could not find the requested data.",
  BAD_REQUEST: "QuickBooks could not process the request.",
  RATE_LIMITED: "QuickBooks is receiving too many requests. It will be retried shortly.",
  TRANSIENT_PROVIDER_FAILURE: "QuickBooks is temporarily unavailable. It will be retried.",
  TIMEOUT: "QuickBooks did not respond in time. It will be retried.",
  MALFORMED_RESPONSE: "QuickBooks returned data in an unexpected form.",
  CONFIGURATION_ERROR: "QuickBooks is not configured correctly for this OpsIQ deployment.",
  CANCELLED: "The QuickBooks request was cancelled.",
};

/** Kinds a caller may retry later without changing anything. */
const RETRYABLE: ReadonlySet<QboErrorKind> = new Set<QboErrorKind>([
  "RATE_LIMITED",
  "TRANSIENT_PROVIDER_FAILURE",
  "TIMEOUT",
]);

/** Kinds that need the owner (reconnect / re-authorize / fix access), never an automatic retry. */
const OWNER_ACTION: ReadonlySet<QboErrorKind> = new Set<QboErrorKind>([
  "REFRESH_INVALID",
  "AUTHORIZATION_INVALID",
  "FORBIDDEN",
]);

export interface QboProviderErrorInit {
  kind: QboErrorKind;
  httpStatus?: number | null;
  /** Intuit's per-request trace id (`intuit_tid` response header). A diagnostic only. */
  intuitTid?: string | null;
  /** Intuit fault/error code (e.g. "invalid_grant", "6240"). Never the fault message. */
  providerCode?: string | null;
  retryAfterMs?: number | null;
  /** Why OpsIQ itself refused/failed the call (e.g. "LOCAL_QUEUE_FULL"). */
  localReason?: string | null;
}

export class QboProviderError extends Error {
  readonly kind: QboErrorKind;
  readonly httpStatus: number | null;
  readonly intuitTid: string | null;
  readonly providerCode: string | null;
  readonly retryAfterMs: number | null;
  readonly localReason: string | null;

  constructor(init: QboProviderErrorInit) {
    super(OPERATOR_MESSAGES[init.kind]);
    this.name = "QboProviderError";
    this.kind = init.kind;
    this.httpStatus = init.httpStatus ?? null;
    this.intuitTid = init.intuitTid ?? null;
    this.providerCode = init.providerCode ?? null;
    this.retryAfterMs = init.retryAfterMs ?? null;
    this.localReason = init.localReason ?? null;
  }

  get retryable(): boolean {
    return RETRYABLE.has(this.kind);
  }

  get requiresOwnerAction(): boolean {
    return OWNER_ACTION.has(this.kind);
  }

  /** The only text that may be shown to an owner. Identical to `message`. */
  get operatorMessage(): string {
    return OPERATOR_MESSAGES[this.kind];
  }
}

export function isQboProviderError(err: unknown): err is QboProviderError {
  return err instanceof QboProviderError;
}

/** Structured, secret-free diagnostics for logs. */
export function qboErrorLogContext(err: QboProviderError): Record<string, unknown> {
  return {
    kind: err.kind,
    httpStatus: err.httpStatus,
    intuitTid: err.intuitTid,
    providerCode: err.providerCode,
    retryAfterMs: err.retryAfterMs,
    localReason: err.localReason,
  };
}

/** Only short, plain identifier-like provider codes are kept; anything else is dropped. */
export function sanitizeProviderCode(code: unknown): string | null {
  return typeof code === "string" && /^[A-Za-z0-9_.-]{1,64}$/.test(code) ? code : null;
}

export interface ClassifyHttpFailureInput {
  status: number;
  intuitTid?: string | null;
  providerCode?: string | null;
  retryAfterMs?: number | null;
}

/** Classify a non-2xx response from the accounting API (not the OAuth endpoints). */
export function classifyApiHttpFailure(input: ClassifyHttpFailureInput): QboProviderError {
  const base = {
    httpStatus: input.status,
    intuitTid: input.intuitTid ?? null,
    providerCode: input.providerCode ?? null,
    retryAfterMs: input.retryAfterMs ?? null,
  };
  if (input.status === 401) return new QboProviderError({ kind: "AUTH_EXPIRED", ...base });
  if (input.status === 403) return new QboProviderError({ kind: "FORBIDDEN", ...base });
  if (input.status === 404) return new QboProviderError({ kind: "NOT_FOUND", ...base });
  if (input.status === 429) return new QboProviderError({ kind: "RATE_LIMITED", ...base });
  if (input.status >= 500) return new QboProviderError({ kind: "TRANSIENT_PROVIDER_FAILURE", ...base });
  return new QboProviderError({ kind: "BAD_REQUEST", ...base });
}

export type OauthOperation = "exchange" | "refresh" | "revoke";

/**
 * Classify a non-2xx response from Intuit's OAuth endpoints.
 * invalid_grant is NOT transient: on refresh it means the refresh token is dead (REFRESH_INVALID);
 * on the code exchange it means the code is expired/used (AUTHORIZATION_INVALID). A 401 from these
 * endpoints means Intuit rejected OpsIQ's app credentials (CONFIGURATION_ERROR), not the owner's.
 */
export function classifyOauthHttpFailure(
  operation: OauthOperation,
  input: ClassifyHttpFailureInput,
): QboProviderError {
  const base = {
    httpStatus: input.status,
    intuitTid: input.intuitTid ?? null,
    providerCode: input.providerCode ?? null,
    retryAfterMs: input.retryAfterMs ?? null,
  };
  if (input.status === 429) return new QboProviderError({ kind: "RATE_LIMITED", ...base });
  if (input.status >= 500) return new QboProviderError({ kind: "TRANSIENT_PROVIDER_FAILURE", ...base });
  if (input.providerCode === "invalid_grant") {
    return new QboProviderError({ kind: operation === "refresh" ? "REFRESH_INVALID" : "AUTHORIZATION_INVALID", ...base });
  }
  if (operation === "revoke" && input.status === 400) {
    // Intuit answers a token it no longer recognises (already revoked / expired) with a client error.
    // The module reports it distinctly and leaves the "treat as already disconnected" decision to the caller.
    return new QboProviderError({ kind: "REFRESH_INVALID", ...base });
  }
  if (input.status === 401 || input.providerCode === "invalid_client") {
    return new QboProviderError({ kind: "CONFIGURATION_ERROR", ...base });
  }
  if (input.status === 400) {
    // invalid_request / unsupported_grant_type / invalid_scope / redirect mismatch: our request or app registration.
    return new QboProviderError({ kind: "CONFIGURATION_ERROR", ...base });
  }
  return new QboProviderError({ kind: "BAD_REQUEST", ...base });
}
