"use client";

import { useEffect } from "react";
import { trackAgencyEvent } from "./agency-events";

/** The labels of the shared beta/sign-up call to action, in either admission mode. */
const CTA_LABEL = /^\s*(request beta access|start free)\s*$/i;

/**
 * Fires AGENCY_CTA_CLICK when the visitor actually clicks the page's beta/sign-up call to action
 * (the shared PublicBetaCta in the header or the closing panel). Renders nothing; the shared CTA
 * components stay untouched. Sends only the CTA's position, never page or form content.
 */
export function AgencyCtaTracker() {
  useEffect(() => {
    function onClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const control = target.closest("a, button");
      if (!control || !CTA_LABEL.test(control.textContent ?? "")) return;
      trackAgencyEvent("AGENCY_CTA_CLICK", control.closest("header") ? "header" : "lower");
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);
  return null;
}
