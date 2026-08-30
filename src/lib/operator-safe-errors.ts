/**
 * Operator-Safe Error Message Handler
 *
 * Converts technical errors into clear, actionable operator-safe messages.
 * Rules:
 * - No technical jargon (Prisma, DB, UUID, stack-like phrasing)
 * - Always include: what happened + whether data is safe + what to do next
 * - Never panic-inducing language
 * - No dead-end errors
 */

import { RuntimeError } from "@/runtime/runtime-errors";

export interface OperatorSafeErrorResponse {
  success: false;
  error: string;
  recovery: string;
  shouldRetry: boolean;
}

/**
 * Represents a real HTTP response the client received from a governed API
 * route (i.e. `fetch()` resolved -- it did NOT throw). It carries the real
 * status code and, when the server's JSON error envelope included one, the
 * server's own operator-safe `error` message.
 *
 * ROOT CAUSE THIS CLOSES: client `if (!response.ok)` handlers used to
 * `throw new Error("Failed to fetch <thing>")`, discarding the real status
 * and body. That synthetic message then collided with the network-error
 * substring check below (it contains the word "fetch"), so a 401/403/500
 * response was misclassified as a connectivity problem. Build this class
 * via `toHttpResponseError`/`httpResponseErrorFromBody` instead of a bare
 * `Error` so classification below is driven by the real status code, never
 * by guessing by message text.
 */
export class HttpResponseError extends Error {
  readonly status: number;
  /** True when `message` came from the server's own governed error body (safe to show verbatim). */
  readonly hasServerMessage: boolean;

  constructor(message: string, status: number, hasServerMessage: boolean) {
    super(message);
    this.name = "HttpResponseError";
    this.status = status;
    this.hasServerMessage = hasServerMessage;
  }
}

/**
 * Build an HttpResponseError from a non-ok fetch Response, extracting the
 * governed server message from the JSON body (`{ error: string, ... }`,
 * the shape every canonical route responds with) when present.
 *
 * Usage: `if (!response.ok) { throw await toHttpResponseError(response); }`
 */
export async function toHttpResponseError(response: Response): Promise<HttpResponseError> {
  let serverMessage: string | undefined;
  try {
    const body = await response.clone().json();
    if (body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string") {
      const trimmed = (body as { error: string }).error.trim();
      if (trimmed.length > 0) {
        serverMessage = trimmed;
      }
    }
  } catch {
    // Body wasn't JSON (or the response has no body) -- fall back to a
    // status-only message below rather than losing the failure entirely.
  }

  return new HttpResponseError(
    serverMessage ?? `Request failed with status ${response.status}`,
    response.status,
    serverMessage !== undefined
  );
}

/**
 * Same as `toHttpResponseError`, for call sites that already parsed the
 * response body (so `response.json()` can't be called again).
 */
export function httpResponseErrorFromBody(status: number, body: unknown): HttpResponseError {
  let serverMessage: string | undefined;
  if (body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string") {
    const trimmed = (body as { error: string }).error.trim();
    if (trimmed.length > 0) {
      serverMessage = trimmed;
    }
  }

  return new HttpResponseError(
    serverMessage ?? `Request failed with status ${status}`,
    status,
    serverMessage !== undefined
  );
}

/**
 * Convert any error to an operator-safe message
 *
 * @param error - The error that occurred
 * @param context - Brief context about what was happening
 * @returns Operator-safe error response
 */
