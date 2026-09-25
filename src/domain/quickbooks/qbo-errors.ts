/**
 * QuickBooks Online — fault parsing and HTTP/network failure classification.
 *
 * Pure module: no DB, no network, no process.env reads. Turns a raw QBO HTTP
 * response (or a network-level failure before any response) into the frozen
 * QboApiError contract (`qbo-contracts.ts`). Never echoes request bodies or
 * tokens in any message it builds.
 */

import { QboApiError, type QboErrorKind, type QboFaultDetail } from "./qbo-contracts";

const MAX_MESSAGE_LEN = 300;

function truncate(s: string, max = MAX_MESSAGE_LEN): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/**
 * QBO's error envelope is inconsistent across endpoints: usually
 * `{ Fault: { Error: [...], type } }`, sometimes lower-cased
 * `{ fault: { error: [...], type } }`. Both shapes are accepted here.
 */
export interface ParsedQboFault {
  faultType: string | null;
  faults: QboFaultDetail[];
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : v !== undefined && v !== null ? [v] : [];
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/** Parses a raw QBO error response body into a fault type and its errors. Returns empty faults if the body has no recognizable fault envelope. */
export function parseQboFault(body: unknown): ParsedQboFault {
  const root = asRecord(body);
  if (!root) return { faultType: null, faults: [] };

  const faultNode = asRecord(root.Fault) ?? asRecord(root.fault);
  if (!faultNode) return { faultType: null, faults: [] };

  const faultType = str(faultNode.type) ?? str(faultNode.Type);
  const errorNodes = asArray(faultNode.Error ?? faultNode.error);

  const faults: QboFaultDetail[] = errorNodes.map((raw) => {
    const e = asRecord(raw) ?? {};
    const codeRaw = e.code ?? e.Code;
    return {
      code: codeRaw === undefined || codeRaw === null ? null : String(codeRaw),
      message: str(e.Message) ?? str(e.message) ?? "QuickBooks reported an error",
      detail: str(e.Detail) ?? str(e.detail),
      element: str(e.element) ?? str(e.Element),
    };
  });

  return { faultType, faults };
}

/** Builds an owner-safe message: first fault's Message (with Detail appended when distinct), truncated. Never echoes the request body. */
export function buildOwnerSafeMessage(faults: QboFaultDetail[], fallback: string): string {
  const first = faults[0];
  if (!first) return truncate(fallback);
  const parts = [first.message];
  if (first.detail && first.detail !== first.message) parts.push(first.detail);
  return truncate(parts.join(" — "));
}

const STALE_OBJECT_CODE = "5010";
const NOT_FOUND_CODE = "610";
const DUPLICATE_NAME_CODE = "6240";
const AUTH_FAULT_CODE = "3200";
const AUTHORIZATION_FAULT_CODE = "3100";
const THROTTLE_CODE = "3001";

function faultKindFromCode(code: string | null, message: string | null): QboErrorKind | null {
  if (code === STALE_OBJECT_CODE) return "STALE_OBJECT";
  if (code === NOT_FOUND_CODE) return "NOT_FOUND";
  if (code === DUPLICATE_NAME_CODE) return "DUPLICATE";
  if (code === AUTH_FAULT_CODE) return "AUTH";
  if (code === AUTHORIZATION_FAULT_CODE) return "FORBIDDEN";
  if (code === THROTTLE_CODE) return "RATE_LIMITED";
  // Some duplicate-name style faults surface under a generic 6000-series code
  // with "Duplicate" in the message instead of the dedicated 6240 code.
  if (code?.startsWith("6000") && message && /duplicate/i.test(message)) return "DUPLICATE";
  return null;
}

function faultKindFromType(faultType: string | null): QboErrorKind | null {
  switch (faultType) {
    case "AuthenticationFault":
      return "AUTH";
    case "AuthorizationFault":
      return "FORBIDDEN";
    case "ValidationFault":
      return "VALIDATION";
    default:
      return null;
  }
}

/** Parses a Retry-After header (seconds, or an HTTP-date) into milliseconds from `now`. Returns null when absent or unparseable, never negative. */
export function parseRetryAfter(header: string | null | undefined, now: Date): number | null {
  if (!header) return null;
  const trimmed = header.trim();
  if (trimmed.length === 0) return null;

  if (/^\d+$/.test(trimmed)) {
    const seconds = Number(trimmed);
    return Number.isFinite(seconds) ? Math.max(0, seconds * 1000) : null;
  }

  const asDate = new Date(trimmed);
  if (Number.isNaN(asDate.getTime())) return null;
  const diff = asDate.getTime() - now.getTime();
  return diff > 0 ? diff : 0;
}

export interface QboHttpFailureInput {
  status: number;
  body: unknown;
  /** Response headers, already lower-cased keys (as returned by `Headers` iteration or an equivalent map). */
  headers: { get(name: string): string | null };
  /** True when this response was for a write (create/update/delete/void/inactivate) — governs `ambiguous`. */
  isWrite: boolean;
  now?: Date;
}

/**
 * Classifies a completed QBO HTTP response (status + body) into a QboApiError.
 * A write that fails with a 5xx is marked `ambiguous`: QBO may have committed
 * the mutation even though the response was an error.
 */
export function classifyQboHttpFailure(input: QboHttpFailureInput): QboApiError {
  const now = input.now ?? new Date();
  const { faultType, faults } = parseQboFault(input.body);
  const intuitTid = input.headers.get("intuit_tid");
  const retryAfterMs = parseRetryAfter(input.headers.get("retry-after"), now);

  const firstFault = faults[0] ?? null;
  const kindFromFault = faultKindFromCode(firstFault?.code ?? null, firstFault?.message ?? null) ?? faultKindFromType(faultType);

  let kind: QboErrorKind;
  let ambiguous = false;

  if (input.status === 401) {
    kind = "AUTH";
  } else if (input.status === 403) {
    // The fault body is authoritative when present: QBO sometimes returns a
    // more specific fault (e.g. AuthenticationFault, or a 3001 throttle fault)
    // under an HTTP 403. Falling back to a blanket FORBIDDEN here would drop
    // that classification — e.g. an AUTH fault on 403 would never trigger the
    // client's forceRefresh-and-retry path, and a throttle fault on 403 would
    // never be retried.
    kind = kindFromFault ?? "FORBIDDEN";
  } else if (input.status === 429) {
    kind = "RATE_LIMITED";
  } else if (input.status >= 500) {
    kind = "TRANSIENT";
    ambiguous = input.isWrite;
  } else if (kindFromFault) {
    kind = kindFromFault;
    ambiguous = input.isWrite && input.status >= 500;
  } else if (input.status >= 400) {
    kind = "VALIDATION";
  } else {
    // A non-error HTTP status routed here is itself malformed use of this classifier.
    kind = "MALFORMED";
  }

  const fallbackMessage = `QuickBooks request failed (HTTP ${input.status})`;
  const message = buildOwnerSafeMessage(faults, fallbackMessage);

  return new QboApiError({
    kind,
    message,
    httpStatus: input.status,
    faultType,
    faults,
    intuitTid,
    retryAfterMs,
    ambiguous,
  });
}

export interface QboNetworkFailureInput {
  error: unknown;
  isWrite: boolean;
  timedOut: boolean;
}

/**
 * Classifies a failure that occurred before any HTTP response was received
 * (connection reset, DNS failure, deadline exceeded). Writes are always
 * marked `ambiguous`: the request may have reached QBO and been committed.
 */
export function classifyQboNetworkFailure(input: QboNetworkFailureInput): QboApiError {
  const kind: QboErrorKind = input.timedOut ? "TIMEOUT" : "TRANSIENT";
  // Fixed, owner-safe text only — the raw network error (hostnames, errno,
  // stack fragments) must never reach an owner-facing message. The error's
  // `name` (e.g. "ECONNRESET", "AbortError") is safe to log separately by
  // the caller for diagnostics, but is not included here.
  const message = input.timedOut ? "QuickBooks did not respond in time" : "Could not reach QuickBooks";

  return new QboApiError({
    kind,
    message,
    httpStatus: null,
    faultType: null,
    faults: [],
    intuitTid: null,
    retryAfterMs: null,
    ambiguous: input.isWrite,
  });
}
