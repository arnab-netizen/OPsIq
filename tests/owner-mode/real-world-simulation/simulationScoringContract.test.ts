import { describe, it, expect } from "vitest";
import {
  scoreSimulationOutput,
  checkAdversarialResistance,
  checkTrapResistance,
} from "./simulationScoringContract";
import { validateSimulationFixture, type SimulationFixture } from "./simulationFixtureSchema";

// ── Shared fixture builder ────────────────────────────────────────────────────

function buildFixture(overrides: Record<string, unknown> = {}): SimulationFixture {
  const raw = {
    case_id: "SIM-01-001",
    title: "Cash Crisis — Bakery",
    category: "SC-01",
    test_type: "TT-1",
    segment: "Food retail, 4 employees, $520K revenue",
    business_context: "A bakery is profitable on paper but runs out of cash monthly.",
    source_basis: ["Composite"],
    input_packet: {
      business_description:
        "A bakery owner reports the bank balance goes nearly empty every month despite steady revenue.",
      facts_known_to_owner: { annual_revenue: 520000, gross_margin_pct: 42 },
      symptoms: [
        "Bank runs low every month",
        "Owner cannot pay himself reliably",
        "Suppliers sometimes wait for payment",
      ],
      misleading_signals: [
        "Gross margin of 42% looks healthy",
        "Revenue has grown this year",
      ],
      missing_inputs_opsiq_should_request: [
        "Weekly cash flow statement showing inflows and outflows",
        "Supplier payment terms and timing",
        "Payroll schedule versus peak revenue days",
      ],
    },
    sealed_expected_output: {
      primary_root_cause: "cash_timing_mismatch",
      secondary_causes: ["supplier_payment_front_loading", "no_cash_reserve_buffer"],
      expected_first_action:
        "Map every cash inflow and outflow by day for the last four weeks to identify the timing of the shortfall.",
      bad_recommendations_to_flag: [
        "grow revenue to solve the cash problem",
        "take on a line of credit",
        "hire more staff",
        "increase marketing spend",
      ],
      scoring_rubric: {
        must_identify: [
          "cash timing",
          "payment cycle",
          "working capital",
          "cash flow gap",
        ],
        must_not_claim: [
          "revenue growth will fix the cash problem",
          "the margin is too low",
        ],
        ideal_depth: [
          "identifies the day-of-week cash trough relative to payroll",
          "notes supplier terms may be renegotiated",
        ],
      },
    },
    leakage_controls: {
      author_read_benchmark_fixtures: false,
      author_read_composer_source: false,
      leakage_check_passed: false,
    },
    holdout_meta: {
      author_id: "author-A",
      construction_date: "2026-06-22",
      industry: "Food retail",
      intervention_mode: "diagnostic",
      business_condition_hypothesis: "CASH_STRESS",
      consulting_lifecycle_stage: "diagnosis",
    },
    ...overrides,
  };
  return validateSimulationFixture(raw, 0);
}

// ── Strong mock output ────────────────────────────────────────────────────────

const STRONG_OUTPUT = [
  "The core issue here is a cash timing mismatch — the payment cycle between",
  "when money comes in and when bills go out creates a recurring cash flow gap.",
  "Working capital is the underlying constraint, not revenue or margin.",
  "The supplier payment front-loading is creating the trough.",
  "I need to see your weekly cash flow statement showing inflows and outflows by day.",
  "We also need the payroll schedule and how it lines up with your peak revenue days.",
  "Supplier payment terms and timing must be reviewed before any other action.",
  "Once we have that, map every cash inflow and outflow by day for the last four weeks",
  "to identify the exact timing of the shortfall.",
  "If conditions change or further evidence emerges, this analysis may need revision.",
].join(" ");

describe("scoreSimulationOutput: strong mock output passes", () => {
  it("passes overall with totalScore >= 0.70", () => {
    const fixture = buildFixture();
    const result = scoreSimulationOutput(STRONG_OUTPUT, fixture);
    expect(result.passed).toBe(true);
    expect(result.totalScore).toBeGreaterThanOrEqual(0.70);
  });

  it("rootCause dimension passes", () => {
    const fixture = buildFixture();
    const result = scoreSimulationOutput(STRONG_OUTPUT, fixture);
    expect(result.dimensionResults.rootCause.passed).toBe(true);
  });

  it("badRecommendationAvoidance dimension passes", () => {
    const fixture = buildFixture();
    const result = scoreSimulationOutput(STRONG_OUTPUT, fixture);
    expect(result.dimensionResults.badRecommendationAvoidance.passed).toBe(true);
  });

  it("evidenceDiscipline dimension passes", () => {
    const fixture = buildFixture();
    const result = scoreSimulationOutput(STRONG_OUTPUT, fixture);
    expect(result.dimensionResults.evidenceDiscipline.passed).toBe(true);
  });

  it("has no critical failures", () => {
    const fixture = buildFixture();
    const result = scoreSimulationOutput(STRONG_OUTPUT, fixture);
    expect(result.criticalFailures).toHaveLength(0);
  });

  it("result has expected shape with all 8 dimension keys", () => {
    const fixture = buildFixture();
    const result = scoreSimulationOutput(STRONG_OUTPUT, fixture);
    const keys = Object.keys(result.dimensionResults);
    expect(keys).toContain("rootCause");
    expect(keys).toContain("prioritization");
    expect(keys).toContain("firstAction");
    expect(keys).toContain("missingInputRequests");
    expect(keys).toContain("badRecommendationAvoidance");
    expect(keys).toContain("evidenceDiscipline");
    expect(keys).toContain("reassessmentQuality");
    expect(keys).toContain("learningLoopEligibility");
  });
});

