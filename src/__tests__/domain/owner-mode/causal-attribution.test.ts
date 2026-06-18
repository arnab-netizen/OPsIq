import { describe, it, expect } from "vitest";
import {
  ATTRIBUTION_BLOCKS_LEARNING,
  ATTRIBUTION_REQUIRES_HUMAN_REVIEW,
  ATTRIBUTION_LEARNING_CEILING,
  classifyCausalAttribution,
  attributionAllowsLearning,
  type CausalAttributionInput,
} from "@/domain/owner-mode/causal-attribution";

const WS = "00000000-0000-0000-0000-000000000001";
const BIZ = "00000000-0000-0000-0000-000000000002";

function base(overrides: Partial<CausalAttributionInput> = {}): CausalAttributionInput {
  return {
    workspaceId: WS,
    businessId: BIZ,
    actionId: "action-001",
    attributionClass: "likely_caused",
    hasTemporalProximity: true,
    hasControlledComparison: false,
    hasOwnerTestimony: true,
    hasExternalEventDuringPeriod: false,
    hasConfoundingFactors: false,
    attributionReason:
      "Supplier renegotiation preceded the cost reduction by 2 weeks; no external events detected.",
    ...overrides,
  };
}

function correlationOnly(overrides: Partial<CausalAttributionInput> = {}): CausalAttributionInput {
  return base({
    attributionClass: "correlation_only",
    attributionReason: "Metric improved but no confirmed causal link established.",
    ...overrides,
  });
}

function confounded(overrides: Partial<CausalAttributionInput> = {}): CausalAttributionInput {
  return base({
    attributionClass: "confounded",
    hasConfoundingFactors: true,
    confoundingNotes: "Market-wide COGS reduction coincided with intervention window.",
    attributionReason: "Could not isolate supplier renegotiation effect from market movement.",
    ...overrides,
  });
}

function externalDominant(overrides: Partial<CausalAttributionInput> = {}): CausalAttributionInput {
  return base({
    attributionClass: "external_event_dominant",
    hasExternalEventDuringPeriod: true,
    attributionReason: "Global supply shock reduced COGS across all suppliers independently.",
    ...overrides,
  });
}

// ─── Policy table tests ───────────────────────────────────────────────────────

describe("ATTRIBUTION_BLOCKS_LEARNING", () => {
  it("not_assessed → blocks learning", () =>
    expect(ATTRIBUTION_BLOCKS_LEARNING.not_assessed).toBe(true));
  it("correlation_only → blocks learning", () =>
    expect(ATTRIBUTION_BLOCKS_LEARNING.correlation_only).toBe(true));
  it("external_event_dominant → blocks learning", () =>
    expect(ATTRIBUTION_BLOCKS_LEARNING.external_event_dominant).toBe(true));
  it("insufficient_evidence → blocks learning", () =>
    expect(ATTRIBUTION_BLOCKS_LEARNING.insufficient_evidence).toBe(true));
  it("plausible_contributor → does not block learning", () =>
    expect(ATTRIBUTION_BLOCKS_LEARNING.plausible_contributor).toBe(false));
  it("likely_caused → does not block learning", () =>
    expect(ATTRIBUTION_BLOCKS_LEARNING.likely_caused).toBe(false));
  it("confounded → does not block learning (requires review instead)", () =>
    expect(ATTRIBUTION_BLOCKS_LEARNING.confounded).toBe(false));
});

describe("ATTRIBUTION_REQUIRES_HUMAN_REVIEW", () => {
  it("confounded → requires human review", () =>
    expect(ATTRIBUTION_REQUIRES_HUMAN_REVIEW.confounded).toBe(true));
  it("likely_caused → does not require review", () =>
    expect(ATTRIBUTION_REQUIRES_HUMAN_REVIEW.likely_caused).toBe(false));
  it("plausible_contributor → does not require review", () =>
    expect(ATTRIBUTION_REQUIRES_HUMAN_REVIEW.plausible_contributor).toBe(false));
  it("correlation_only → does not require review (blocked instead)", () =>
    expect(ATTRIBUTION_REQUIRES_HUMAN_REVIEW.correlation_only).toBe(false));
  it("external_event_dominant → does not require review (blocked instead)", () =>
    expect(ATTRIBUTION_REQUIRES_HUMAN_REVIEW.external_event_dominant).toBe(false));
});

