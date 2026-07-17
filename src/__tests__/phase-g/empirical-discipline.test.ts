import { describe, it, expect } from "vitest";

// G6 - Abstention Engine
import {
  assessSafety,
  createAbstentionDecision,
  shouldAbstain,
  getAbstentionReason,
  requiresEscalation,
} from "../../services/governance/abstention-engine";

// G7 - Assumption Validator
import {
  validateAssumption,
  validateAssumptionSet,
  hasBlockingAssumption,
  calculateAssumptionConfidenceAdjustment,
  getAssumptionSummary,
} from "../../services/governance/assumption-validator";
import { type OperationalContext } from "../../services/governance/scope-enforcement";

// G8 - Attribution Engine
import {
  analyzeAttribution,
  shouldBlockLearning,
  getAttributionSummary,
} from "../../services/governance/attribution-engine";

// G9 - Recommendation Expiry
import {
  assessExpiry,
  canRemainDoNow,
  getExpirySummary,
} from "../../services/governance/recommendation-expiry";

// G10 - Conflict Engine
import {
  detectConflict,
  canCoexistAsDoNow,
  getConflictSummary,
} from "../../services/governance/conflict-engine";

// G11 - Reversibility Engine
import {
  assessReversibility,
  isSafeToExecute,
  getReversibilitySummary,
} from "../../services/governance/reversibility-engine";

// G12 - Debt Control
import {
  assessRecommendationDebt,
  canAcceptNewRecommendation,
  getDebtSummary,
  getDebtReductionActions,
} from "../../services/governance/recommendation-debt";

// G13 - Failure Accounting
import {
  recordOutcome,
  calculateReliabilityScore,
  getUnreliableRecommendations,
  getHarmHistory,
} from "../../services/governance/failure-accounting";

import { Assumption, AssumptionSchema } from "../../domain/governance/assumption-contracts";

/**
 * PHASE G EMPIRICAL DISCIPLINE LAYER TESTS
 *
 * Comprehensive hostile scenarios for G6-G13 governance systems.
 * Tests verify fail-closed behavior and epistemic integrity.
 */

