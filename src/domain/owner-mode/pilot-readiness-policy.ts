/**
 * PILOT REALITY GUARDRAIL — a pure, testable policy that prevents OpsIQ from OVERCLAIMING pilot readiness.
 *
 * OpsIQ can be proven at several honest levels (simulation → DB/browser → full mobile → shadow pilot →
 * live pilot → live outcome → public SaaS). Each level has a REQUIRED evidence set, and — critically — a set
 * of claims it is FORBIDDEN to make. Simulation / DB-browser / full-mobile proof can never claim a live
 * outcome or a profit improvement; only real before/after business metrics over a real time window can.
 *
 * This module does NOT replace `readiness-score.ts` (which scores whether a specific business is pilot-ready).
 * It governs the SYSTEM-LEVEL readiness STATE and the claims it licenses. Pure: no DB, no Date.now, no model.
 */

/** The honest system-level readiness ladder (ascending strength). */
export const READINESS_STATES = [
  "SIMULATION_PROVEN",
  "DB_BROWSER_PROVEN",
  "FULL_MOBILE_PROVEN",
  "SHADOW_PILOT_READY",
  "LIVE_PILOT_RUNNING",
  "LIVE_OUTCOME_PROVEN",
  "PUBLIC_SAAS_READY",
] as const;
export type ReadinessState = (typeof READINESS_STATES)[number];

/** Evidence actually available. Every flag defaults false — absence never inflates a claim. */
export interface ReadinessEvidence {
  hasSimulationProof: boolean;        // scenario/behavioural proof (in-memory)
  hasDbBrowserProof: boolean;         // DB-backed + real desktop browser proof
  hasFullMobileProof: boolean;        // all counted scenarios proven on real mobile
  hasShadowPilotIntake: boolean;      // a real business's partial data captured (shadow pilot)
  hasLiveBusinessData: boolean;       // real, current business operating data
  hasRealDates: boolean;              // real calendar time window (not a fixture clock)
  hasBeforeAfterMetrics: boolean;     // actual before/after business metrics over that window
  ownerWaiver: boolean;               // explicit owner waiver for public-SaaS without live outcome
  /** Explicit public-SaaS go decision. Public-SaaS is never auto-derived from a single live outcome. */
  publicSaasApproved: boolean;
}

/** Claims a readiness level might assert — each must be licensed by evidence. */
export interface ReadinessClaims {
  /** "A live business outcome was observed." */
  liveOutcome: boolean;
  /** "Profit / margin / cash improved." */
  profitImprovement: boolean;
  /** "A live pilot result was produced." */
  liveResult: boolean;
  /** "Ready to sell as public SaaS." */
  publicSaas: boolean;
}

export const NO_CLAIMS: ReadinessClaims = { liveOutcome: false, profitImprovement: false, liveResult: false, publicSaas: false };

/** What evidence each state REQUIRES to be legitimately claimed. */
const EVIDENCE_REQUIRED: Record<ReadinessState, (e: ReadinessEvidence) => boolean> = {
  SIMULATION_PROVEN: (e) => e.hasSimulationProof,
  DB_BROWSER_PROVEN: (e) => e.hasSimulationProof && e.hasDbBrowserProof,
  FULL_MOBILE_PROVEN: (e) => e.hasDbBrowserProof && e.hasFullMobileProof,
  SHADOW_PILOT_READY: (e) => e.hasDbBrowserProof && e.hasShadowPilotIntake,
  LIVE_PILOT_RUNNING: (e) => e.hasLiveBusinessData && e.hasRealDates,
  LIVE_OUTCOME_PROVEN: (e) => e.hasLiveBusinessData && e.hasRealDates && e.hasBeforeAfterMetrics,
  // Public-SaaS needs an EXPLICIT go decision AND (a proven live outcome OR an explicit owner waiver). It is
  // never auto-derived from a single live outcome, so `highestSupportedState` stops at LIVE_OUTCOME_PROVEN
  // until the owner explicitly approves shipping publicly.
  PUBLIC_SAAS_READY: (e) => e.publicSaasApproved && ((e.hasLiveBusinessData && e.hasRealDates && e.hasBeforeAfterMetrics) || e.ownerWaiver),
};

/** What each state is LICENSED to claim. Simulation/DB/mobile/shadow license NO live/profit claim. */
const CLAIMS_LICENSED: Record<ReadinessState, ReadinessClaims> = {
  SIMULATION_PROVEN: { ...NO_CLAIMS },
  DB_BROWSER_PROVEN: { ...NO_CLAIMS },
  FULL_MOBILE_PROVEN: { ...NO_CLAIMS },
  SHADOW_PILOT_READY: { ...NO_CLAIMS },
  LIVE_PILOT_RUNNING: { ...NO_CLAIMS, liveResult: true }, // running, but not yet an outcome
  LIVE_OUTCOME_PROVEN: { liveOutcome: true, profitImprovement: true, liveResult: true, publicSaas: false },
  PUBLIC_SAAS_READY: { liveOutcome: true, profitImprovement: true, liveResult: true, publicSaas: true },
};

export interface ReadinessDecision {
  allowed: boolean;
  state: ReadinessState;
  licensedClaims: ReadinessClaims;
  reasons: string[];
}

/**
 * Validate that a claimed readiness STATE is supported by the available evidence. Returns the licensed
 * claims for that state (so callers can never assert a claim the state does not license).
 */
export function assertReadinessClaim(state: ReadinessState, evidence: ReadinessEvidence): ReadinessDecision {
  const reasons: string[] = [];
  const supported = EVIDENCE_REQUIRED[state](evidence);
  if (!supported) reasons.push(`evidence does not support ${state}`);
  return {
    allowed: supported,
    state,
    licensedClaims: supported ? CLAIMS_LICENSED[state] : { ...NO_CLAIMS },
    reasons,
  };
}

/** The HIGHEST state the evidence honestly supports (never overshoots). */
export function highestSupportedState(evidence: ReadinessEvidence): ReadinessState {
  let best: ReadinessState = "SIMULATION_PROVEN";
  let found = false;
  for (const s of READINESS_STATES) {
    if (EVIDENCE_REQUIRED[s](evidence)) { best = s; found = true; }
  }
  // If not even simulation is proven, there is no honest state to claim.
  return found ? best : "SIMULATION_PROVEN";
}

/** Is `claim` licensed at `state` given `evidence`? False if the state is unsupported OR does not license it. */
export function canClaim(state: ReadinessState, claim: keyof ReadinessClaims, evidence: ReadinessEvidence): boolean {
  const d = assertReadinessClaim(state, evidence);
  return d.allowed && d.licensedClaims[claim];
}

/** A live-outcome / profit claim is licensed ONLY with real before/after metrics over a real window. */
export function canClaimLiveOutcome(evidence: ReadinessEvidence): boolean {
  return evidence.hasLiveBusinessData && evidence.hasRealDates && evidence.hasBeforeAfterMetrics;
}
