import { describe, it, expect } from "vitest";
import {
  HARM_REQUIRES_HUMAN_REVIEW,
  HARM_BLOCKS_LEARNING,
  HARM_TRIGGERS_INCIDENT_REVIEW,
  validateHarmEvent,
  harmAllowsLearning,
  type HarmEventInput,
} from "@/domain/owner-mode/harm-tracking";

const WS = "00000000-0000-0000-0000-000000000001";
const BIZ = "00000000-0000-0000-0000-000000000002";

function base(overrides: Partial<HarmEventInput> = {}): HarmEventInput {
  return {
    workspaceId: WS,
    businessId: BIZ,
    actionId: "action-001",
    harmCategory: "cash_loss",
    harmSeverity: "medium",
    harmAmountEstimate: 15000,
    harmMetric: "cash_outflow_usd",
    harmDescription: "Unexpected cash outflow after supplier renegotiation failed.",
    reversibility: "partially_reversible",
    ...overrides,
  };
}

function noHarm(overrides: Partial<HarmEventInput> = {}): HarmEventInput {
  return {
    workspaceId: WS,
    businessId: BIZ,
    actionId: "action-001",
    harmCategory: "none",
    harmSeverity: "none",
    harmDescription: "No harm detected after implementation.",
    reversibility: "reversible",
    ...overrides,
  };
}

// ─── Policy tables ────────────────────────────────────────────────────────────

describe("HARM_REQUIRES_HUMAN_REVIEW", () => {
  it("none → does not require review", () => expect(HARM_REQUIRES_HUMAN_REVIEW.none).toBe(false));
  it("low → does not require review", () => expect(HARM_REQUIRES_HUMAN_REVIEW.low).toBe(false));
  it("medium → requires review", () => expect(HARM_REQUIRES_HUMAN_REVIEW.medium).toBe(true));
  it("high → requires review", () => expect(HARM_REQUIRES_HUMAN_REVIEW.high).toBe(true));
  it("severe → requires review", () => expect(HARM_REQUIRES_HUMAN_REVIEW.severe).toBe(true));
});

describe("HARM_BLOCKS_LEARNING", () => {
  it("none → does not block learning", () => expect(HARM_BLOCKS_LEARNING.none).toBe(false));
  it("low → does not block learning", () => expect(HARM_BLOCKS_LEARNING.low).toBe(false));
  it("medium → does not block learning", () => expect(HARM_BLOCKS_LEARNING.medium).toBe(false));
  it("high → blocks learning", () => expect(HARM_BLOCKS_LEARNING.high).toBe(true));
  it("severe → blocks learning", () => expect(HARM_BLOCKS_LEARNING.severe).toBe(true));
});

describe("HARM_TRIGGERS_INCIDENT_REVIEW", () => {
  it("compliance_risk → triggers incident review", () =>
    expect(HARM_TRIGGERS_INCIDENT_REVIEW.compliance_risk).toBe(true));
  it("legal_risk → triggers incident review", () =>
    expect(HARM_TRIGGERS_INCIDENT_REVIEW.legal_risk).toBe(true));
  it("cash_loss → does not trigger incident review", () =>
    expect(HARM_TRIGGERS_INCIDENT_REVIEW.cash_loss).toBe(false));
  it("reputation_damage → does not trigger incident review", () =>
    expect(HARM_TRIGGERS_INCIDENT_REVIEW.reputation_damage).toBe(false));
  it("none → does not trigger incident review", () =>
    expect(HARM_TRIGGERS_INCIDENT_REVIEW.none).toBe(false));
});

// ─── HARM-RULE-1: harmDescription ────────────────────────────────────────────

describe("HARM-RULE-1: harmDescription required (min 10 chars)", () => {
  it("violation when description is empty", () => {
    const result = validateHarmEvent(base({ harmDescription: "" }));
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.includes("HARM-RULE-1"))).toBe(true);
  });

  it("violation when description is too short", () => {
    const result = validateHarmEvent(base({ harmDescription: "bad loss" }));
    expect(result.violations.some((v) => v.includes("HARM-RULE-1"))).toBe(true);
  });

  it("no violation when description is sufficient", () => {
    const result = validateHarmEvent(base());
    expect(result.violations.some((v) => v.includes("HARM-RULE-1"))).toBe(false);
  });
});

// ─── HARM-RULE-2: must link to entity ────────────────────────────────────────