describe("ATTRIBUTION_LEARNING_CEILING", () => {
  it("not_assessed → blocked", () =>
    expect(ATTRIBUTION_LEARNING_CEILING.not_assessed).toBe("blocked"));
  it("correlation_only → blocked", () =>
    expect(ATTRIBUTION_LEARNING_CEILING.correlation_only).toBe("blocked"));
  it("external_event_dominant → blocked", () =>
    expect(ATTRIBUTION_LEARNING_CEILING.external_event_dominant).toBe("blocked"));
  it("insufficient_evidence → blocked", () =>
    expect(ATTRIBUTION_LEARNING_CEILING.insufficient_evidence).toBe("blocked"));
  it("plausible_contributor → medium", () =>
    expect(ATTRIBUTION_LEARNING_CEILING.plausible_contributor).toBe("medium"));
  it("likely_caused → high", () =>
    expect(ATTRIBUTION_LEARNING_CEILING.likely_caused).toBe("high"));
  it("confounded → requires_human_review", () =>
    expect(ATTRIBUTION_LEARNING_CEILING.confounded).toBe("requires_human_review"));
});

// ─── CA-RULE-1: attributionReason ────────────────────────────────────────────

describe("CA-RULE-1: attributionReason required (min 10 chars)", () => {
  it("violation when empty", () => {
    const result = classifyCausalAttribution(base({ attributionReason: "" }));
    expect(result.violations.some((v) => v.includes("CA-RULE-1"))).toBe(true);
  });

  it("violation when too short", () => {
    const result = classifyCausalAttribution(base({ attributionReason: "too short" }));
    expect(result.violations.some((v) => v.includes("CA-RULE-1"))).toBe(true);
  });

  it("no violation when sufficient", () => {
    const result = classifyCausalAttribution(base());
    expect(result.violations.some((v) => v.includes("CA-RULE-1"))).toBe(false);
  });
});

// ─── CA-RULE-2: entity link ───────────────────────────────────────────────────

describe("CA-RULE-2: at least one entity link required", () => {
  it("violation when none provided", () => {
    const result = classifyCausalAttribution(
      base({ actionId: undefined, recommendationId: undefined, outcomeId: undefined })
    );
    expect(result.violations.some((v) => v.includes("CA-RULE-2"))).toBe(true);
  });

  it("valid when only actionId provided", () => {
    const result = classifyCausalAttribution(
      base({ recommendationId: undefined, outcomeId: undefined })
    );
    expect(result.violations.some((v) => v.includes("CA-RULE-2"))).toBe(false);
  });

  it("valid when only recommendationId provided", () => {
    const result = classifyCausalAttribution(
      base({ actionId: undefined, recommendationId: "rec-001", outcomeId: undefined })
    );
    expect(result.violations.some((v) => v.includes("CA-RULE-2"))).toBe(false);
  });

  it("valid when only outcomeId provided", () => {
    const result = classifyCausalAttribution(
      base({ actionId: undefined, recommendationId: undefined, outcomeId: "outcome-001" })
    );
    expect(result.violations.some((v) => v.includes("CA-RULE-2"))).toBe(false);
  });
});

// ─── CA-RULE-3: confounded requires notes ────────────────────────────────────

describe("CA-RULE-3: confounded requires confoundingNotes", () => {
  it("violation when confounded has no notes", () => {
    const result = classifyCausalAttribution(
      confounded({ confoundingNotes: undefined })
    );
    expect(result.violations.some((v) => v.includes("CA-RULE-3"))).toBe(true);
  });

  it("no violation when confounded has notes", () => {
    const result = classifyCausalAttribution(confounded());
    expect(result.violations.some((v) => v.includes("CA-RULE-3"))).toBe(false);
  });

  it("no violation for non-confounded without notes", () => {
    const result = classifyCausalAttribution(correlationOnly({ confoundingNotes: undefined }));
    expect(result.violations.some((v) => v.includes("CA-RULE-3"))).toBe(false);
  });
});

// ─── CA-RULE-4: likely_caused inconsistent with external event ───────────────

