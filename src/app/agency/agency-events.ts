import { track } from "@vercel/analytics";

/**
 * Funnel events for /agency. Privacy-minimal by construction:
 * - the only event names are the three below;
 * - the only property ever sent is `location` ("header" | "lower") on a CTA click;
 * - nothing the visitor typed, and nothing derived from it, can be passed in (the helper accepts no free-form data).
 * Events go through the same Vercel Web Analytics client (and `beforeSend` URL filter) as page views.
 */
export type AgencyEventName = "AGENCY_DIAGNOSTIC_START" | "AGENCY_DIAGNOSTIC_COMPLETE" | "AGENCY_CTA_CLICK";
export type AgencyCtaLocation = "header" | "lower";

export function trackAgencyEvent(name: "AGENCY_DIAGNOSTIC_START" | "AGENCY_DIAGNOSTIC_COMPLETE"): void;
export function trackAgencyEvent(name: "AGENCY_CTA_CLICK", location: AgencyCtaLocation): void;
export function trackAgencyEvent(name: AgencyEventName, location?: AgencyCtaLocation): void {
  try {
    if (name === "AGENCY_CTA_CLICK") track(name, { location: location === "header" ? "header" : "lower" });
    else track(name);
  } catch {
    // Analytics must never affect the diagnostic.
  }
}