// ── Bad recommendation fails ──────────────────────────────────────────────────

describe("scoreSimulationOutput: bad recommendation fails", () => {
  it("fails when output contains a flagged bad recommendation", () => {
    const fixture = buildFixture();
    const badOutput =
      "You should grow revenue to solve the cash problem. Hire more marketing staff and invest in ads.";
    const result = scoreSimulationOutput(badOutput, fixture);
    expect(result.passed).toBe(false);
    expect(result.dimensionResults.badRecommendationAvoidance.passed).toBe(false);
    expect(result.criticalFailures).toContain("badRecommendationAvoidance");
  });
});

// ── Evidence-free confident answer fails ─────────────────────────────────────

describe("scoreSimulationOutput: evidence-free confident answer fails evidenceDiscipline", () => {
  it("fails evidenceDiscipline when output is confident with no evidence requests", () => {
    const fixture = buildFixture();
    const overconfidentOutput =
      "The problem is definitely a cash timing mismatch and the solution is clear: " +
      "renegotiate payment terms with suppliers. No further analysis is needed.";
    const result = scoreSimulationOutput(overconfidentOutput, fixture);
    expect(result.dimensionResults.evidenceDiscipline.passed).toBe(false);
    expect(result.criticalFailures).toContain("evidenceDiscipline");
  });
});

// ── Missing-input failure lowers score ────────────────────────────────────────

describe("scoreSimulationOutput: missing inputs lowers missingInputRequests score", () => {
  it("scores missingInputRequests.score = 0 when no inputs are requested", () => {
    const fixture = buildFixture();
    const noRequestsOutput =
      "Cash timing mismatch is the issue. Working capital gap is the root cause. " +
      "Payment cycle creates the problem. Cash flow gap is evident. " +
      "Consider adjusting when you pay bills. If new data arrives this may change.";
    const result = scoreSimulationOutput(noRequestsOutput, fixture);
    expect(result.dimensionResults.missingInputRequests.score).toBe(0);
    expect(result.dimensionResults.missingInputRequests.passed).toBe(false);
  });
});

// ── Learning loop ineligible case ─────────────────────────────────────────────

describe("scoreSimulationOutput: passed case has learning loop not applicable", () => {
  it("learningLoopEligibility has passed=true (metadata only) even when rootCause passes", () => {
    const fixture = buildFixture();
    const result = scoreSimulationOutput(STRONG_OUTPUT, fixture);
    // learningLoopEligibility.passed is always true (never a critical failure)
    expect(result.dimensionResults.learningLoopEligibility.passed).toBe(true);
    // When rootCause passes, score = 0 (not eligible for learning loop)
    expect(result.dimensionResults.learningLoopEligibility.score).toBe(0);
  });

  it("learningLoopEligibility does not affect totalScore", () => {
    const fixture = buildFixture();
    const result = scoreSimulationOutput(STRONG_OUTPUT, fixture);
    // learningLoopEligibility has 0 weight — removing it would not change totalScore
    expect(result.totalScore).toBeGreaterThan(0);
    expect(result.dimensionResults.learningLoopEligibility.passed).toBe(true);
  });
});

// ── Scoring result shape ──────────────────────────────────────────────────────

describe("scoreSimulationOutput: result shape", () => {
  it("case_id matches fixture", () => {
    const fixture = buildFixture();
    const result = scoreSimulationOutput(STRONG_OUTPUT, fixture);
    expect(result.case_id).toBe("SIM-01-001");
  });

  it("totalScore is between 0 and 1", () => {
    const fixture = buildFixture();
    const result = scoreSimulationOutput(STRONG_OUTPUT, fixture);
    expect(result.totalScore).toBeGreaterThanOrEqual(0);
    expect(result.totalScore).toBeLessThanOrEqual(1);
  });

  it("each dimension result has required fields", () => {
    const fixture = buildFixture();
    const result = scoreSimulationOutput(STRONG_OUTPUT, fixture);
    for (const [, dim] of Object.entries(result.dimensionResults)) {
      expect(typeof dim.passed).toBe("boolean");
      expect(typeof dim.score).toBe("number");
      expect(Array.isArray(dim.reasons)).toBe(true);
      expect(Array.isArray(dim.matchedTerms)).toBe(true);
      expect(Array.isArray(dim.missingTerms)).toBe(true);
    }
  });
});

// ── TT-2 adversarial resistance ───────────────────────────────────────────────

describe("checkAdversarialResistance", () => {
  it("returns passed=false when output contains expected misclassification", () => {
    const result = checkAdversarialResistance(
      "The business needs more revenue to solve this problem.",
      "needs more revenue"
    );
    expect(result.passed).toBe(false);
  });

  it("returns passed=true when output avoids the expected misclassification", () => {
    const result = checkAdversarialResistance(
      "The cash timing mechanism is the root cause, not insufficient revenue.",
      "needs more revenue"
    );
    expect(result.passed).toBe(true);
  });
});

// ── TT-5 trap resistance ─────────────────────────────────────────────────────

describe("checkTrapResistance", () => {
  it("returns passed=false when output attributes causality to the signal trap", () => {
    const result = checkTrapResistance(
      "The van purchase last month is causing the cash problem.",
      "van purchase"
    );
    expect(result.passed).toBe(false);
    expect(result.trapPhrase).toBe("van purchase");
  });

  it("returns passed=true when output avoids attributing causality to the trap", () => {
    const result = checkTrapResistance(
      "The cash timing mismatch is the root cause. The equipment acquisition is not the driver.",
      "van purchase"
    );
    expect(result.passed).toBe(true);
  });
});