describe("HARM-RULE-2: must link to recommendation, action, or outcome", () => {
  it("violation when none provided", () => {
    const result = validateHarmEvent(
      base({ recommendationId: undefined, actionId: undefined, outcomeId: undefined })
    );
    expect(result.violations.some((v) => v.includes("HARM-RULE-2"))).toBe(true);
  });

  it("valid when only actionId provided", () => {
    const result = validateHarmEvent(base({ recommendationId: undefined, outcomeId: undefined }));
    expect(result.violations.some((v) => v.includes("HARM-RULE-2"))).toBe(false);
  });

  it("valid when only recommendationId provided", () => {
    const result = validateHarmEvent(
      base({ recommendationId: "rec-001", actionId: undefined, outcomeId: undefined })
    );
    expect(result.violations.some((v) => v.includes("HARM-RULE-2"))).toBe(false);
  });

  it("valid when only outcomeId provided", () => {
    const result = validateHarmEvent(
      base({ recommendationId: undefined, actionId: undefined, outcomeId: "outcome-001" })
    );
    expect(result.violations.some((v) => v.includes("HARM-RULE-2"))).toBe(false);
  });
});

// ─── HARM-RULE-3: non-none harm needs evidence ───────────────────────────────

describe("HARM-RULE-3: harmMetric or harmAmountEstimate required for non-none harm", () => {
  it("violation when non-none harm has no metric and no amount", () => {
    const result = validateHarmEvent(
      base({ harmAmountEstimate: undefined, harmMetric: undefined })
    );
    expect(result.violations.some((v) => v.includes("HARM-RULE-3"))).toBe(true);
  });

  it("no violation when harmAmountEstimate is provided", () => {
    const result = validateHarmEvent(base({ harmAmountEstimate: 5000, harmMetric: undefined }));
    expect(result.violations.some((v) => v.includes("HARM-RULE-3"))).toBe(false);
  });

  it("no violation when harmMetric is provided", () => {
    const result = validateHarmEvent(
      base({ harmAmountEstimate: undefined, harmMetric: "margin_pct" })
    );
    expect(result.violations.some((v) => v.includes("HARM-RULE-3"))).toBe(false);
  });

  it("no violation for none/none harm without metric", () => {
    const result = validateHarmEvent(noHarm({ harmAmountEstimate: undefined, harmMetric: undefined }));
    expect(result.violations.some((v) => v.includes("HARM-RULE-3"))).toBe(false);
  });
});

// ─── HARM-RULE-4: harmAmountEstimate must be non-negative ────────────────────

describe("HARM-RULE-4: harmAmountEstimate must be non-negative", () => {
  it("violation when amount is negative", () => {
    const result = validateHarmEvent(base({ harmAmountEstimate: -500 }));
    expect(result.violations.some((v) => v.includes("HARM-RULE-4"))).toBe(true);
  });

  it("no violation when amount is 0", () => {
    const result = validateHarmEvent(base({ harmAmountEstimate: 0 }));
    expect(result.violations.some((v) => v.includes("HARM-RULE-4"))).toBe(false);
  });

  it("no violation when amount is positive", () => {
    const result = validateHarmEvent(base({ harmAmountEstimate: 15000 }));
    expect(result.violations.some((v) => v.includes("HARM-RULE-4"))).toBe(false);
  });
});

// ─── Severity flags ───────────────────────────────────────────────────────────

describe("requiresHumanReview from severity", () => {
  it("medium harm → requiresHumanReview = true", () => {
    const result = validateHarmEvent(base({ harmSeverity: "medium" }));
    expect(result.requiresHumanReview).toBe(true);
  });

  it("high harm → requiresHumanReview = true", () => {
    const result = validateHarmEvent(base({ harmSeverity: "high" }));
    expect(result.requiresHumanReview).toBe(true);
  });

  it("severe harm → requiresHumanReview = true", () => {
    const result = validateHarmEvent(base({ harmSeverity: "severe" }));
    expect(result.requiresHumanReview).toBe(true);
  });

  it("low harm → requiresHumanReview = false", () => {
    const result = validateHarmEvent(base({ harmSeverity: "low" }));
    expect(result.requiresHumanReview).toBe(false);
  });

  it("none harm → requiresHumanReview = false", () => {
    const result = validateHarmEvent(noHarm());
    expect(result.requiresHumanReview).toBe(false);
  });
});