describe("CA-RULE-4: likely_caused contradicts hasExternalEventDuringPeriod", () => {
  it("violation when likely_caused + external event present", () => {
    const result = classifyCausalAttribution(
      base({ hasExternalEventDuringPeriod: true })
    );
    expect(result.violations.some((v) => v.includes("CA-RULE-4"))).toBe(true);
  });

  it("no violation for plausible_contributor + external event present", () => {
    const result = classifyCausalAttribution(
      base({
        attributionClass: "plausible_contributor",
        hasExternalEventDuringPeriod: true,
        attributionReason: "Action contributed but external event also present during period.",
      })
    );
    expect(result.violations.some((v) => v.includes("CA-RULE-4"))).toBe(false);
  });

  it("no violation for external_event_dominant + external event present", () => {
    const result = classifyCausalAttribution(externalDominant());
    expect(result.violations.some((v) => v.includes("CA-RULE-4"))).toBe(false);
  });
});

// ─── CA-RULE-5: likely_caused requires temporal proximity ────────────────────

describe("CA-RULE-5: likely_caused requires hasTemporalProximity", () => {
  it("violation when likely_caused without temporal proximity", () => {
    const result = classifyCausalAttribution(base({ hasTemporalProximity: false }));
    expect(result.violations.some((v) => v.includes("CA-RULE-5"))).toBe(true);
  });

  it("no violation for plausible_contributor without temporal proximity", () => {
    const result = classifyCausalAttribution(
      base({
        attributionClass: "plausible_contributor",
        hasTemporalProximity: false,
        attributionReason: "Longer-term structural change; temporal proximity not required.",
      })
    );
    expect(result.violations.some((v) => v.includes("CA-RULE-5"))).toBe(false);
  });
});

// ─── blocksLearning derivation ────────────────────────────────────────────────

describe("blocksLearning from attributionClass", () => {
  it("correlation_only → blocks learning", () => {
    const result = classifyCausalAttribution(correlationOnly());
    expect(result.blocksLearning).toBe(true);
  });

  it("external_event_dominant → blocks learning", () => {
    const result = classifyCausalAttribution(externalDominant());
    expect(result.blocksLearning).toBe(true);
  });

  it("not_assessed → blocks learning", () => {
    const result = classifyCausalAttribution(
      base({
        attributionClass: "not_assessed",
        attributionReason: "Attribution assessment has not been completed yet.",
      })
    );
    expect(result.blocksLearning).toBe(true);
  });

  it("likely_caused → does not block learning", () => {
    const result = classifyCausalAttribution(base());
    expect(result.blocksLearning).toBe(false);
  });

  it("plausible_contributor → does not block learning", () => {
    const result = classifyCausalAttribution(
      base({
        attributionClass: "plausible_contributor",
        attributionReason: "Action was a plausible contributor to the improvement.",
      })
    );
    expect(result.blocksLearning).toBe(false);
  });
});

// ─── requiresHumanReview ──────────────────────────────────────────────────────

describe("requiresHumanReview from attributionClass", () => {
  it("confounded → requires human review", () => {
    const result = classifyCausalAttribution(confounded());
    expect(result.requiresHumanReview).toBe(true);
  });

  it("likely_caused → does not require human review", () => {
    const result = classifyCausalAttribution(base());
    expect(result.requiresHumanReview).toBe(false);
  });

  it("correlation_only → does not require human review", () => {
    const result = classifyCausalAttribution(correlationOnly());
    expect(result.requiresHumanReview).toBe(false);
  });
});

// ─── learningCeiling ──────────────────────────────────────────────────────────

describe("learningCeiling from attributionClass", () => {
  it("likely_caused → high ceiling", () => {
    const result = classifyCausalAttribution(base());
    expect(result.learningCeiling).toBe("high");
  });

  it("plausible_contributor → medium ceiling", () => {
    const result = classifyCausalAttribution(
      base({
        attributionClass: "plausible_contributor",
        attributionReason: "Action was a plausible contributor to the improvement.",
      })
    );
    expect(result.learningCeiling).toBe("medium");
  });

  it("correlation_only → blocked ceiling", () => {
    const result = classifyCausalAttribution(correlationOnly());
    expect(result.learningCeiling).toBe("blocked");
  });

  it("confounded → requires_human_review ceiling", () => {
    const result = classifyCausalAttribution(confounded());
    expect(result.learningCeiling).toBe("requires_human_review");
  });
});

// ─── hasVerifiedCausalLink ────────────────────────────────────────────────────

