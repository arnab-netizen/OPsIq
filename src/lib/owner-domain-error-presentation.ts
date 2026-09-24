/**
 * Owner-domain error presentation for Strategy/Recovery/Marketing/Cashflow.
 *
 * ROOT CAUSE this closes: these 4 pages' local `api()` helper throws a plain
 * `Error`, discarding the real HTTP status code entirely, so any owner-facing
 * text ends up derived by guessing keywords in the message body. That is what
 * let a 500 whose message happened to contain "invalid"/"validation" render
 * as a user-input problem, and it independently let a genuine 404
 * `NotFoundError("<ModelName>", <uuid>)` -- a real, reachable shape thrown by
 * every one of these domains' action/verification services -- reach the
 * owner as raw internal-model-name-plus-UUID text.
 *
 * This module does NOT modify the shared classifier (`operator-error-
 * governance.ts` / `operator-safe-errors.ts`); it composes the ALREADY
 * EXPORTED, already-shipped `HttpResponseError` (constructed via the
 * existing `httpResponseErrorFromBody`) to recover the real status code, and
 * decides the displayed text itself, using this precedence:
 *
 *  1. HTTP status is authoritative and checked FIRST. A 5xx response NEVER
 *     becomes a validation-flavored message, and never trusts server body
 *     text at all -- regardless of what that text says -- since nothing
 *     about a 5xx response is a recognized, verified shape.
 *  2. Server body text is never treated as safe merely because it fails to
 *     match a "known unsafe" pattern. Instead, a NARROW, explicit allowlist
 *     of message templates -- each one traced to a specific, source-verified
 *     `ValidationError`/`NotFoundError` call site shared by all 4 domains
 *     (see the regressions test file for the exact call sites) -- is matched
 *     against 4xx body text, and only a match produces a curated,
 *     hand-written owner-facing paraphrase. No implementation name
 *     (`completionNotes`, `completionEvidence`, a Prisma/DB model name, a
 *     raw status enum, or a UUID) is ever included in an allowlisted
 *     message's output. Anything that does not match falls to a plain,
 *     status- and operation-appropriate generic message -- never the raw
 *     server text itself.
 *  3. 401 gets neutral "please sign in" guidance rather than an assumed
 *     "session expired" framing, since nothing in the response reliably
 *     distinguishes an expired session from one that was never established.
 *  4. 403 is split only on the two real, source-confirmed auth-decision
 *     strings ("Insufficient permissions" / "Workspace required"); any other
 *     403 body falls to the generic permission message.
 *  5. No HTTP response at all (a genuine `fetch()` rejection) gets
 *     connectivity guidance that does not claim the app is actively
 *     "checking" the connection or retrying automatically -- neither of
 *     which these 4 pages' manual `api()` calls actually do.
 *  6. No message ever asserts "nothing was saved" -- that guarantee is not
 *     verified per specific operation from the client's vantage point (a
 *     write may have partially applied server-side before a late failure).
 *
 * `hasOperatorUnsafeContent` (the existing shared leak scanner) is used only
 * as an ADDITIONAL, defense-in-depth check on this module's OWN curated
 * output strings -- never as the basis for trusting arbitrary server text.
 */
import { HttpResponseError } from "@/lib/operator-safe-errors";
import { hasOperatorUnsafeContent } from "@/lib/operator-error-governance";

export type PresentationContext = "load" | "save" | "action";

const AUTH_MESSAGE = "Please sign in to continue.";
const PERMISSION_MESSAGE = "You don't have permission to do this.";
const WORKSPACE_MESSAGE = "This isn't available for your current workspace.";
const NETWORK_MESSAGE = "Couldn't connect to the server. Check your internet connection and try again.";

const GENERIC_FALLBACK: Record<PresentationContext, string> = {
  load: "Couldn't load that information. Please refresh and try again.",
  save: "Couldn't save your changes. Please try again.",
  action: "Couldn't complete this action. Please try again.",
};

/**
 * Narrow, explicit allowlist of KNOWN 4xx message templates, each traced to
 * a specific source call site shared across Strategy/Recovery/Marketing/
 * Cashflow (see the regression tests for the exact citations). A pattern
 * match is required before any of this module's own curated text is shown
 * -- an unmatched 4xx body, however benign-looking, always falls through to
 * `GENERIC_FALLBACK`.
 */
