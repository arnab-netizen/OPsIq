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
 *  5. No HTTP response at all splits further: a `TypeError` whose message
 *     exactly matches one of a short, explicit list of known fetch-rejection
 *     strings (e.g. "Failed to fetch") gets connectivity guidance that does
 *     not claim the app is actively "checking" the connection or retrying
 *     automatically -- neither of which these 4 pages' manual `api()` calls
 *     actually do. This is conservative message recognition, not proof of
 *     the underlying cause. Any OTHER exception (an unrelated `TypeError`
 *     such as `fetch is not a function`, a thrown string, `null`,
 *     `undefined`, or anything else that isn't a recognized `HttpResponseError`
 *     or one of those exact messages) never establishes that the network
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
 * never accidentally match one of these entries. Used only where all 4
 * domains genuinely share the identical template (see each entry below).
 */
const KNOWN_DOMAIN_WORD = "strategy|recovery|marketing|cashflow";

/**
 * Strategy/Marketing/Cashflow share IDENTICAL wording for the completion-
 * requirement and baseline-verification templates below -- Recovery does
 * NOT: its action.service.ts/verification.service.ts use "actualOutcome"
 * (not "completionEvidence") and an entirely different baseline-verification
 * sentence (see the two Recovery-only entries below). Using the 4-domain
 * `KNOWN_DOMAIN_WORD` for these two templates would let a "Completing a
 * recovery action requires completionNotes and completionEvidence." message
 * -- a string Recovery's real source never produces -- match anyway, which
 * is exactly the unverified-template risk this allowlist exists to avoid.
 */
const THREE_DOMAIN_WORD = "strategy|marketing|cashflow";

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
  // (Strategy/Marketing/Cashflow ONLY -- Recovery uses "actualOutcome", see below) --
  // action.service.ts, always 400. Never repeats the raw field names in the owner-facing text.
  { status: 400, pattern: new RegExp(`^Completing a (?:${THREE_DOMAIN_WORD}) action requires completionNotes and completionEvidence\\.$`), message: "Add the required completion details before marking this complete." },
  // Recovery's own wording for the same rule -- "...completionNotes and actualOutcome."
  // (action.service.ts, founder-recovery), always 400.
  { status: 400, pattern: /^Completing a recovery action requires completionNotes and actualOutcome\.$/, message: "Add the required completion details before marking this complete." },
  // Outcome-evidence policy (src/domain/founder-recovery/verification-evidence.ts), thrown by all
  // 7 owner-domain verification services + recovery, always 400. Both are fixed, owner-authored
  // sentences with no internal names, so they are shown as written. (They replace the former
  // "Cannot verify a <domain> action without a before (baseline) value" template, which no
  // service throws any more.)
  { status: 400, pattern: /^Start this action before recording its outcome\.$/, message: "Start this action before recording its outcome." },
  { status: 400, pattern: /^Enter the before \(baseline\) value — the diagnosis did not measure this metric\.$/, message: "Enter the before (baseline) value — the diagnosis did not measure this metric." },
  // Recovery's own, differently-worded baseline-verification message
  // (verification.service.ts, founder-recovery), always 400. Exact, anchored string.
  { status: 400, pattern: /^Cannot verify an action without a baseline metric value\. Re-run diagnosis to capture a baseline\.$/, message: "This action doesn't have a baseline value to verify against yet. Run diagnosis again to capture one." },
  // Strategy decision-fit gate (owner-strategy action.service.ts, STRATEGY_STEP_NOT_IN_DECISION_MESSAGE),
  // always 400: a proposed step that no longer fits the current decision cannot be taken on.
  { status: 400, pattern: /^This step isn't part of the current Strategy decision\. Refresh to see your current next step\.$/, message: "This step isn't part of the current Strategy decision. Refresh to see your current next step." },
  // NotFoundError("<ModelName>", "<uuid>") -> "<ModelName> not found: <uuid>" --
  // action.service.ts / verification.service.ts / snapshot.service.ts, all 4 domains,
  // always 404 (NotFoundError's fixed status). The entity-name portion is intentionally
  // left as a wildcard (dozens of distinct model names are thrown this way across these
  // domains' services -- see the regression tests), since the risk this module guards
  // against is never repeating whichever name arrives, not enumerating every model.
  // Never shown verbatim: the model name and UUID are internal implementation detail.
  { status: 404, pattern: /^\S+ not found: /, message: "That item couldn't be found. It may have been removed or updated elsewhere. Please refresh and try again." },
  // Duplicate assessment/reporting period (ConflictError in each domain's snapshot.service.ts
  // createXSnapshot). Retrying cannot succeed, so the generic "please try again" would mislead.
  { status: 409, pattern: /^A strategy scenario for this business and assessment period already exists\. Edit it instead of creating a duplicate\.$/, message: "You already have a scenario for these dates. Choose different dates, or evaluate the saved one under “Saved scenarios”." },
  { status: 409, pattern: /^A (?:metric|marketing|cashflow) snapshot for this business and reporting period already exists\. Edit it instead of creating a duplicate\.$/, message: "You already have an entry for these dates. Choose different dates, or use the one you already saved." },
];

function safe(message: string, context: PresentationContext): string {
  return hasOperatorUnsafeContent(message) ? GENERIC_FALLBACK[context] : message;
}

/**
 * The exact, known TypeError messages browsers use for a `fetch()` rejection
 * -- not a substring/keyword test. Matching "fetch" anywhere in a TypeError's
 * message is too broad: it would also match an unrelated bug like
 * `TypeError("fetch is not a function")`, which says nothing about
 * connectivity. Matching one of these exact strings is conservative MESSAGE
 * recognition, not proof of the underlying cause: this module has no way to
 * confirm the network actually failed, only that the exception's text is the
 * one real `fetch()` in `api()` is known to throw on a connection failure. A
 * message that doesn't match is never assumed to be a network failure merely
 * because it wasn't recognized as one -- it gets the same plain fallback an
 * unmatched HTTP response would.
 */
const FETCH_REJECTION_MESSAGES: ReadonlyArray<RegExp> = [
  /^Failed to fetch$/, // Chromium-based browsers
  /^NetworkError when attempting to fetch resource\.$/, // Firefox
];

/**
 * `error` is a genuine `fetch()` rejection only when it is a `TypeError`
 * whose message exactly matches one of `FETCH_REJECTION_MESSAGES` above --
 * these 4 pages' `api()` helper makes no other `TypeError`-throwing call, so
 * this is a narrow, source-grounded check, not a blanket "any TypeError is a
 * network failure" assumption. An unrelated `TypeError` from other client
 * code (e.g. a bug reading an undefined property, or `fetch is not a
 * function`) does not match, and must not be relabeled as a connectivity
 * problem. Known limitation: a browser whose fetch-rejection message isn't
 * one of the two covered here (e.g. Safari's "Load failed") is not
 * recognized by this narrow check and falls to the generic fallback instead
 * of connectivity guidance -- a plain, safe outcome, just not the most
 * specific one available for that browser.
 */
function isFetchNetworkFailure(error: unknown): boolean {
  if (!(error instanceof TypeError)) return false;
  const text = error.message;
  return FETCH_REJECTION_MESSAGES.some((pattern) => pattern.test(text));
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
      // A recognized fetch-rejection message -- no HTTP response was ever received.
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
