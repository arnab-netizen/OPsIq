"use client";

import { OPEN_ANALYTICS_PREFERENCES_EVENT } from "@/components/analytics/ClarityConsent";

/**
 * Reopens the analytics choice (Allow analytics / Decline) so a visitor can change their mind at any time.
 * Rendered only where analytics is configured and the page is a public page; it holds no state.
 */
export function AnalyticsPreferencesButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      className={className ?? "text-[var(--primary-text)] hover:underline"}
      data-testid="analytics-preferences"
      onClick={() => window.dispatchEvent(new Event(OPEN_ANALYTICS_PREFERENCES_EVENT))}
    >
      Analytics preferences
    </button>
  );
}