export function toOperatorSafeError(
  error: unknown,
  context: "decision" | "action" | "form" | "load" | "save" | "network"
): OperatorSafeErrorResponse {
  // If it's already a RuntimeError with operator_safe_message, use that
  if (error instanceof RuntimeError) {
    return {
      success: false,
      error: error.metadata.operator_safe_message,
      recovery: error.metadata.recovery_suggestion || getDefaultRecovery(context),
      shouldRetry: error.metadata.retryable !== "NOT_RETRYABLE",
    };
  }

  // A real HTTP response was received (fetch() resolved, it did not
  // reject). By definition this can never be a network/connectivity
  // failure -- classify strictly from the real status code, never from
  // message-substring guessing, so a 401/403/500 can't be mistaken for a
  // dropped connection.
  if (error instanceof HttpResponseError) {
    return classifyHttpResponseError(error, context);
  }

  // If it's a standard Error, map it to operator-safe message
  if (error instanceof Error) {
    // allowNetwork stays true here: a plain Error/TypeError with no known
    // status is exactly what a genuine fetch() rejection (the request never
    // got a response at all) looks like, so the network branch must stay
    // reachable for it.
    return classifyByMessage(error.message.toLowerCase(), context, { allowNetwork: true });
  }

  // Unknown error type
  return {
    success: false,
    error: getContextualErrorMessage(context),
    recovery: getDefaultRecovery(context),
    shouldRetry: shouldRetryForContext(context),
  };
}

/**
 * Classify an HttpResponseError using its real HTTP status code first.
 * A response was received (never a network failure), so 401/403/5xx are
 * decided by status alone -- never by guessing from the message text, which
 * is what let a status error collide with the network-error keyword check.
 */
function classifyHttpResponseError(
  error: HttpResponseError,
  context: "decision" | "action" | "form" | "load" | "save" | "network"
): OperatorSafeErrorResponse {
  const message = error.message.toLowerCase();

  if (error.status === 401) {
    return {
      success: false,
      error: "Your session has expired. Please sign in again.",
      recovery: "Sign in again to continue.",
      shouldRetry: false,
    };
  }

  if (error.status === 403) {
    if (message.includes("workspace")) {
      return {
        success: false,
        error: "This isn't available for your current workspace.",
        recovery: "Switch to the right workspace, or contact your workspace admin if this seems wrong.",
        shouldRetry: false,
      };
    }
    return {
      success: false,
      error: "You don't have permission to do this.",
      recovery: "Contact your workspace admin to request access.",
      shouldRetry: false,
    };
  }

  if (error.status >= 500) {
    return {
      success: false,
      error: "Server is having trouble. We're working on it.",
      recovery: "Automatic retry will try again. If this keeps happening, contact support.",
      shouldRetry: true,
    };
  }

  // Any other status (400, 404, 409, 422, 429, ...): every canonical route
  // (translateAuthDecisionToResponse and withCanonicalEnforcement's catch --
  // see canonical-route-enforcement.ts) only ever puts a message in the
  // `error` field that is already operator-safe: a fixed safe string for an
  // auth-decision rejection, or a deliberately human-readable AppError
  // message for a known 4xx. Surface it verbatim rather than re-guessing a
  // possibly-different generic message from keywords. Fall back to keyword
  // classification (network branch disabled -- a response was received)
  // only when the server sent no body/message at all.
  if (error.hasServerMessage) {
    return {
      success: false,
      error: error.message,
      recovery: getDefaultRecovery(context),
      shouldRetry: shouldRetryForContext(context),
    };
  }

  return classifyByMessage(message, context, { allowNetwork: false });
}

/**
 * Shared keyword-based classification, used both for ad-hoc Errors (where
 * "fetch"/"network" in the message legitimately signals a dropped
 * connection) and for the non-401/403/5xx tail of HttpResponseError (where
 * it never does, because a real response was received).
 */
