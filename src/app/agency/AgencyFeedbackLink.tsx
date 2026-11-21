"use client";

/** Existing public support mailbox (same address as the site footer). */
export const AGENCY_FEEDBACK_EMAIL = "support@opsiq.solutions";

/**
 * Fixed text only. The link never includes the numbers entered, the result, or anything derived from them;
 * the visitor chooses whether to write and send anything.
 */
export const AGENCY_FEEDBACK_HREF = `mailto:${AGENCY_FEEDBACK_EMAIL}?subject=${encodeURIComponent(
  "Agency Decision Diagnostic feedback"
)}&body=${encodeURIComponent(
  "What worked:\n\n\nWhat was missing, unclear or wrong:\n\n\n(Please do not include confidential business figures.)"
)}`;

export function AgencyFeedbackLink({ onInitiate }: { onInitiate: () => void }) {
  return (
    <p className="mt-5 text-sm leading-relaxed">
      Was this useful? Tell us what worked or what was missing.{" "}
      <a
        href={AGENCY_FEEDBACK_HREF}
        onClick={onInitiate}
        className="font-medium text-[var(--primary-text)] underline underline-offset-2"
      >
        Email feedback to {AGENCY_FEEDBACK_EMAIL}
      </a>{" "}
      <span className="text-xs text-muted-foreground">(optional; opens your email app, nothing is sent unless you send it)</span>
    </p>
  );
}