const KNOWN_MESSAGE_TEMPLATES: ReadonlyArray<{ pattern: RegExp; message: string }> = [
  // parseOrThrow / parseRequestBody (src/lib/validation.ts) -- identical
  // across every domain, since these are the shared request-body parsers.
  { pattern: /^Validation failed$/, message: "That didn't look right. Please check your entries and try again." },
  { pattern: /^Invalid JSON in request body$/, message: "That didn't look right. Please check your entries and try again." },
  { pattern: /^Unknown fields in request body$/, message: "That didn't look right. Please check your entries and try again." },
  // "Invalid <domain> action status: <value>" -- action.service.ts, all 4 domains.
  { pattern: /^Invalid \S+ action status: /, message: "That status isn't recognized. Please refresh and try again." },
  // "Invalid <domain> action transition: <from> → <to>" -- action.service.ts, all 4 domains.
  { pattern: /^Invalid \S+ action transition: /, message: "That action can't move to the requested status from its current one. Refresh to see its latest status." },
  // "Completing a <domain> action requires completionNotes and completionEvidence."
  // (Strategy/Marketing/Cashflow) or "...completionNotes and actualOutcome." (Recovery)
  // -- never repeat the raw field names in the owner-facing text.
  { pattern: /^Completing a \S+ action requires completionNotes and (completionEvidence|actualOutcome)\.$/, message: "Add the required completion details before marking this complete." },
  // "Cannot verify a <domain> action without a before (baseline) value for the metric."
  // (Strategy/Marketing/Cashflow) or "Cannot verify an action without a baseline metric
  // value. Re-run diagnosis to capture a baseline." (Recovery) -- verification.service.ts.
  { pattern: /^Cannot verify .*(before \(baseline\) value|baseline metric value)/, message: "This action doesn't have a baseline value to verify against yet. Run diagnosis again to capture one." },
  // NotFoundError("<ModelName>", "<uuid>") -> "<ModelName> not found: <uuid>" --
  // action.service.ts / verification.service.ts / snapshot.service.ts, all 4 domains.
  // Never shown verbatim: the model name and UUID are internal implementation detail.
  { pattern: /^\S+ not found: /, message: "That item couldn't be found. It may have been removed or updated elsewhere. Please refresh and try again." },
];

function safe(message: string, context: PresentationContext): string {
  return hasOperatorUnsafeContent(message) ? GENERIC_FALLBACK[context] : message;
}

/**
 * Produce the exact string to pass to `setError(...)` for a caught error on
 * one of these 4 pages. `error` is whatever the page's own `api()` helper
 * threw (an `HttpResponseError` for a real, non-ok HTTP response, or the
 * plain exception from a `fetch()` rejection / any other unexpected throw).
 */
export function presentDomainError(error: unknown, context: PresentationContext): string {
  if (!(error instanceof HttpResponseError)) {
    // No real HTTP response was ever received -- a genuine connectivity
    // failure (or an unexpected non-fetch exception, which looks the same
    // from the client's vantage point: no server response to classify).
    return safe(NETWORK_MESSAGE, context);
  }

  if (error.status === 401) {
    return safe(AUTH_MESSAGE, context);
  }

  if (error.status === 403) {
    const serverMessage = error.message;
    if (error.hasServerMessage && serverMessage === "Workspace required") {
      return safe(WORKSPACE_MESSAGE, context);
    }
    return safe(PERMISSION_MESSAGE, context);
  }

  if (error.status >= 500) {
    // Status alone decides this -- the body is never inspected, let alone
    // trusted, for a 5xx. This is the exact bug being closed: a 5xx whose
    // text happens to say "invalid"/"validation" must never read as a
    // validation message.
    return GENERIC_FALLBACK[context];
  }

  if (error.hasServerMessage) {
    for (const { pattern, message } of KNOWN_MESSAGE_TEMPLATES) {
      if (pattern.test(error.message)) {
        return safe(message, context);
      }
    }
  }

  // Any other 4xx, recognized or not, with no allowlist match.
  return GENERIC_FALLBACK[context];
}
