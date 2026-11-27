"use client";

import { useEffect } from "react";
import type { AnalyticsToolId } from "@/services/tools/agency/registry";
import { trackCalculatorEvent, type CalculatorCtaLocation } from "@/lib/analytics/calculator-events";

const CTA_LABEL = /^\s*(request beta access|start free)\s*$/i;

/**
 * Renders nothing. Listens for clicks on the page and reports only:
 *  - a click on a link marked data-calc-link="related" or "agency" (calculator_related_tool_click / calculator_agency_diagnostic_click);
 *  - a click on the shared beta/sign-up call to action (agency_beta_cta_click) with its position: header, result, or lower.
 * Only the calculator id and a fixed position are ever sent. No page content, input or result is read.
 */
export function CalculatorEventsTracker({ calculator }: { calculator: AnalyticsToolId }) {
  useEffect(() => {
    function onClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest("a[data-calc-link]");
      if (link) {
        const kind = link.getAttribute("data-calc-link");
        if (kind === "agency") trackCalculatorEvent("calculator_agency_diagnostic_click", calculator);
        else if (kind === "related") trackCalculatorEvent("calculator_related_tool_click", calculator);
        return;
      }
      const control = target.closest("a, button");
      if (!control || !CTA_LABEL.test(control.textContent ?? "")) return;
      const location: CalculatorCtaLocation = control.closest("header") ? "header" : control.closest("[data-calc-cta=\"result\"]") ? "result" : "lower";
      trackCalculatorEvent("agency_beta_cta_click", calculator, location);
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [calculator]);
  return null;
}
