/**
 * Owner first-run — which evidence routes the "Let's understand your business" step shows. Pure.
 *
 * Both routes end at the SAME canonical evidence and the SAME diagnosis (the router's NEEDS_DIAGNOSIS state); this module only
 * decides what to SHOW while evidence is still missing. It is derived entirely from persisted facts (the QuickBooks connection
 * state the server reports and the server-decided offer), never from a browser flag, so leaving and returning resumes correctly.
 *
 *   QuickBooks        OFFER        not connected, and the server offers it    -> a Connect choice next to "Enter a few numbers"
 *                     IN_PROGRESS  connected, first import still running      -> import progress; the read starts by itself
 *                     ATTENTION    connected but needs the owner (reconnect,  -> the QuickBooks card, with manual as the fallback
 *                                  error, imported without enough for a read)
 *                     HIDDEN       not offered and not connected              -> manual only; no QuickBooks button at all
 *   Manual            always available (the minimum-evidence form).
 */
import type { QboOwnerState } from "@/domain/quickbooks/qbo-owner-status";
import type { FirstRunState } from "./first-run-router";

export type QuickBooksRole = "OFFER" | "IN_PROGRESS" | "ATTENTION" | "HIDDEN";

export interface FirstRunSourceFacts {
  /** The server's fail-closed decision on offering a NEW QuickBooks connection here. */
  quickBooksOffered: boolean;
  /** The persisted QuickBooks owner state for this business. */
  quickBooksState: QboOwnerState;
}

export interface FirstRunSourceView {
  quickBooks: QuickBooksRole;
  /** The minimum-evidence form is always an available route. */
  manual: true;
  /** True while the page should keep re-reading the persisted first-run state (bounded by the caller). */
  poll: boolean;
}

export function resolveFirstRunSources(facts: FirstRunSourceFacts): FirstRunSourceView {
  switch (facts.quickBooksState) {
    case "CONNECTING":
    case "IMPORTING":
      return { quickBooks: "IN_PROGRESS", manual: true, poll: true };
    case "CONNECTED":
    case "STALE":
    case "SYNC_ERROR":
    case "REAUTH_REQUIRED":
      // Connected, yet the evidence is still not enough for a first read (otherwise the router would have left this step).
      return { quickBooks: "ATTENTION", manual: true, poll: false };
    case "NOT_CONNECTED":
    case "DISCONNECTED":
      return { quickBooks: facts.quickBooksOffered ? "OFFER" : "HIDDEN", manual: true, poll: false };
  }
}

/**
 * After the QuickBooks round trip: an owner whose first read is still pending (no sufficient evidence yet, or evidence but no
 * diagnosis) is returned to the first-run surface, where the import is shown and the read starts by itself. Everyone else keeps
 * the existing My Business landing. Derived from the router's persisted-fact state, never from where the owner started.
 */
export function landingForFirstRunState(state: FirstRunState): "first_run" | "data" {
  return state === "NEEDS_EVIDENCE" || state === "NEEDS_DIAGNOSIS" ? "first_run" : "data";
}
