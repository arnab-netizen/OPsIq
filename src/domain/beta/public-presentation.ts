/**
 * Public-beta PRESENTATION — copy and call-to-action derived from the admission mode.
 *
 * This is display only. It is not an admission decision: POST /api/auth/signup re-checks admission
 * (canAdmitSignup, the single authority) on every request, and an unknown, failed or stale mode here falls
 * back to the INVITE_ONLY copy (the stricter, previously-live wording). "Start free" is shown only when the
 * mode is OPEN_BETA; nothing in this file can open or close registration.
 */
import type { AdmissionMode } from "@/services/beta/platform-settings.service";

export interface PublicBetaPresentation {
  /** True only under OPEN_BETA: the primary call to action goes straight to /signup. */
  openRegistration: boolean;
  primaryCtaLabel: string;
  heroBadge: string;
  offerDescription: string;
  aboutSentence: string;
  resourceLine: string;
  /** "a controlled, invite-only beta" | "a free beta" — for legal/notice pages. */
  betaPhrase: string;
  betaNoticeHeading: string;
}

const INVITE_ONLY_PRESENTATION: PublicBetaPresentation = {
  openRegistration: false,
  primaryCtaLabel: "Request beta access",
  heroBadge: "Free controlled beta · no credit card · access by invitation",
  offerDescription: "Free invite-only beta, no credit card required",
  aboutSentence: "Currently free, in an invite-only controlled beta, no credit card required.",
  resourceLine: "Free during the invite-only beta, no credit card required.",
  betaPhrase: "a controlled, invite-only beta",
  betaNoticeHeading: "OpsIQ is in a controlled, invite-only beta",
};

const OPEN_BETA_PRESENTATION: PublicBetaPresentation = {
  openRegistration: true,
  primaryCtaLabel: "Start free",
  heroBadge: "Free beta · no credit card · sign up in a minute",
  offerDescription: "Free beta, no credit card required",
  aboutSentence: "Currently free, in beta, no credit card required.",
  resourceLine: "Free during the beta, no credit card required.",
  betaPhrase: "a free beta",
  betaNoticeHeading: "OpsIQ is in beta",
};

export function presentationForAdmissionMode(mode: AdmissionMode | string | null | undefined): PublicBetaPresentation {
  return mode === "OPEN_BETA" ? OPEN_BETA_PRESENTATION : INVITE_ONLY_PRESENTATION;
}
