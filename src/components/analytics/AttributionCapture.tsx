"use client";

/**
 * Site-wide, consent-gated UTM attribution capture.
 *
 * Mounted once in the root layout (every route). On every mount and every client-side navigation
 * it asks src/lib/attribution/attribution-store.ts to capture the current page into first-touch
 * (set once) and last-touch (replaced on each fresh campaign visit) — but that call is a strict
 * no-op unless the SAME analytics consent used for Microsoft Clarity (see
 * src/lib/analytics/clarity-policy.ts and ClarityConsent.tsx) is currently "granted". Nothing is
 * ever written before that choice exists, and the effect below re-runs the instant the choice
 * changes — including a grant that happens AFTER this page already loaded, so a visitor who lands
 * on a campaign link and only then accepts analytics while still on that same page is still
 * captured (retroactive capture), not just visitors who had already granted consent on an earlier
 * visit.
 *
 * Deliberately NOT restricted to Clarity's own (narrower) route allowlist: Clarity never runs
 * outside the marketing site for its own full-document-navigation privacy boundary, but a campaign
 * link can land a visitor directly on /signup, /login, or another public auth page, and that visit
 * still needs to be captured. The only routes excluded here are the private, signed-in product and
 * internal/API surfaces, where there is no acquisition funnel to attribute.
 *
 * This component renders nothing and makes no network request of its own.
 */
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { getConsentSnapshot, getServerConsentSnapshot, subscribeToConsent } from "./ClarityConsent";
import { captureAttributionOnConsent, clearStoredAttribution } from "@/lib/attribution/attribution-store";

/** The private, signed-in product and internal/API surfaces — never relevant to acquisition attribution. */
const PRIVATE_APP_PREFIXES = [
  "/owner",
  "/admin",
  "/dashboard",
  "/api",
  "/onboarding",
  "/quick-start",
  "/my-day",
  "/operator",
  "/clients",
  "/control",
  "/decisions",
  "/entity",
  "/calibration",
  "/value",
  "/_next",
] as const;

export function isAttributionEligiblePath(pathname: unknown): boolean {
  if (typeof pathname !== "string" || pathname.length === 0 || pathname[0] !== "/") return false;
  return !PRIVATE_APP_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function AttributionCapture() {
  const pathname = usePathname();
  const consent = useSyncExternalStore(subscribeToConsent, getConsentSnapshot, getServerConsentSnapshot);

  useEffect(() => {
    if (!isAttributionEligiblePath(pathname)) return;
    if (consent === "granted") {
      captureAttributionOnConsent(window);
    } else if (consent === "denied") {
      clearStoredAttribution(window);
    }
    // consent === null (no choice yet) or undefined (not hydrated yet): do nothing and wait.
  }, [pathname, consent]);

  return null;
}