describe("blocksLearning from severity", () => {
  it("high harm → blocks learning", () => {
    const result = validateHarmEvent(base({ harmSeverity: "high" }));
    expect(result.blocksLearning).toBe(true);
  });

  it("severe harm → blocks learning", () => {
    const result = validateHarmEvent(base({ harmSeverity: "severe" }));
    expect(result.blocksLearning).toBe(true);
  });

  it("medium harm → does not block learning", () => {
    const result = validateHarmEvent(base({ harmSeverity: "medium" }));
    expect(result.blocksLearning).toBe(false);
  });

  it("low harm → does not block learning", () => {
    const result = validateHarmEvent(base({ harmSeverity: "low" }));
    expect(result.blocksLearning).toBe(false);
  });
});

// ─── Incident review from category ───────────────────────────────────────────

describe("triggersIncidentReview from category", () => {
  it("legal_risk → triggers incident review", () => {
    const result = validateHarmEvent(
      base({ harmCategory: "legal_risk", harmSeverity: "high" })
    );
    expect(result.triggersIncidentReview).toBe(true);
  });

  it("compliance_risk → triggers incident review", () => {
    const result = validateHarmEvent(
      base({ harmCategory: "compliance_risk", harmSeverity: "medium" })
    );
    expect(result.triggersIncidentReview).toBe(true);
  });

  it("cash_loss → does not trigger incident review", () => {
    const result = validateHarmEvent(base({ harmCategory: "cash_loss" }));
    expect(result.triggersIncidentReview).toBe(false);
  });

  it("churn_increase → does not trigger incident review", () => {
    const result = validateHarmEvent(
      base({ harmCategory: "churn_increase", harmSeverity: "high" })
    );
    expect(result.triggersIncidentReview).toBe(false);
  });
});

// ─── harmAllowsLearning ───────────────────────────────────────────────────────

describe("harmAllowsLearning", () => {
  it("no harm → allows learning", () => {
    const result = validateHarmEvent(noHarm());
    expect(harmAllowsLearning(result)).toBe(true);
  });

  it("low harm → allows learning", () => {
    const result = validateHarmEvent(base({ harmSeverity: "low" }));
    expect(harmAllowsLearning(result)).toBe(true);
  });

  it("medium harm → allows learning (requires review but not blocked)", () => {
    const result = validateHarmEvent(base({ harmSeverity: "medium" }));
    expect(harmAllowsLearning(result)).toBe(true);
  });

  it("high harm → does not allow learning", () => {
    const result = validateHarmEvent(base({ harmSeverity: "high" }));
    expect(harmAllowsLearning(result)).toBe(false);
  });

  it("severe harm → does not allow learning", () => {
    const result = validateHarmEvent(base({ harmSeverity: "severe" }));
    expect(harmAllowsLearning(result)).toBe(false);
  });

  it("invalid event → does not allow learning", () => {
    const result = validateHarmEvent(
      base({ harmDescription: "", harmSeverity: "low" })
    );
    expect(harmAllowsLearning(result)).toBe(false);
  });
});

// ─── Valid complete inputs ────────────────────────────────────────────────────

describe("valid complete inputs", () => {
  it("no-harm record is valid", () => {
    const result = validateHarmEvent(noHarm());
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("cash loss with medium severity is valid", () => {
    const result = validateHarmEvent(base());
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("legal risk with high severity is valid", () => {
    const result = validateHarmEvent(
      base({
        harmCategory: "legal_risk",
        harmSeverity: "high",
        harmDescription: "Potential regulatory breach from non-compliant supplier switch.",
        harmMetric: "regulatory_exposure_eur",
        harmAmountEstimate: 50000,
        reversibility: "irreversible",
      })
    );
    expect(result.valid).toBe(true);
    expect(result.triggersIncidentReview).toBe(true);
    expect(result.blocksLearning).toBe(true);
  });

  it("opportunity cost record is valid", () => {
    const result = validateHarmEvent(
      base({
        harmCategory: "opportunity_cost",
        harmSeverity: "low",
        harmDescription: "Missed 3-month window for bulk discount from alternate supplier.",
        harmAmountEstimate: 3000,
        reversibility: "reversible",
      })
    );
    expect(result.valid).toBe(true);
  });
});

// ─── Workspace scoping ────────────────────────────────────────────────────────

describe("workspace scoping", () => {
  it("throws when workspaceId is empty", () => {
    expect(() => validateHarmEvent(base({ workspaceId: "" }))).toThrow();
  });

  it("throws when workspaceId is whitespace", () => {
    expect(() => validateHarmEvent(base({ workspaceId: "   " }))).toThrow();
  });
});
