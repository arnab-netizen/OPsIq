/**
 * PILOT REALITY GUARDRAIL (§10) — proves the readiness-state policy prevents overclaiming: simulation /
 * DB-browser / full-mobile / shadow-pilot evidence can NEVER license a live-outcome or profit-improvement
 * claim; only real before/after metrics over a real window can; public SaaS is blocked without live outcome
 * (or an explicit owner waiver). The policy is code-enforced, not markdown.
 */
import { describe, it, expect } from "vitest";
import {
  assertReadinessClaim, highestSupportedState, canClaim, canClaimLiveOutcome,
  type ReadinessEvidence,
} from "@/domain/owner-mode/pilot-readiness-policy";

const NONE: ReadinessEvidence = {
  hasSimulationProof: false, hasDbBrowserProof: false, hasFullMobileProof: false, hasShadowPilotIntake: false,
  hasLiveBusinessData: false, hasRealDates: false, hasBeforeAfterMetrics: false, ownerWaiver: false, publicSaasApproved: false,
};
const ev = (over: Partial<ReadinessEvidence>): ReadinessEvidence => ({ ...NONE, ...over });

// The evidence OpsIQ actually has today: simulation + DB/browser + full mobile, but NO live business data.
const PROVEN_NO_LIVE = ev({ hasSimulationProof: true, hasDbBrowserProof: true, hasFullMobileProof: true });

describe("pilot reality guardrail (§10)", () => {
  it("1. a simulation-only state cannot become LIVE_OUTCOME_PROVEN", () => {
    expect(assertReadinessClaim("LIVE_OUTCOME_PROVEN", ev({ hasSimulationProof: true })).allowed).toBe(false);
    expect(highestSupportedState(ev({ hasSimulationProof: true }))).toBe("SIMULATION_PROVEN");
  });

  it("2. chaos replay (DB/browser) cannot claim profit improvement", () => {
    expect(canClaim("DB_BROWSER_PROVEN", "profitImprovement", ev({ hasSimulationProof: true, hasDbBrowserProof: true }))).toBe(false);
  });

  it("3. full mobile proof cannot claim profit improvement or a live outcome", () => {
    expect(canClaim("FULL_MOBILE_PROVEN", "profitImprovement", PROVEN_NO_LIVE)).toBe(false);
    expect(canClaim("FULL_MOBILE_PROVEN", "liveOutcome", PROVEN_NO_LIVE)).toBe(false);
    expect(highestSupportedState(PROVEN_NO_LIVE)).toBe("FULL_MOBILE_PROVEN");
  });

  it("4. shadow pilot requires real business intake markers", () => {
    // DB/browser proof alone does NOT make shadow pilot ready — real partial intake is required.
    expect(assertReadinessClaim("SHADOW_PILOT_READY", ev({ hasSimulationProof: true, hasDbBrowserProof: true })).allowed).toBe(false);
    expect(assertReadinessClaim("SHADOW_PILOT_READY", ev({ hasDbBrowserProof: true, hasShadowPilotIntake: true })).allowed).toBe(true);
    // and shadow pilot still cannot claim a live result.
    expect(canClaim("SHADOW_PILOT_READY", "liveResult", ev({ hasDbBrowserProof: true, hasShadowPilotIntake: true }))).toBe(false);
  });

  it("5. live outcome requires actual before/after metrics over a real window", () => {
    expect(canClaimLiveOutcome(ev({ hasLiveBusinessData: true, hasRealDates: true }))).toBe(false); // no metrics
    expect(canClaimLiveOutcome(ev({ hasLiveBusinessData: true, hasBeforeAfterMetrics: true }))).toBe(false); // no real dates
    expect(canClaimLiveOutcome(ev({ hasLiveBusinessData: true, hasRealDates: true, hasBeforeAfterMetrics: true }))).toBe(true);
    expect(assertReadinessClaim("LIVE_OUTCOME_PROVEN", ev({ hasLiveBusinessData: true, hasRealDates: true, hasBeforeAfterMetrics: true })).allowed).toBe(true);
  });

  it("6. public SaaS is blocked without live-outcome evidence (or an explicit owner waiver) AND an explicit go decision", () => {
    expect(assertReadinessClaim("PUBLIC_SAAS_READY", PROVEN_NO_LIVE).allowed).toBe(false);
    // live outcome alone is NOT enough — public SaaS needs an explicit go decision too (never auto-derived).
    expect(assertReadinessClaim("PUBLIC_SAAS_READY", ev({ hasLiveBusinessData: true, hasRealDates: true, hasBeforeAfterMetrics: true })).allowed).toBe(false);
    expect(assertReadinessClaim("PUBLIC_SAAS_READY", ev({ hasLiveBusinessData: true, hasRealDates: true, hasBeforeAfterMetrics: true, publicSaasApproved: true })).allowed).toBe(true);
    expect(assertReadinessClaim("PUBLIC_SAAS_READY", ev({ ownerWaiver: true, publicSaasApproved: true })).allowed).toBe(true); // explicit waiver + go
  });

  it("7. the dashboard/report can only surface the HONEST highest supported state", () => {
    expect(highestSupportedState(NONE)).toBe("SIMULATION_PROVEN"); // nothing proven ⇒ no live claim
    expect(highestSupportedState(ev({ hasSimulationProof: true, hasDbBrowserProof: true }))).toBe("DB_BROWSER_PROVEN");
    expect(highestSupportedState(ev({ hasDbBrowserProof: true, hasShadowPilotIntake: true }))).toBe("SHADOW_PILOT_READY");
    expect(highestSupportedState(ev({ hasLiveBusinessData: true, hasRealDates: true, hasBeforeAfterMetrics: true }))).toBe("LIVE_OUTCOME_PROVEN");
  });

  it("8. the policy prevents manual overclaim — any state unsupported by evidence returns no licensed claims", () => {
    for (const state of ["LIVE_PILOT_RUNNING", "LIVE_OUTCOME_PROVEN", "PUBLIC_SAAS_READY"] as const) {
      const d = assertReadinessClaim(state, PROVEN_NO_LIVE);
      expect(d.allowed, state).toBe(false);
      expect(d.licensedClaims.liveOutcome).toBe(false);
      expect(d.licensedClaims.profitImprovement).toBe(false);
      expect(d.licensedClaims.publicSaas).toBe(false);
    }
  });

  it("current OpsIQ evidence (this repo) honestly tops out at FULL_MOBILE_PROVEN — never a live/profit claim", () => {
    expect(highestSupportedState(PROVEN_NO_LIVE)).toBe("FULL_MOBILE_PROVEN");
    expect(canClaimLiveOutcome(PROVEN_NO_LIVE)).toBe(false);
  });
});
