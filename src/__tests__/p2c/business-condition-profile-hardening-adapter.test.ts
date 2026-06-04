/**
 * P2C-BATCH-4A: PERSISTED-PROFILE → HARDENING ADAPTER CONTRACT TESTS
 *
 * These tests define the contract for deriveHardeningContextFromConditionProfile,
 * which maps the PERSISTED categorical BusinessConditionProfile shape
 * (businessStatus / severityScore / pressure & maturity levels) onto the
 * existing BusinessConditionHardeningContext.
 *
 * It must reuse the established status→hardening mapping, be deterministic,
 * perform no DB/route/AI work, and — critically — must NOT manufacture false
 * confidence when condition data is missing or insufficient.
 *
 * The persisted profile uses these vocabularies (src/domain/constants/statuses.ts):
 * - businessStatus: critical | distressed | challenged | stable | improving | strong
 * - pressure/risk levels: low | medium | high | critical
 * - maturity levels: low | medium | high
 * - severityScore: 1..10 (higher = worse)
 * - engagementId present; workspaceId is NOT stored on the profile.
 */

import { describe, it, expect } from "vitest";
import {
  deriveHardeningContextFromConditionProfile,
  type ConditionProfileLike,
} from "@/domain/business-condition/business-condition";

// Ordering helpers (test-only) for "raises caution / risk" comparisons.
// These rank the production enum values; they do NOT reimplement the mapping.
const RISK_ADJUSTMENT_ORDER = [
  "minimal",
  "low",
  "neutral",
  "medium_high",
  "high",
] as const;

const CAUTION_ORDER = [
  "low",
  "standard",
  "elevated_caution",
  "manual_review_required",
] as const;

// A fully benign baseline profile (strong, low severity, low pressure, high maturity).
const benignProfile: ConditionProfileLike = {
  engagementId: "eng-benign",
  businessStatus: "strong",
  severityScore: 2,
  urgencyLevel: "low",
  cashPressureLevel: "low",
  marginPressureLevel: "low",
  clientConcentrationRisk: "low",
  ownerDependencyRisk: "low",
  keyPersonDependencyRisk: "low",
  processMaturityLevel: "high",
  managementMaturityLevel: "high",
  executionCapacityLevel: "high",
  moralFragilityLevel: "low",
  resilienceLevel: "high",
  growthReadinessLevel: "high",
};

const criticalProfile: ConditionProfileLike = {
  engagementId: "eng-critical",
  businessStatus: "critical",
  severityScore: 9,
  urgencyLevel: "critical",
  cashPressureLevel: "critical",
  marginPressureLevel: "critical",
  clientConcentrationRisk: "high",
  ownerDependencyRisk: "critical",
  keyPersonDependencyRisk: "critical",
  processMaturityLevel: "low",
  managementMaturityLevel: "low",
  executionCapacityLevel: "low",
  moralFragilityLevel: "high",
  resilienceLevel: "low",
  growthReadinessLevel: "low",
};

const distressedProfile: ConditionProfileLike = {
  engagementId: "eng-distressed",
  businessStatus: "distressed",
  severityScore: 7,
  urgencyLevel: "high",
  cashPressureLevel: "high",
  marginPressureLevel: "medium",
  clientConcentrationRisk: "medium",
  ownerDependencyRisk: "high",
  keyPersonDependencyRisk: "medium",
  processMaturityLevel: "medium",
  managementMaturityLevel: "medium",
  executionCapacityLevel: "medium",
  moralFragilityLevel: "medium",
  resilienceLevel: "medium",
  growthReadinessLevel: "medium",
};

const stableProfile: ConditionProfileLike = {
  engagementId: "eng-stable",
  businessStatus: "stable",
  severityScore: 4,
  urgencyLevel: "medium",
  cashPressureLevel: "medium",
  marginPressureLevel: "medium",
  clientConcentrationRisk: "medium",
  ownerDependencyRisk: "medium",
  keyPersonDependencyRisk: "medium",
  processMaturityLevel: "medium",
  managementMaturityLevel: "medium",
  executionCapacityLevel: "medium",
  moralFragilityLevel: "medium",
  resilienceLevel: "medium",
  growthReadinessLevel: "medium",
};

const improvingProfile: ConditionProfileLike = {
  ...benignProfile,
  engagementId: "eng-improving",
  businessStatus: "improving",
  severityScore: 3,
};