describe("hasVerifiedCausalLink", () => {
  it("likely_caused + temporal proximity + no external + no confounding → true", () => {
    const result = classifyCausalAttribution(base());
    expect(result.hasVerifiedCausalLink).toBe(true);
  });

  it("plausible_contributor → false", () => {
    const result = classifyCausalAttribution(
      base({
        attributionClass: "plausible_contributor",
        attributionReason: "Action was a plausible contributor to the improvement.",
      })
    );
    expect(result.hasVerifiedCausalLink).toBe(false);
  });

  it("likely_caused + confounding factors → false", () => {
    // This would also trip CA-RULE-4 if externalEvent is true; here just confounding
    const result = classifyCausalAttribution(
      base({ hasConfoundingFactors: true })
    );
    expect(result.hasVerifiedCausalLink).toBe(false);
  });
});

// ─── isExternallyDominated ───────────────────────────────────────────────────

describe("isExternallyDominated", () => {
  it("external_event_dominant → true", () => {
    const result = classifyCausalAttribution(externalDominant());
    expect(result.isExternallyDominated).toBe(true);
  });

  it("plausible_contributor with external event → false", () => {
    const result = classifyCausalAttribution(
      base({
        attributionClass: "plausible_contributor",
        hasExternalEventDuringPeriod: true,
        attributionReason: "Action contributed; external event also present but not dominant.",
      })
    );
    expect(result.isExternallyDominated).toBe(false);
  });
});

// ─── attributionAllowsLearning ────────────────────────────────────────────────

describe("attributionAllowsLearning", () => {
  it("likely_caused valid → allows learning", () => {
    const result = classifyCausalAttribution(base());
    expect(attributionAllowsLearning(result)).toBe(true);
  });

  it("plausible_contributor valid → allows learning", () => {
    const result = classifyCausalAttribution(
      base({
        attributionClass: "plausible_contributor",
        attributionReason: "Action was a plausible contributor to the improvement.",
      })
    );
    expect(attributionAllowsLearning(result)).toBe(true);
  });

  it("correlation_only → does not allow learning", () => {
    const result = classifyCausalAttribution(correlationOnly());
    expect(attributionAllowsLearning(result)).toBe(false);
  });

  it("external_event_dominant → does not allow learning", () => {
    const result = classifyCausalAttribution(externalDominant());
    expect(attributionAllowsLearning(result)).toBe(false);
  });

  it("confounded → does not allow learning (requires human review)", () => {
    const result = classifyCausalAttribution(confounded());
    expect(attributionAllowsLearning(result)).toBe(false);
  });

  it("invalid record → does not allow learning", () => {
    const result = classifyCausalAttribution(base({ attributionReason: "" }));
    expect(attributionAllowsLearning(result)).toBe(false);
  });

  it("insufficient_evidence → does not allow learning", () => {
    const result = classifyCausalAttribution(
      base({
        attributionClass: "insufficient_evidence",
        attributionReason: "Not enough data to establish any causal link at this stage.",
      })
    );
    expect(attributionAllowsLearning(result)).toBe(false);
  });
});

// ─── Workspace scoping ────────────────────────────────────────────────────────

describe("workspace scoping", () => {
  it("throws when workspaceId is empty", () => {
    expect(() => classifyCausalAttribution(base({ workspaceId: "" }))).toThrow();
  });

  it("throws when workspaceId is whitespace", () => {
    expect(() => classifyCausalAttribution(base({ workspaceId: "   " }))).toThrow();
  });
});

// ─── Valid complete inputs ────────────────────────────────────────────────────

describe("valid complete inputs", () => {
  it("likely_caused is valid with no violations", () => {
    const result = classifyCausalAttribution(base());
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("correlation_only is valid with no violations", () => {
    const result = classifyCausalAttribution(correlationOnly());
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("confounded with notes is valid with no violations", () => {
    const result = classifyCausalAttribution(confounded());
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("external_event_dominant is valid with no violations", () => {
    const result = classifyCausalAttribution(externalDominant());
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("plausible_contributor is valid with no violations", () => {
    const result = classifyCausalAttribution(
      base({
        attributionClass: "plausible_contributor",
        hasTemporalProximity: true,
        attributionReason: "Supplier switch was a plausible contributor; market also moved.",
      })
    );
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });
});
