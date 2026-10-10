"use client";

/**
 * The public primary call to action. Under OPEN_BETA it is a plain link to /signup ("Start free"); in every
 * other case (INVITE_ONLY, CLOSED, WAITLIST, unknown, fetch failed) it is the existing request-access flow.
 * Display only — the server decides every real signup. `initialMode` lets a server-rendered page (the
 * homepage) render the right button on first paint; statically generated pages resolve it after mount.
 */
import Link from "next/link";
import { BetaAccessCta } from "@/components/landing/BetaAccessCta";
import { usePublicAdmissionMode } from "@/lib/public-admission-client";
import { presentationForAdmissionMode } from "@/domain/beta/public-presentation";
import { reportAnonymousProductEvent } from "@/lib/analytics/product-event-client";

export function PublicBetaCta({ triggerClassName, initialMode = null }: { triggerClassName: string; initialMode?: string | null }) {
  const mode = usePublicAdmissionMode(initialMode);
  const presentation = presentationForAdmissionMode(mode);
  if (presentation.openRegistration) {
    return (
      <Link
        href="/signup"
        className={triggerClassName}
        data-testid="start-free-cta"
        onClick={() => reportAnonymousProductEvent("public_start_free_clicked")}
      >
        {presentation.primaryCtaLabel}
      </Link>
    );
  }
  return <BetaAccessCta triggerClassName={triggerClassName} />;
}

/**
 * Text that differs by admission mode (e.g. "invite-only beta" vs "beta"). Display only; same fallback rules.
 * `field` is a plain string key, not a function: this component is rendered from Server Components, and
 * functions cannot cross the server/client boundary.
 */
export type PublicBetaTextField = "heroBadge" | "offerDescription" | "aboutSentence" | "resourceLine" | "betaPhrase" | "betaNoticeHeading";

export function PublicBetaText({ field, initialMode = null }: { field: PublicBetaTextField; initialMode?: string | null }) {
  return <>{presentationForAdmissionMode(usePublicAdmissionMode(initialMode))[field]}</>;
}

/** Renders `open` under OPEN_BETA and `invite` otherwise (initial render, INVITE_ONLY, CLOSED, WAITLIST, fetch failure). */
export function PublicBetaSwitch({ open, invite }: { open: React.ReactNode; invite: React.ReactNode }) {
  return <>{presentationForAdmissionMode(usePublicAdmissionMode(null)).openRegistration ? open : invite}</>;
}