function classifyByMessage(
  message: string,
  context: "decision" | "action" | "form" | "load" | "save" | "network",
  options: { allowNetwork: boolean }
): OperatorSafeErrorResponse {
  // Network errors -- only reachable for errors with no known HTTP status.
  if (options.allowNetwork && (message.includes("fetch") || message.includes("network"))) {
    return {
      success: false,
      error: "Couldn't connect to the server. Checking connection...",
      recovery: "Automatic retry will try again in 5 seconds. Check your internet connection.",
      shouldRetry: true,
    };
  }

  // Permission errors
  if (message.includes("permission") || message.includes("unauthorized")) {
    return {
      success: false,
      error: "You don't have permission to do this.",
      recovery: "Contact your workspace admin to request access.",
      shouldRetry: false,
    };
  }

  // Workspace/tenant context errors (e.g. no active workspace membership resolved
  // for the session) -- distinct from a plain permission denial, since re-requesting
  // access from an admin isn't the fix here.
  if (message.includes("workspace")) {
    return {
      success: false,
      error: "This isn't available for your current workspace.",
      recovery: "Switch to the right workspace, or contact your workspace admin if this seems wrong.",
      shouldRetry: false,
    };
  }

  // Validation errors (hide details, ask user to check entries)
  if (message.includes("validation") || message.includes("invalid")) {
    return {
      success: false,
      error: "That didn't look right. Please check your entries.",
      recovery: "Review your inputs and try again. Look for any required fields marked with *",
      shouldRetry: false,
    };
  }

  // Timeout errors
  if (message.includes("timeout") || message.includes("took too long")) {
    return {
      success: false,
      error: "That took too long. Please try again.",
      recovery: "This sometimes happens with slow connections. Automatic retry will attempt again.",
      shouldRetry: true,
    };
  }

  // Conflict/duplicate errors
  if (message.includes("conflict") || message.includes("duplicate")) {
    return {
      success: false,
      error: "This action is already being processed.",
      recovery: "Your previous submission is still being processed. Please wait a moment before retrying.",
      shouldRetry: false,
    };
  }

  // Database/server errors (generic, non-technical)
  if (message.includes("database") || message.includes("server") || message.includes("500")) {
    return {
      success: false,
      error: "Server is having trouble. We're working on it.",
      recovery: "Automatic retry will try again. If this keeps happening, contact support.",
      shouldRetry: true,
    };
  }

  // Generic fallback based on context
  return {
    success: false,
    error: getContextualErrorMessage(context),
    recovery: getDefaultRecovery(context),
    shouldRetry: shouldRetryForContext(context),
  };
}

/**
 * Get a contextual error message based on what was happening
 */
function getContextualErrorMessage(
  context: "decision" | "action" | "form" | "load" | "save" | "network"
): string {
  const messages: Record<typeof context, string> = {
    decision: "Couldn't save your decision. Please try again.",
    action: "Couldn't process this action. Please try again.",
    form: "Couldn't save the form. Please try again.",
    load: "Couldn't load that data. Please refresh and try again.",
    save: "Couldn't save your changes. Please try again.",
    network: "Network error. Check your connection and try again.",
  };
  return messages[context];
}

/**
 * Get recovery guidance based on context
 */
function getDefaultRecovery(
  context: "decision" | "action" | "form" | "load" | "save" | "network"
): string {
  const recovery: Record<typeof context, string> = {
    decision:
      "Your decision wasn't saved. Click the button again to retry. " +
      "The system prevents duplicate submissions, so it's safe.",
    action:
      "This action couldn't be processed. Refresh the page and try again. " +
      "Your data is safe.",
    form:
      "Your form data is still here. Fix any errors and click submit again.",
    load:
      "Try refreshing the page. If it keeps failing, check your internet connection.",
    save:
      "Try saving again. If this keeps happening, contact support with the time this occurred.",
    network:
      "This usually means an internet issue. Check your connection and try again. " +
      "Automatic retry will happen shortly.",
  };
  return recovery[context];
}

/**
 * Determine if this error type is safe to retry
 */
function shouldRetryForContext(
  context: "decision" | "action" | "form" | "load" | "save" | "network"
): boolean {
  // These contexts are safe to retry
  const retryable = ["decision", "action", "load", "network", "save"];
  return retryable.includes(context);
}

/**
 * Format error for display in UI
 * Shows error message + recovery hint
 */
export function formatOperatorErrorDisplay(response: OperatorSafeErrorResponse): {
  title: string;
  message: string;
  hint: string;
  showRetry: boolean;
} {
  return {
    title: "Something went wrong",
    message: response.error,
    hint: response.recovery,
    showRetry: response.shouldRetry,
  };
}