describe("P2C-BATCH-4A: Profile → Hardening Adapter", () => {
  // 1. Critical/high-severity profile → maximum hardening, manual review.
  it("maps a critical/high-severity profile to maximum hardening + manual review", () => {
    const ctx = deriveHardeningContextFromConditionProfile(criticalProfile);
    expect(ctx.conditionStatus).toBe("critical");
    expect(ctx.hardeningPressure).toBe("maximum");
    expect(ctx.recommendationRiskAdjustment).toBe("high");
    expect(ctx.confidenceAdjustment).toBe("strongly_reduce");
    expect(ctx.cautionLevel).toBe("manual_review_required");
    expect(ctx.sufficientData).toBe(true);
  });

  // 2. Stressed/elevated-severity profile → high hardening, reduce, elevated caution.
  it("maps a distressed/elevated-severity profile to high hardening + elevated caution", () => {
    const ctx = deriveHardeningContextFromConditionProfile(distressedProfile);
    expect(ctx.conditionStatus).toBe("stressed");
    expect(ctx.hardeningPressure).toBe("high");
    expect(ctx.confidenceAdjustment).toBe("reduce");
    expect(ctx.cautionLevel).toBe("elevated_caution");
  });

  // 3. stable / healthy(improving) / thriving(strong) map to normal/low/minimal.
  it("maps stable/improving/strong profiles to normal/low/minimal pressure", () => {
    const stable = deriveHardeningContextFromConditionProfile(stableProfile);
    expect(stable.conditionStatus).toBe("stable");
    expect(stable.hardeningPressure).toBe("normal");

    const improving = deriveHardeningContextFromConditionProfile(improvingProfile);
    expect(improving.conditionStatus).toBe("healthy");
    expect(improving.hardeningPressure).toBe("low");

    const strong = deriveHardeningContextFromConditionProfile(benignProfile);
    expect(strong.conditionStatus).toBe("thriving");
    expect(strong.hardeningPressure).toBe("minimal");
  });

  // 4. High cash pressure OR high severity raises risk/caution vs a benign profile.
  it("raises risk/caution when cash pressure or severity is high vs benign", () => {
    const benign = deriveHardeningContextFromConditionProfile(benignProfile);

    const highCash = deriveHardeningContextFromConditionProfile({
      ...benignProfile,
      cashPressureLevel: "critical",
    });
    const highSeverity = deriveHardeningContextFromConditionProfile({
      ...benignProfile,
      severityScore: 9,
    });

    const benignRisk = RISK_ADJUSTMENT_ORDER.indexOf(benign.recommendationRiskAdjustment);
    const benignCaution = CAUTION_ORDER.indexOf(benign.cautionLevel);

    expect(
      RISK_ADJUSTMENT_ORDER.indexOf(highCash.recommendationRiskAdjustment)
    ).toBeGreaterThan(benignRisk);
    expect(CAUTION_ORDER.indexOf(highCash.cautionLevel)).toBeGreaterThan(benignCaution);

    expect(
      RISK_ADJUSTMENT_ORDER.indexOf(highSeverity.recommendationRiskAdjustment)
    ).toBeGreaterThan(benignRisk);
  });

  // 5. Owner/key-person/maturity weakness adds reasons and does NOT yield false confidence.
  it("adds reasons for dependency/maturity weakness without false confidence", () => {
    const weak = deriveHardeningContextFromConditionProfile({
      ...benignProfile,
      businessStatus: "stable",
      severityScore: 5,
      ownerDependencyRisk: "critical",
      keyPersonDependencyRisk: "critical",
      processMaturityLevel: "low",
      executionCapacityLevel: "low",
      resilienceLevel: "low",
    });

    expect(weak.reasons.length).toBeGreaterThan(0);
    const joined = weak.reasons.join(" | ").toLowerCase();
    expect(joined).toMatch(/owner|key-person|maturity|execution|resilience/);

    // Must not look confident/safe despite the weak signals.
    expect(["minimal", "low"]).not.toContain(weak.hardeningPressure);
    expect(["maintain", "maintain_or_increase"]).not.toContain(weak.confidenceAdjustment);
  });

  // 6. Missing/null profile → caution-preserving context (no false confidence).
  it("returns a caution-preserving context for a missing/null profile", () => {
    for (const input of [null, undefined, {} as ConditionProfileLike]) {
      const ctx = deriveHardeningContextFromConditionProfile(input);
      expect(ctx.sufficientData).toBe(false);
      expect(ctx.hardeningPressure).not.toBe("low");
      expect(ctx.hardeningPressure).not.toBe("minimal");
      expect(ctx.confidenceAdjustment).not.toBe("maintain_or_increase");
      expect(ctx.cautionLevel).not.toBe("low");
      expect(ctx.reasons.length).toBeGreaterThan(0);
      expect(ctx.reasons.join(" ").toLowerCase()).toContain("insufficient");
    }
  });

  // 7. Deterministic: same input → identical output.
  it("produces identical output for identical input", () => {
    const a = deriveHardeningContextFromConditionProfile(distressedProfile);
    const b = deriveHardeningContextFromConditionProfile(distressedProfile);
    expect(a).toEqual(b);

    const c = deriveHardeningContextFromConditionProfile(null);
    const d = deriveHardeningContextFromConditionProfile(null);
    expect(c).toEqual(d);
  });

  // 8. engagementId is surfaced in metadata when present (workspaceId is not stored on the profile).
  it("surfaces engagementId from the profile and does not invent workspaceId", () => {
    const ctx = deriveHardeningContextFromConditionProfile(criticalProfile);
    expect(ctx.engagementId).toBe("eng-critical");
    // The persisted profile has no workspaceId; the adapter must not fabricate one.
    expect((ctx as Record<string, unknown>).workspaceId).toBeUndefined();

    const nullCtx = deriveHardeningContextFromConditionProfile(null);
    expect(nullCtx.engagementId ?? null).toBeNull();
  });

  // Invariant: the exposed band score is consistent with healthScoreToStatus.
  it("keeps conditionScore consistent with the derived conditionStatus band", () => {
    const ctx = deriveHardeningContextFromConditionProfile(distressedProfile);
    expect(typeof ctx.conditionScore).toBe("number");
    // stressed band representative score must sit in the stressed range [20,40).
    expect(ctx.conditionScore).toBeGreaterThanOrEqual(20);
    expect(ctx.conditionScore).toBeLessThan(40);
  });
});
