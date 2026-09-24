/**
 * Owner-domain error presentation for Strategy/Recovery/Marketing/Cashflow.
 *
 * ROOT CAUSE this closes: these 4 pages' local `api()` helper discarded the
 * real HTTP status code (`throw new Error(data?.error?.message ||
 * data?.error || ...)`), and each page's catch handler rendered that
 * exception's `.message` verbatim (`setError(e instanceof Error ? e.message
 * : "...")`) -- a direct, unfiltered passthrough of whatever text the server
 * sent, with NO keyword inspection or classification of any kind in the
 * shipped code. Because the raw text was shown exactly as received, a 500
 * whose message happened to contain the substring "invalid"/"validation"
 * read to the owner as a user-input problem simply because that substring
 * was present in what was displayed verbatim, and a genuine 404
 * `NotFoundError("<ModelName>", <uuid>)` -- a real, reachable shape thrown by
 * every one of these domains' action/verification services -- reached the
 * owner as raw internal-model-name-plus-UUID text for the same reason:
 * nothing filtered or reworded it.
 *
 * A SEPARATE, DISTINCT risk was identified during this fix's design phase,
 * before any implementation: an earlier proposed approach considered
 * keyword/pattern screening of 5xx body text to decide whether it looked
 * safe to display verbatim. That approach was rejected before being built,
 * because it could have let a 500 containing Prisma-style "Invalid
 * invocation" text pass a naive safety screen and be shown as if it were a
 * validation message -- a misclassification risk the raw-passthrough defect
 * above did not itself exhibit (raw passthrough has no classification step
 * to get wrong; it is simply always wrong to show verbatim). This module's
 * design supersedes that rejected approach entirely rather than refining it.
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
 *     of message templates -- each one bound to BOTH the exact HTTP status
 *     and the exact domain word (strategy/recovery/marketing/cashflow) its
 *     source call site actually produces, traced to a specific, source-
 *     verified `ValidationError`/`NotFoundError` call site shared by all 4
 *     domains (see the regressions test file for the exact call sites) -- is
 *     matched against 4xx body text, and only a match at the CORRECT status
 *     produces a curated, hand-written owner-facing paraphrase. An unknown
 *     domain word, an altered message suffix, or the right text at the wrong
 *     status all fall through to the generic fallback below -- none of them
 *     is treated as a partial match. No implementation name
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
 *  5. No HTTP response at all splits further: a genuinely identified
 *     `fetch()` network failure (a `TypeError` naming the fetch itself, e.g.
 *     "Failed to fetch") gets connectivity guidance that does not claim the
 *     app is actively "checking" the connection or retrying automatically --
 *     neither of which these 4 pages' manual `api()` calls actually do. Any
 *     OTHER exception (an unrelated `TypeError`, a thrown string, `null`,
 *     `undefined`, or anything else that isn't a recognized `HttpResponseError`
 *     or a recognized fetch failure) never establishes that the network
 *     failed and is never relabeled as one -- it gets the same plain,
 *     operation-appropriate generic fallback as an unmatched HTTP response.
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
 * The exact 4 domain words these routes' action/verification services use in
 * their own message templates -- never a bare `\S+` wildcard, so a message
 * from an unrelated domain (or with an altered/misspelled domain word) can
 * never accidentally match one of these entries.
 */
const KNOWN_DOMAIN_WORD = "strategy|recovery|marketing|cashflow";

/**
 * Narrow, explicit allowlist of KNOWN 4xx message templates, each bound to
 * BOTH the exact HTTP status its source call site actually returns AND an
 * anchored (start, and end where the full message is static) pattern --
 * never an unanchored `.*` partial match. Traced to a specific source call
 * site shared across Strategy/Recovery/Marketing/Cashflow (see the
 * regression tests for the exact citations). A match on BOTH status and
 * pattern is required before any of this module's own curated text is shown
 * -- an unmatched 4xx body, an unmatched domain word, an altered suffix, or
 * the right text at the wrong status all fall through to `GENERIC_FALLBACK`.
 */
