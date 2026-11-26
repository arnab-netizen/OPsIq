import { track } from "@vercel/analytics";

/**
 * Funnel events for /agency. Privacy-minimal by construction:
 * - the only event names are the five below;
 * - the only property ever sent is `location` ("header" | "lower") on a CTA click;
 * - nothing the visitor typed, and nothing derived from it, can be passed in (the helper accepts no free-form data).
 *
 * What each event can and cannot show (Vercel Web Analytics counts events, not people):
 * - AGENCY_DIAGNOSTIC_START: a visitor changed at least one input (at most once per page load).
 * - AGENCY_DIAGNOSTIC_COMPLETE_EXAMPLE: a valid result was produced while every field still equalled the illustrative
 *   example values (at most once per page load). It shows the example was run, not that a business was assessed.
 * - AGENCY_DIAGNOSTIC_COMPLETE_EDITED: a valid result was produced while at least one field differed from the example
 *   (at most once per page load). Changed numbers are NOT proof of genuine business data.
 * - AGENCY_FEEDBACK_CLICK: the visitor clicked the optional feedback email link (at most once per page load). Clicking
 *   opens the visitor's mail client; it does not show that a message was written or sent.
 * - AGENCY_CTA_CLICK: the visitor clicked the beta/sign-up call to action.
 * Events carry no identifier, so unique visitors, returning visitors and "real business" completions are not derivable.
 * Events go through the same Vercel Web Analytics client (and `beforeSend` URL filter) as page views.
 */
export type AgencyEventName =
  | "AGENCY_DIAGNOSTIC_START"
  | "AGENCY_DIAGNOSTIC_COMPLETE_EXAMPLE"
  | "AGENCY_DIAGNOSTIC_COMPLETE_EDITED"
  | "AGENCY_FEEDBACK_CLICK"
  | "AGENCY_CTA_CLICK";
export type AgencyCtaLocation = "header" | "lower";

export function trackAgencyEvent(
  name: "AGENCY_DIAGNOSTIC_START" | "AGENCY_DIAGNOSTIC_COMPLETE_EXAMPLE" | "AGENCY_DIAGNOSTIC_COMPLETE_EDITED" | "AGENCY_FEEDBACK_CLICK"
): void;
export function trackAgencyEvent(name: "AGENCY_CTA_CLICK", location: AgencyCtaLocation): void;
export function trackAgencyEvent(name: AgencyEventName, location?: AgencyCtaLocation): void {
  try {
    if (name === "AGENCY_CTA_CLICK") track(name, { location: location === "header" ? "header" : "lower" });
    else track(name);
  } catch {
    // Analytics must never affect the diagnostic.
  }
}
