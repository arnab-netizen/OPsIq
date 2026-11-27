import { track } from "@vercel/analytics";
import type { AnalyticsToolId } from "@/services/tools/agency/registry";

/**
 * Funnel events for the public calculators. Privacy-minimal by construction:
 * - the event names are the five below and nothing else;
 * - the only properties are `calculator` (an id from a fixed list) and, for beta CTA clicks, `location` (one of three fixed values);
 * - the helper accepts no free-form data, so no number, label, note or other visitor input can reach the provider;
 * - start and complete are sent at most once per calculator per page load.
 * Events go through the same Vercel Web Analytics client (and its `beforeSend` URL filter) as page views.
 */
export const CALCULATOR_EVENT_NAMES = [
  "calculator_start",
  "calculator_complete",
  "calculator_related_tool_click",
  "calculator_agency_diagnostic_click",
  "agency_beta_cta_click",
] as const;
export type CalculatorEventName = (typeof CALCULATOR_EVENT_NAMES)[number];

export const CALCULATOR_ANALYTICS_IDS: ReadonlyArray<AnalyticsToolId> = [
  "client-profitability",
  "retainer-pricing",
  "utilization",
  "scope-creep",
  "hourly-rate",
  "capacity",
  "profit-margin",
  "hub",
];

export const CTA_LOCATIONS = ["header", "result", "lower"] as const;
export type CalculatorCtaLocation = (typeof CTA_LOCATIONS)[number];

export type CalculatorEventPayload = { name: CalculatorEventName; props: { calculator: AnalyticsToolId; location?: CalculatorCtaLocation } };

/** Pure and testable: returns the exact payload that would be sent, or null when anything is outside the allowlists. */
export function buildCalculatorEventPayload(name: string, calculator: string, location?: string): CalculatorEventPayload | null {
  if (!(CALCULATOR_EVENT_NAMES as ReadonlyArray<string>).includes(name)) return null;
  if (!(CALCULATOR_ANALYTICS_IDS as ReadonlyArray<string>).includes(calculator)) return null;
  const base = { name: name as CalculatorEventName, props: { calculator: calculator as AnalyticsToolId } };
  if (name === "agency_beta_cta_click") {
    if (!(CTA_LOCATIONS as ReadonlyArray<string>).includes(location ?? "")) return null;
    return { ...base, props: { ...base.props, location: location as CalculatorCtaLocation } };
  }
  return base;
}

const sentOnce = new Set<string>();

/** Test helper only. */
export function resetCalculatorEventDedupe(): void {
  sentOnce.clear();
}

export function trackCalculatorEvent(name: CalculatorEventName, calculator: AnalyticsToolId, location?: CalculatorCtaLocation): boolean {
  try {
    const payload = buildCalculatorEventPayload(name, calculator, location);
    if (!payload) return false;
    if (name === "calculator_start" || name === "calculator_complete") {
      const key = `${name}:${calculator}`;
      if (sentOnce.has(key)) return false;
      sentOnce.add(key);
    }
    track(payload.name, payload.props);
    return true;
  } catch {
    // Analytics must never affect a calculator.
    return false;
  }
}