const KNOWN_MESSAGE_TEMPLATES: ReadonlyArray<{ status: number; pattern: RegExp; message: string }> = [
  // parseOrThrow / parseRequestBody (src/lib/validation.ts) -- identical
  // across every domain, since these are the shared request-body parsers.
  // Always a 400 (ValidationError's fixed status).
  { status: 400, pattern: /^Validation failed$/, message: "That didn't look right. Please check your entries and try again." },
  { status: 400, pattern: /^Invalid JSON in request body$/, message: "That didn't look right. Please check your entries and try again." },
  { status: 400, pattern: /^Unknown fields in request body$/, message: "That didn't look right. Please check your entries and try again." },
  // "Invalid <domain> action status: <value>" -- action.service.ts, all 4 domains, always 400.
  { status: 400, pattern: new RegExp(`^Invalid (?:${KNOWN_DOMAIN_WORD}) action status: `), message: "That status isn't recognized. Please refresh and try again." },
  // "Invalid <domain> action transition: <from> → <to>" -- action.service.ts, all 4 domains, always 400.
  { status: 400, pattern: new RegExp(`^Invalid (?:${KNOWN_DOMAIN_WORD}) action transition: `), message: "That action can't move to the requested status from its current one. Refresh to see its latest status." },
  // "Completing a <domain> action requires completionNotes and completionEvidence."
  // (Strategy/Marketing/Cashflow) -- action.service.ts, always 400. Never repeats the raw
  // field names in the owner-facing text.
  { status: 400, pattern: new RegExp(`^Completing a (?:${KNOWN_DOMAIN_WORD}) action requires completionNotes and completionEvidence\\.$`), message: "Add the required completion details before marking this complete." },
  // Recovery's own wording for the same rule -- "...completionNotes and actualOutcome."
  // (action.service.ts, founder-recovery), always 400.
  { status: 400, pattern: /^Completing a recovery action requires completionNotes and actualOutcome\.$/, message: "Add the required completion details before marking this complete." },
  // "Cannot verify a <domain> action without a before (baseline) value for the metric."
  // (Strategy/Marketing/Cashflow) -- verification.service.ts, always 400. Exact, anchored
  // string -- not a `.*` partial match, so unrelated text merely mentioning a "baseline
  // value" can never match this template.
  { status: 400, pattern: new RegExp(`^Cannot verify a (?:${KNOWN_DOMAIN_WORD}) action without a before \\(baseline\\) value for the metric\\.$`), message: "This action doesn't have a baseline value to verify against yet. Run diagnosis again to capture one." },
  // Recovery's own, differently-worded baseline-verification message
  // (verification.service.ts, founder-recovery), always 400. Exact, anchored string.
  { status: 400, pattern: /^Cannot verify an action without a baseline metric value\. Re-run diagnosis to capture a baseline\.$/, message: "This action doesn't have a baseline value to verify against yet. Run diagnosis again to capture one." },
  // NotFoundError("<ModelName>", "<uuid>") -> "<ModelName> not found: <uuid>" --
  // action.service.ts / verification.service.ts / snapshot.service.ts, all 4 domains,
  // always 404 (NotFoundError's fixed status). The entity-name portion is intentionally
  // left as a wildcard (dozens of distinct model names are thrown this way across these
  // domains' services -- see the regression tests), since the risk this module guards
  // against is never repeating whichever name arrives, not enumerating every model.
  // Never shown verbatim: the model name and UUID are internal implementation detail.
  { status: 404, pattern: /^\S+ not found: /, message: "That item couldn't be found. It may have been removed or updated elsewhere. Please refresh and try again." },
];

function safe(message: string, context: PresentationContext): string {
  return hasOperatorUnsafeContent(message) ? GENERIC_FALLBACK[context] : message;
}

/**
 * A genuine `fetch()` network failure is always a `TypeError` whose message
 * names the fetch itself (e.g. "Failed to fetch" in Chromium-based browsers,
 * "NetworkError when attempting to fetch resource." in Firefox) -- these 4
 * pages' `api()` helper makes no other `TypeError`-throwing call. This is a
 * narrow, source-grounded identification, not a blanket "any TypeError is a
 * network failure" assumption: an unrelated `TypeError` from other client
 * code (e.g. a bug reading an undefined property) does not match, and must
 * not be relabeled as a connectivity problem. Known limitation: a browser
 * whose fetch-rejection message never mentions "fetch" (e.g. Safari's "Load
 * failed") is not recognized by this narrow check and falls to the generic
 * fallback instead of connectivity guidance -- a plain, safe outcome, just
 * not the most specific one available for that browser.
 */
function isFetchNetworkFailure(error: unknown): boolean {
  if (!(error instanceof TypeError)) return false;
  const text = error.message;
  return /fetch/i.test(text);
}

/**
 * Produce the exact string to pass to `setError(...)` for a caught error on
 * one of these 4 pages. `error` is whatever the page's own `api()` helper
 * threw (an `HttpResponseError` for a real, non-ok HTTP response, or the
 * plain exception from a `fetch()` rejection / any other unexpected throw).
 */
export function presentDomainError(error: unknown, context: PresentationContext): string {
  if (!(error instanceof HttpResponseError)) {
    if (isFetchNetworkFailure(error)) {
      // A real, identified connectivity failure -- no HTTP response was ever received.
      return safe(NETWORK_MESSAGE, context);
    }
    // No real HTTP response, and not a recognized fetch failure either: an
    // unrelated or unclassified exception (a non-fetch TypeError, a thrown
    // string, `null`, `undefined`, anything else). Never invent a network
    // diagnosis for it -- fall back to the same plain, operation-appropriate
    // message an unmatched HTTP response would get.
    return GENERIC_FALLBACK[context];
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
    for (const { status, pattern, message } of KNOWN_MESSAGE_TEMPLATES) {
      if (error.status === status && pattern.test(error.message)) {
        return safe(message, context);
      }
    }
  }

  // Any other 4xx, recognized or not, with no allowlist match.
  return GENERIC_FALLBACK[context];
}