describe("PHASE G: Empirical Discipline Layer", () => {
  describe("G6: Operator Safety + Decision Abstention", () => {
    it("should abstain when confidence too low", () => {
      const assessment = assessSafety(
        0.2, // confidence_score < 0.3
        true,
        0,
        true,
        true,
        0.3,
        true,
        0
      );

      expect(assessment.abstain).toBe(true);
      expect(assessment.abstention_state).toBe("INSUFFICIENT_EVIDENCE");
      expect(shouldAbstain(assessment)).toBe(true);
    });

    it("should abstain when no evidence", () => {
      const assessment = assessSafety(0.6, false, 0, true, true, 0.3, true, 0);

      expect(assessment.abstain).toBe(true);
      expect(assessment.abstention_state).toBe("INSUFFICIENT_EVIDENCE");
      expect(assessment.unsafe_conditions.some((c) => c.condition_type === "MISSING_EVIDENCE")).toBe(true);
    });

    it("should block when contradictory evidence > 2", () => {
      const assessment = assessSafety(0.7, true, 3, true, true, 0.3, true, 0);

      expect(assessment.abstain).toBe(true);
      expect(assessment.abstention_state).toBe("CONFLICTING_SIGNALS");
      expect(assessment.unsafe_conditions.some((c) => c.condition_type === "CONTRADICTORY_EVIDENCE")).toBe(true);
    });

    it("should block on scope mismatch", () => {
      const assessment = assessSafety(0.8, true, 0, false, true, 0.3, true, 0);

      expect(assessment.abstain).toBe(true);
      expect(assessment.abstention_state).toBe("OUTSIDE_VALID_SCOPE");
    });

    it("should block when preconditions unmet", () => {
      const assessment = assessSafety(0.8, true, 0, true, false, 0.3, true, 0);

      expect(assessment.abstain).toBe(true);
      expect(assessment.abstention_state).toBe("MISSING_PRECONDITIONS");
    });

    it("should block high irreversibility with low confidence", () => {
      const assessment = assessSafety(0.4, true, 0, true, true, 0.8, true, 0);

      expect(assessment.abstain).toBe(true);
      expect(assessment.abstention_state).toBe("HIGH_RISK_UNCERTAIN");
    });

    it("should block when operator capacity exceeded", () => {
      const assessment = assessSafety(0.8, true, 0, true, true, 0.3, false, 0);

      expect(assessment.abstain).toBe(true);
      expect(assessment.abstention_state).toBe("OPERATOR_CAPACITY_EXCEEDED");
    });

    it("should block when active conflicts > 3", () => {
      const assessment = assessSafety(0.8, true, 0, true, true, 0.3, true, 4);

      expect(assessment.abstain).toBe(true);
      expect(assessment.unsafe_conditions.some((c) => c.condition_type === "CONFLICTING_RECOMMENDATIONS")).toBe(true);
    });

    it("should create abstention decision with immutability", () => {
      const decision = createAbstentionDecision(
        "rec-123",
        "INSUFFICIENT_EVIDENCE",
        ["low confidence", "missing evidence"],
        0.2,
        true,
        "system"
      );

      expect(decision.recommendation_id).toBe("rec-123");
      expect(decision.abstention_state).toBe("INSUFFICIENT_EVIDENCE");
      expect(decision.immutable).toBe(true);
      expect(decision.metadata.escalation_required).toBe(true);
    });

    it("should require escalation for critical conditions", () => {
      const assessment = assessSafety(0.1, false, 0, false, false, 0.9, false, 5);

      expect(requiresEscalation(assessment)).toBe(true);
    });
  });

  describe("G7: Assumption Provenance + Validity", () => {
    const testAssumption: Assumption = {
      assumption_id: "assum-1",
      statement: "Market demand will increase",
      source: "Market research Q1 2026",
      source_type: "MARKET_DATA",
      source_timestamp: new Date("2026-01-15"),
      confidence: 0.75,
      geography_scope: ["US", "CANADA"],
      business_scope: ["SAAS"],
      segment_scope: ["ENTERPRISE"],
      maturity_scope: ["MATURE", "SCALING"],
      expiry_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days — always > 30-day stale threshold
      validation_status: "VALID",
      contradiction_refs: [],
      evidence_refs: ["evidence-123"],
      created_at: new Date("2026-01-15"),
    };

    const testContext: OperationalContext = {
      geography: "US",
      business_type: "SAAS",
      customer_segment: "ENTERPRISE",
      maturity_level: "MATURE",
      operational_scale: "LARGE",
    };

    it("should validate assumption in scope with valid expiry", () => {
      const result = validateAssumption(testAssumption, testContext);

      expect(result.is_valid).toBe(true);
      expect(result.validation_status).toBe("VALID");
      expect(result.scope_valid).toBe(true);
    });

    it("should block assumption outside geography scope", () => {
      const outsideContext: OperationalContext = {
        ...testContext,
        geography: "UK",
      };

      const result = validateAssumption(testAssumption, outsideContext);

      expect(result.is_valid).toBe(false);
      expect(result.scope_valid).toBe(false);
      expect(result.scope_mismatches.some((r) => r.includes("Geography"))).toBe(true);
    });

    it("should downgrade confidence on stale assumption (< 30 days)", () => {
      const staleAssumption = { ...testAssumption };
      staleAssumption.expiry_date = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000); // 20 days

      const result = validateAssumption(staleAssumption, testContext);

      expect(result.validation_status).toBe("PENDING_REVALIDATION");
      expect(result.confidence_adjustment).toBeLessThan(0);
    });

    it("should block expired assumption (> 0 days past expiry)", () => {
      const expiredAssumption = { ...testAssumption };
      expiredAssumption.expiry_date = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000); // 1 day ago

      const result = validateAssumption(expiredAssumption, testContext);

      expect(result.is_valid).toBe(false);
      expect(result.validation_status).toBe("STALE");
      expect(result.expiration_days_remaining).toBeLessThan(0);
    });

    it("should block contradicted assumption", () => {
      const contradictedAssumption = { ...testAssumption };
      contradictedAssumption.contradiction_refs = ["contradiction-1", "contradiction-2"];

      const result = validateAssumption(contradictedAssumption, testContext);

      expect(result.is_valid).toBe(false);
      expect(result.validation_status).toBe("CONTRADICTED");
      expect(result.contradictions_found).toBe(2);
    });

    it("should block superseded assumption", () => {
      const supersededAssumption = { ...testAssumption };
      supersededAssumption.superseded_by = "assum-2";

      const result = validateAssumption(supersededAssumption, testContext);

      expect(result.is_valid).toBe(false);
      expect(result.validation_status).toBe("SUPERSEDED");
    });

    it("should calculate combined confidence adjustment from assumption set", () => {
      const validResult = validateAssumption(testAssumption, testContext);
      const staleAssumption = { ...testAssumption, assumption_id: "assum-2" };
      staleAssumption.expiry_date = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);
      const staleResult = validateAssumption(staleAssumption, testContext);

      const combined = calculateAssumptionConfidenceAdjustment([validResult, staleResult]);

      expect(combined).toBeLessThan(0);
    });

    it("should detect blocking assumptions", () => {
      const contradicted = { ...testAssumption };
      contradicted.contradiction_refs = ["contradiction"];

      const validations = [
        validateAssumption(testAssumption, testContext),
        validateAssumption(contradicted, testContext),
      ];

      expect(hasBlockingAssumption(validations)).toBe(true);
    });
  });

  describe("G8: Attribution Confidence Engine", () => {
    it("should strongly attribute with clean intervention window", () => {
      const analysis = analyzeAttribution(
        "rec-123",
        "outcome-456",
        7, // intervention_window_days
        0, // concurrent_changes
        0, // environmental_changes
        0, // operator_overrides
        0, // competing_recommendations
        0.95, // execution_completeness
        0.9, // temporal_proximity_score
        0.9 // measurement_quality_score
      );

      expect(analysis.attribution_confidence).toBe("STRONGLY_ATTRIBUTABLE");
      expect(analysis.recommendation_reliability_delta).toBeGreaterThan(0);
    });

    it("should partially attribute with some competing factors", () => {
      const analysis = analyzeAttribution(
        "rec-123",
        "outcome-456",
        14,
        1, // one concurrent change
        0,
        0,
        0,
        0.85,
        0.8,
        0.85
      );

      expect(analysis.attribution_confidence).toBe("PARTIALLY_ATTRIBUTABLE");
      expect(analysis.recommendation_reliability_delta).toBeLessThanOrEqual(10);
    });

    it("should weaken to non-attributable with multiple competing factors", () => {
      const analysis = analyzeAttribution(
        "rec-123",
        "outcome-456",
        30,
        2, // concurrent changes
        2, // environmental changes
        1, // operator override
        1, // competing recommendation
        0.6, // incomplete execution
        0.4, // low temporal proximity
        0.5 // moderate measurement quality
      );

      expect(analysis.attribution_confidence).toBe("NON_ATTRIBUTABLE");
      expect(analysis.blocking).toBe(true);
    });

    it("should flag contradictory attribution with excessive competing factors", () => {
      const analysis = analyzeAttribution(
        "rec-123",
        "outcome-456",
        45,
        3,
        3,
        2,
        2,
        0.5,
        0.3,
        0.3
      );

      expect(analysis.attribution_confidence).toBe("CONTRADICTORY_ATTRIBUTION");
      expect(analysis.recommendation_reliability_delta).toBeLessThan(0);
    });

    it("should prevent learning from uncertain attribution", () => {
      const weak = analyzeAttribution(
        "rec-123",
        "outcome-456",
        20,
        1,
        1,
        0,
        0,
        0.7,
        0.6,
        0.6
      );

      expect(shouldBlockLearning(weak)).toBe(true);
    });

    it("should flag survivorship bias risk", () => {
      const analysis = analyzeAttribution(
        "rec-123",
        "outcome-456",
        7,
        1, // concurrent change exists
        0,
        0,
        0,
        0.9,
        0.8,
        0.8
      );

      expect(analysis.survivorship_bias_risk).toBe(true);
    });

    it("should flag false reinforcement risk (incomplete execution)", () => {
      const analysis = analyzeAttribution(
        "rec-123",
        "outcome-456",
        7,
        0,
        0,
        0,
        0,
        0.6, // incomplete execution
        0.8,
        0.8
      );

      expect(analysis.false_reinforcement_risk).toBe(true);
    });
  });

  describe("G9: Recommendation Expiry + Revalidation", () => {
    const activated = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000); // 60 days ago

    it("should mark fresh recommendation", () => {
      const assessment = assessExpiry("rec-123", activated, new Date(), new Date());

      expect(assessment.is_stale).toBe(false);
      expect(assessment.is_expired).toBe(false);
      expect(canRemainDoNow(assessment)).toBe(true);
    });

    it("should mark as stale after 90 days", () => {
      const staleActivated = new Date(Date.now() - 95 * 24 * 60 * 60 * 1000);

      const assessment = assessExpiry("rec-123", staleActivated, new Date(), new Date());

      expect(assessment.is_stale).toBe(true);
      expect(assessment.force_downgrade_priority).toBe(true);
      expect(canRemainDoNow(assessment)).toBe(false);
    });

    it("should expire after 180 days active", () => {
      const expiredActivated = new Date(Date.now() - 190 * 24 * 60 * 60 * 1000);

      const assessment = assessExpiry("rec-123", expiredActivated, new Date(), new Date());

      expect(assessment.is_expired).toBe(true);
      expect(assessment.blocking).toBe(true);
      expect(canRemainDoNow(assessment)).toBe(false);
    });

    it("should expire if evidence stale > 120 days", () => {
      const old_evidence = new Date(Date.now() - 130 * 24 * 60 * 60 * 1000);

      const assessment = assessExpiry("rec-123", activated, old_evidence, new Date());

      expect(assessment.is_expired).toBe(true);
    });
  });

  describe("G10: Recommendation Conflict Engine", () => {
    it("should detect no conflict between compatible recommendations", () => {
      const analysis = detectConflict(
        "rec-a",
        "GROWTH",
        "GROWTH",
        100000, // budget
        5, // staff
        12, // timeline
        "rec-b",
        "EFFICIENCY",
        "OPERATIONAL_STABILITY",
        50000,
        3,
        8,
        500000, // available budget
        20 // available staff
      );

      expect(analysis.conflict_type).toBe("COMPATIBLE");
      expect(analysis.blocking).toBe(false);
    });

    it("should detect resource conflict (budget)", () => {
      const analysis = detectConflict(
        "rec-a",
        "GROWTH",
        "GROWTH",
        300000,
        5,
        12,
        "rec-b",
        "GROWTH",
        "GROWTH",
        300000,
        5,
        12,
        400000, // insufficient
        20
      );

      expect(analysis.conflict_reasons.some((r) => r.includes("Budget"))).toBe(true);
      expect(["TENSION", "DIRECT_CONFLICT"].includes(analysis.conflict_type)).toBe(true);
    });

    it("should detect resource conflict (staffing)", () => {
      const analysis = detectConflict(
        "rec-a",
        "GROWTH",
        "GROWTH",
        100000,
        10,
        12,
        "rec-b",
        "GROWTH",
        "GROWTH",
        100000,
        10,
        12,
        500000,
        15 // insufficient
      );

      expect(analysis.conflict_reasons.some((r) => r.includes("Staffing"))).toBe(true);
    });

    it("should detect KPI conflict (growth vs cost reduction)", () => {
      const analysis = detectConflict(
        "rec-a",
        "GROWTH",
        "GROWTH",
        100000,
        5,
        12,
        "rec-b",
        "COST_REDUCTION",
        "CASHFLOW",
        50000,
        2,
        6,
        500000,
        20
      );

      expect(analysis.conflict_type).toBe("DIRECT_CONFLICT");
      expect(analysis.blocking).toBe(true);
    });

    it("should detect mutually exclusive (budget severely constrained)", () => {
      const analysis = detectConflict(
        "rec-a",
        "GROWTH",
        "GROWTH",
        500000,
        10,
        24,
        "rec-b",
        "GROWTH",
        "GROWTH",
        500000,
        10,
        24,
        600000, // 1.5x combined budget
        20
      );

      expect(analysis.conflict_type).toBe("MUTUALLY_EXCLUSIVE");
      expect(analysis.blocking).toBe(true);
      expect(canCoexistAsDoNow(analysis)).toBe(false);
    });
  });

  describe("G11: Action Reversibility Engine", () => {
    it("should identify low-regret action", () => {
      const assessment = assessReversibility(
        "rec-123",
        10, // rollback cost %
        3, // rollback time days
        5, // blast radius %
        0.1, // measurement difficulty
        0.15 // operator recovery complexity
      );

      expect(assessment.low_regret).toBe(true);
      expect(assessment.risk_level).toBe("LOW");
      expect(isSafeToExecute(assessment)).toBe(true);
    });

    it("should downgrade high irreversibility with low confidence", () => {
      const assessment = assessReversibility(
        "rec-123",
        80,
        30,
        60,
        0.8,
        0.7
      );

      expect(assessment.risk_level).toBe("CRITICAL");
      expect(assessment.blocking).toBe(true);
      expect(assessment.confidence_adjustment).toBeLessThan(-20);
    });

    it("should block very hard to measure irreversible action", () => {
      const assessment = assessReversibility(
        "rec-123",
        70,
        20,
        50,
        0.9, // very hard
        0.8
      );

      expect(assessment.measurement_difficulty).toBe("VERY_HARD");
      expect(assessment.blocking).toBe(true);
    });

    it("should boost confidence for low-regret actions", () => {
      const lowRegret = assessReversibility(
        "rec-123",
        5,
        2,
        3,
        0.2,
        0.1
      );

      expect(lowRegret.low_regret).toBe(true);
      expect(lowRegret.confidence_adjustment).toBeGreaterThan(0);
    });
  });

  describe("G12: Recommendation Debt Control", () => {
    it("should detect low debt", () => {
      const assessment = assessRecommendationDebt(
        5, // active recs
        1, // ignored
        1, // stale
        0.4, // capacity used
        0, // blockers
        0 // overdue
      );

      expect(assessment.debt_level).toBe("LOW");
      expect(canAcceptNewRecommendation(assessment)).toBe(true);
    });

    it("should detect medium debt with capacity pressure", () => {
      const assessment = assessRecommendationDebt(11, 2, 2, 0.65, 0, 0);

      expect(assessment.debt_level).toBe("MEDIUM");
    });

    it("should detect high debt with ignored rate", () => {
      const assessment = assessRecommendationDebt(
        12,
        4, // 33% ignored rate
        4,
        0.7,
        0,
        0
      );

      expect(assessment.debt_level).toBe("HIGH");
      expect(assessment.compression_required).toBe(true);
    });

    it("should block new recommendations at critical capacity", () => {
      const assessment = assessRecommendationDebt(
        25, // way over
        8,
        10,
        0.95, // 95% capacity
        5,
        0
      );

      expect(assessment.debt_level).toBe("CRITICAL");
      expect(assessment.blocking).toBe(true);
      expect(canAcceptNewRecommendation(assessment)).toBe(false);
    });

    it("should require pruning of stale recommendations", () => {
      const assessment = assessRecommendationDebt(
        10,
        2,
        12, // many stale
        0.5,
        0,
        0
      );

      expect(assessment.pruning_required).toBe(true);
    });

    it("should block when overdue actions exist", () => {
      const assessment = assessRecommendationDebt(8, 1, 2, 0.5, 1, 3);

      expect(assessment.blocking).toBe(true);
      expect(assessment.debt_level).toBe("CRITICAL");
    });

    it("should provide debt reduction actions", () => {
      const assessment = assessRecommendationDebt(
        15,
        5, // high ignored rate
        6, // stale
        0.8,
        2,
        1
      );

      const actions = getDebtReductionActions(assessment);

      expect(actions.length).toBeGreaterThan(0);
      expect(actions.some((a) => a.includes("stale"))).toBe(true);
    });
  });

  describe("G13: Recommendation Failure Accounting", () => {
    it("should record successful outcome", () => {
      const outcome = recordOutcome(
        "rec-123",
        "SUCCESSFUL",
        true,
        true,
        "Increase revenue",
        "Revenue increased 15%",
        undefined,
        "STRONGLY_ATTRIBUTABLE",
        0.9
      );

      expect(outcome.outcome_type).toBe("SUCCESSFUL");
      expect(outcome.outcome_variance).toBe(100);
      expect(outcome.recommendation_reliability_delta).toBeGreaterThan(0);
    });

    it("should record harmful outcome with reliability penalty", () => {
      const outcome = recordOutcome(
        "rec-123",
        "HARMFUL",
        true,
        true,
        "Reduce costs",
        "Customers churned due to service degradation",
        undefined,
        "STRONGLY_ATTRIBUTABLE",
        0.85
      );

      expect(outcome.harmful_outcome).toBe(true);
      expect(outcome.outcome_variance).toBe(-100);
      expect(outcome.recommendation_reliability_delta).toBeLessThan(-30);
    });

    it("should not learn from weakly attributed successful outcome", () => {
      const outcome = recordOutcome(
        "rec-123",
        "SUCCESSFUL",
        true,
        true,
        "Growth target",
        "Revenue grew",
        undefined,
        "WEAKLY_ATTRIBUTABLE",
        0.7
      );

      expect(outcome.recommendation_reliability_delta).toBe(0); // NO learning
    });

    it("should not learn from non-attributable outcomes", () => {
      const outcome = recordOutcome(
        "rec-123",
        "SUCCESSFUL",
        true,
        true,
        "Revenue",
        "Revenue grew",
        undefined,
        "NON_ATTRIBUTABLE",
        0.6
      );

      expect(outcome.recommendation_reliability_delta).toBe(0);
    });

    it("should calculate reliability score from outcomes", () => {
      const outcomes = [
        recordOutcome("rec-123", "SUCCESSFUL", true, true, "predict", "actual", undefined, "STRONGLY_ATTRIBUTABLE", 0.9),
        recordOutcome("rec-123", "SUCCESSFUL", true, true, "predict", "actual", undefined, "STRONGLY_ATTRIBUTABLE", 0.9),
        recordOutcome("rec-123", "UNSUCCESSFUL", true, true, "predict", "actual", undefined, "STRONGLY_ATTRIBUTABLE", 0.85),
      ];

      const score = calculateReliabilityScore("rec-123", outcomes);

      expect(score.total_outcomes_tracked).toBe(3);
      expect(score.success_rate).toBeGreaterThan(0.5);
      expect(score.reliability_score).toBeGreaterThan(0);
    });

    it("should detect unreliable recommendations", () => {
      const outcomes = [
        recordOutcome("rec-456", "UNSUCCESSFUL", true, true, "predict", "actual", undefined, "STRONGLY_ATTRIBUTABLE", 0.8),
        recordOutcome("rec-456", "UNSUCCESSFUL", true, true, "predict", "actual", undefined, "STRONGLY_ATTRIBUTABLE", 0.8),
        recordOutcome("rec-456", "UNSUCCESSFUL", true, true, "predict", "actual", undefined, "STRONGLY_ATTRIBUTABLE", 0.8),
      ];

      const score = calculateReliabilityScore("rec-456", outcomes);
      const unreliable = getUnreliableRecommendations([score], 0.3);

      expect(unreliable.length).toBe(1);
      expect(score.reliability_score).toBeLessThan(0.3);
    });

    it("should track harm history", () => {
      const outcomes = [
        recordOutcome("rec-789", "SUCCESSFUL", true, true, "p", "a", undefined, "STRONGLY_ATTRIBUTABLE", 0.9),
        recordOutcome("rec-789", "HARMFUL", true, true, "p", "a", undefined, "STRONGLY_ATTRIBUTABLE", 0.8),
        recordOutcome("rec-789", "UNSUCCESSFUL", true, true, "p", "a", undefined, "STRONGLY_ATTRIBUTABLE", 0.8),
        recordOutcome("rec-789", "HARMFUL", true, true, "p", "a", undefined, "STRONGLY_ATTRIBUTABLE", 0.8),
      ];

      const history = getHarmHistory(outcomes);

      expect(history.harmful_count).toBe(2);
      expect(history.harmful_pct).toBeGreaterThan(0);
    });

    it("should mark abandoned outcome as zero variance", () => {
      const outcome = recordOutcome(
        "rec-999",
        "ABANDONED",
        true,
        false,
        "predict",
        "operator cancelled",
        "Operator cancelled due to changing priorities",
        "NON_ATTRIBUTABLE",
        0.5
      );

      expect(outcome.outcome_variance).toBe(0);
      expect(outcome.executed).toBe(false);
    });
  });
});
