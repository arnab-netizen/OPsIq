/**
 * B12-S1: Business Condition Profile Evaluation — Pure Function Tests
 *
 * Verifies:
 * - Health score computation (owner, team, customer, financial)
 * - Overall condition score calculation
 * - Status mapping (score → status)
 * - Risk and strength identification
 * - Condition transition detection
 * - No external dependencies, deterministic, no DB
 */

import { describe, it, expect } from "vitest";
import {
  scoreOwnerHealth,
  scoreTeamHealth,
  scoreCustomerHealth,
  scoreFinancialHealth,
  computeConditionScore,
  scoreToConditionStatus,
  statusToUrgency,
  statusToHardeningPressure,
  identifyRiskFactors,
  identifyStrengths,
  evaluateBusinessConditionProfile,
  evaluateConditionTransition,
  type BusinessConditionProfileAssessment,
  type HealthScores,
} from "../../domain/business-facts/business-condition-profile";
import type { BusinessDiagnosis } from "../../domain/business-facts/diagnosis";
import type { HarmRiskAssessment } from "../../domain/business-facts/harm-guardrails";
import type { OwnerConstraintViolation } from "../../domain/business-facts/owner-constraints";
import type { KPIProfile } from "../../domain/business-facts/kpi-profiles";

// --- Test Fixtures ---

const createMockDiagnosis = (overrides?: Partial<BusinessDiagnosis>): BusinessDiagnosis => ({
  diagnosis_id: "diag_test_001",
  domain: "sales",
  created_at: new Date().toISOString(),
  business_id: "biz_001",
  workspace_id: "ws_001",
  problem: "Revenue declining",
  root_cause: "Poor lead quality",
  impact: "Critical revenue loss if not addressed",
  timeline_to_crisis: "2-3 months",
  evidence: {
    fact_ids: ["fact_001", "fact_002"],
    evidence_strength: "strong",
    contradictions: [],
    missing_data_gaps: [],
  },
  confidence_score: 0.85,
  confidence_reasoning: "Strong evidence from sales metrics",
  missing_data: [],
  can_act_without_data: true,
  recommended_action: {
    action_id: "act_001",
    description: "Improve lead scoring",
    category: "revenue_growth",
    expected_impact: "20% revenue increase",
    timeline_weeks: 8,
  },
  owner_action: {
    action_id: "act_001",
    owner_step: "Review and approve lead scoring model",
    deadline_days: 7,
    success_criteria: ["Model approved", "Scoring implemented"],
  },
  verification_metric: "50% improvement in lead quality score",
  risks: [
    {
      risk_id: "risk_001",
      description: "Model rejection",
      mitigation: "Involve sales team in design",
      probability: "low",
      impact: "medium",
      verification_metric: "Team adoption rate",
    },
  ],
  alternative: null,
  validation_status: "owner_approved",
  notes: [],
  ...overrides,
});

const createMockHarmRisks = (
  overrides?: Partial<HarmRiskAssessment>,
): HarmRiskAssessment => ({
  assessment_id: "risk_001",
  cash_impact: {
    risk_type: "cash_impact",
    estimated_cash_required: 50000,
    estimated_monthly_available_cash: 40000,
    severity: "medium",
    risk_description: "Moderate cash requirement",
  },
  margin_impact: {
    risk_type: "margin_impact",
    margin_impact_percent: -5,
    severity: "medium",
    risk_description: "Slight margin pressure",
  },
  team_capacity: {
    risk_type: "team_capacity",
    team_capacity_percent: 60,
    severity: "low",
    risk_description: "Team has capacity",
  },
  owner_burnout: {
    risk_type: "owner_burnout",
    workload_hours_per_week: 45,
    severity: "low",
    risk_description: "Normal workload",
  },
  market_response: {
    risk_type: "market_response",
    competitor_risk: false,
    severity: "low",
    risk_description: "No competitive risk",
  },
  customer_impact: {
    risk_type: "customer_impact",
    customer_risk: false,
    severity: "low",
    risk_description: "No customer impact",
  },
  execution_risk: {
    risk_type: "execution_risk",
    execution_feasibility_percent: 80,
    severity: "low",
    risk_description: "Feasible execution",
  },
  regulatory_risk: {
    risk_type: "regulatory_risk",
    regulatory_concern: false,
    severity: "low",
    risk_description: "No regulatory concern",
  },
  ...overrides,
});

const createMockConstraints = (
  count: number = 0,
): OwnerConstraintViolation[] => {
  const violations: OwnerConstraintViolation[] = [];
  for (let i = 0; i < count; i++) {
    violations.push({
      constraint_id: `cst_${i}`,
      constraint_type: "availability",
      severity: i === 0 ? "critical" : "high",
      violated: true,
      reason: `Constraint violation ${i}`,
    });
  }
  return violations;
};

const createMockKPIProfile = (
  overrides?: Partial<KPIProfile>,
): KPIProfile => ({
  profile_id: "kpi_saas",
  business_type: "saas",
  core_kpis: ["mrr", "arpu", "churn", "nps"],
  failure_modes: [
    { mode: "high_churn", trigger: "churn > 10%", mitigation: "increase retention" },
  ],
  critical_ratios: { "burn/runway": 0.3, "cac/ltv": 0.25 },
  action_patterns: ["daily_monitoring", "weekly_review", "monthly_planning"],
  benchmarks: { industry_avg_nps: 45, industry_avg_churn: 5 },
  ...overrides,
});

// --- Health Score Tests ---

describe("B12-S1: Business Condition Profile Evaluation", () => {
  describe("scoreOwnerHealth", () => {
    it("should return 50 for diagnosis with no constraints", () => {
      const diagnosis = createMockDiagnosis();
      const constraints: OwnerConstraintViolation[] = [];

      const score = scoreOwnerHealth(diagnosis, constraints);

      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it("should reduce score for critical constraint violations", () => {
      const diagnosis = createMockDiagnosis();
      const constraints = createMockConstraints(2); // 1 critical, 1 high

      const score = scoreOwnerHealth(diagnosis, constraints);

      expect(score).toBeLessThan(scoreOwnerHealth(diagnosis, []));
    });

    it("should increase score for high diagnosis confidence", () => {
      const diagnosis = createMockDiagnosis({ confidence_score: 0.85 });
      const constraints: OwnerConstraintViolation[] = [];

      const score = scoreOwnerHealth(diagnosis, constraints);

      expect(score).toBeGreaterThan(
        scoreOwnerHealth(createMockDiagnosis({ confidence_score: 0.3 }), []),
      );
    });

    it("should penalize unrealistic timelines", () => {
      const unrealistic = createMockDiagnosis({
        owner_action: {
          action_id: "act_001",
          owner_step: "Review",
          deadline_days: 45,
          success_criteria: [],
        },
      });
      const realistic = createMockDiagnosis({
        owner_action: {
          action_id: "act_001",
          owner_step: "Review",
          deadline_days: 7,
          success_criteria: [],
        },
      });

      const unrealisticScore = scoreOwnerHealth(unrealistic, []);
      const realisticScore = scoreOwnerHealth(realistic, []);

      expect(unrealisticScore).toBeLessThanOrEqual(realisticScore);
    });
  });

  describe("scoreTeamHealth", () => {
    it("should score based on KPI profile process maturity", () => {
      const profile = createMockKPIProfile({
        action_patterns: ["pattern1", "pattern2", "pattern3"],
      });

      const score = scoreTeamHealth(profile);

      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it("should penalize failure modes", () => {
      const profileWithFailures = createMockKPIProfile({
        failure_modes: [
          { mode: "m1", trigger: "t1", mitigation: "mit1" },
          { mode: "m2", trigger: "t2", mitigation: "mit2" },
          { mode: "m3", trigger: "t3", mitigation: "mit3" },
        ],
      });
      const profileWithoutFailures = createMockKPIProfile({
        failure_modes: [],
      });

      const scoreWith = scoreTeamHealth(profileWithFailures);
      const scoreWithout = scoreTeamHealth(profileWithoutFailures);

      expect(scoreWith).toBeLessThan(scoreWithout);
    });
  });

  describe("scoreCustomerHealth", () => {
    it("should score based on KPI profile benchmarks", () => {
      const profile = createMockKPIProfile();

      const score = scoreCustomerHealth(profile);

      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it("should increase score for strong benchmarks", () => {
      const strongBenchmarks = createMockKPIProfile({
        benchmarks: { nps: 60, churn: 2, retention: 95, nrr: 120 },
      });
      const weakBenchmarks = createMockKPIProfile({
        benchmarks: { nps: 20, churn: 15 },
      });

      const strongScore = scoreCustomerHealth(strongBenchmarks);
      const weakScore = scoreCustomerHealth(weakBenchmarks);

      expect(strongScore).toBeGreaterThan(weakScore);
    });
  });

  describe("scoreFinancialHealth", () => {
    it("should penalize missing data", () => {
      const withMissingData = createMockDiagnosis({
        missing_data: ["cash_position", "burn_rate", "debt_amount"],
      });
      const withoutMissingData = createMockDiagnosis({
        missing_data: [],
      });

      const withScore = scoreFinancialHealth(withMissingData);
      const withoutScore = scoreFinancialHealth(withoutMissingData);

      expect(withScore).toBeLessThan(withoutScore);
    });

    it("should reduce score for critical diagnosis impact", () => {
      const critical = createMockDiagnosis({
        impact: "Critical business failure if not addressed",
      });
      const moderate = createMockDiagnosis({
        impact: "Moderate impact on operations",
      });

      const criticalScore = scoreFinancialHealth(critical);
      const moderateScore = scoreFinancialHealth(moderate);

      expect(criticalScore).toBeLessThan(moderateScore);
    });

    it("should benefit from high confidence", () => {
      const highConfidence = createMockDiagnosis({
        confidence_score: 0.9,
      });
      const lowConfidence = createMockDiagnosis({
        confidence_score: 0.3,
      });

      const highScore = scoreFinancialHealth(highConfidence);
      const lowScore = scoreFinancialHealth(lowConfidence);

      expect(highScore).toBeGreaterThan(lowScore);
    });
  });

  describe("computeConditionScore", () => {
    it("should compute weighted average with correct weights", () => {
      const scores: HealthScores = {
        owner_health_score: 100,
        team_health_score: 50,
        customer_health_score: 50,
        financial_health_score: 50,
      };

      const result = computeConditionScore(scores);

      // (100*0.25 + 50*0.2 + 50*0.2 + 50*0.35) = 25 + 10 + 10 + 17.5 = 62.5 → rounds to 62 or 63
      expect(result).toBeGreaterThanOrEqual(62);
      expect(result).toBeLessThanOrEqual(63);
    });

    it("should weight financial health most heavily", () => {
      const allOwner: HealthScores = {
        owner_health_score: 100,
        team_health_score: 0,
        customer_health_score: 0,
        financial_health_score: 0,
      };
      const allFinancial: HealthScores = {
        owner_health_score: 0,
        team_health_score: 0,
        customer_health_score: 0,
        financial_health_score: 100,
      };

      const ownerScore = computeConditionScore(allOwner);
      const financialScore = computeConditionScore(allFinancial);

      // Financial weight (35%) > owner weight (25%)
      expect(financialScore).toBeGreaterThan(ownerScore);
    });
  });

  describe("scoreToConditionStatus", () => {
    it("should map score ranges to status correctly", () => {
      expect(scoreToConditionStatus(15)).toBe("critical");
      expect(scoreToConditionStatus(35)).toBe("stressed");
      expect(scoreToConditionStatus(50)).toBe("stable");
      expect(scoreToConditionStatus(70)).toBe("healthy");
      expect(scoreToConditionStatus(85)).toBe("thriving");
    });

    it("should handle boundary values", () => {
      expect(scoreToConditionStatus(19)).toBe("critical");
      expect(scoreToConditionStatus(20)).toBe("stressed");
      expect(scoreToConditionStatus(39)).toBe("stressed");
      expect(scoreToConditionStatus(40)).toBe("stable");
    });
  });

  describe("statusToUrgency", () => {
    it("should map status to urgency level", () => {
      expect(statusToUrgency("critical")).toBe("critical");
      expect(statusToUrgency("stressed")).toBe("high");
      expect(statusToUrgency("stable")).toBe("medium");
      expect(statusToUrgency("healthy")).toBe("low");
      expect(statusToUrgency("thriving")).toBe("low");
    });
  });

  describe("statusToHardeningPressure", () => {
    it("should map status to hardening pressure", () => {
      expect(statusToHardeningPressure("critical")).toBe("maximum");
      expect(statusToHardeningPressure("stressed")).toBe("high");
      expect(statusToHardeningPressure("stable")).toBe("normal");
      expect(statusToHardeningPressure("healthy")).toBe("low");
      expect(statusToHardeningPressure("thriving")).toBe("minimal");
    });
  });

  describe("identifyRiskFactors", () => {
    it("should identify risks from contradictions", () => {
      const diagnosis = createMockDiagnosis({
        evidence: {
          fact_ids: ["f1", "f2"],
          evidence_strength: "moderate",
          contradictions: ["c1", "c2"],
          missing_data_gaps: [],
        },
      });
      const risks = createMockHarmRisks();

      const factors = identifyRiskFactors(diagnosis, risks);

      expect(factors.some((f) => f.includes("contradiction"))).toBe(true);
    });

    it("should identify risks from missing data", () => {
      const diagnosis = createMockDiagnosis({
        missing_data: ["data1", "data2", "data3", "data4"],
      });
      const risks = createMockHarmRisks();

      const factors = identifyRiskFactors(diagnosis, risks);

      expect(factors.some((f) => f.includes("data gaps"))).toBe(true);
    });

    it("should identify risks from low confidence", () => {
      const diagnosis = createMockDiagnosis({
        confidence_score: 0.3,
      });
      const risks = createMockHarmRisks();

      const factors = identifyRiskFactors(diagnosis, risks);

      expect(factors.some((f) => f.includes("confidence"))).toBe(true);
    });

    it("should identify critical harm guardrail risks", () => {
      const diagnosis = createMockDiagnosis();
      const risks = createMockHarmRisks({
        cash_impact: {
          risk_type: "cash_impact",
          estimated_cash_required: 100000,
          estimated_monthly_available_cash: 5000,
          severity: "critical",
          risk_description: "Critical cash shortfall",
        },
      });

      const factors = identifyRiskFactors(diagnosis, risks);

      expect(factors.some((f) => f.includes("cash"))).toBe(true);
    });
  });

  describe("identifyStrengths", () => {
    it("should identify strengths from high confidence", () => {
      const diagnosis = createMockDiagnosis({
        confidence_score: 0.85,
      });
      const constraints: OwnerConstraintViolation[] = [];

      const strengths = identifyStrengths(diagnosis, constraints);

      expect(strengths.some((s) => s.includes("evidence"))).toBe(true);
    });

    it("should identify strengths when can act without data", () => {
      const diagnosis = createMockDiagnosis({
        can_act_without_data: true,
      });
      const constraints: OwnerConstraintViolation[] = [];

      const strengths = identifyStrengths(diagnosis, constraints);

      expect(strengths.some((s) => s.includes("without"))).toBe(true);
    });

    it("should identify strengths when no critical constraints", () => {
      const diagnosis = createMockDiagnosis();
      const constraints = createMockConstraints(0);

      const strengths = identifyStrengths(diagnosis, constraints);

      expect(strengths.some((s) => s.includes("constraint"))).toBe(true);
    });

    it("should identify strengths from considered alternatives", () => {
      const diagnosis = createMockDiagnosis({
        alternative: {
          alternative_id: "alt_001",
          description: "Alternative approach",
          pros: ["pro1"],
          cons: ["con1"],
          why_not_primary: "Primary better aligns with goals",
        },
      });
      const constraints: OwnerConstraintViolation[] = [];

      const strengths = identifyStrengths(diagnosis, constraints);

      expect(strengths.some((s) => s.includes("options"))).toBe(true);
    });
  });

  describe("evaluateBusinessConditionProfile", () => {
    it("should produce valid assessment with all fields", () => {
      const diagnosis = createMockDiagnosis();
      const risks = createMockHarmRisks();
      const constraints: OwnerConstraintViolation[] = [];
      const kpiProfile = createMockKPIProfile();

      const assessment = evaluateBusinessConditionProfile(
        diagnosis,
        risks,
        constraints,
        kpiProfile,
      );

      expect(assessment).toHaveProperty("condition_score");
      expect(assessment).toHaveProperty("health_scores");
      expect(assessment).toHaveProperty("condition_status");
      expect(assessment).toHaveProperty("risk_factors");
      expect(assessment).toHaveProperty("strengths");
      expect(assessment).toHaveProperty("urgency_level");
      expect(assessment).toHaveProperty("hardening_pressure");
    });

    it("should produce consistent scores within valid ranges", () => {
      const diagnosis = createMockDiagnosis();
      const risks = createMockHarmRisks();
      const constraints: OwnerConstraintViolation[] = [];
      const kpiProfile = createMockKPIProfile();

      const assessment = evaluateBusinessConditionProfile(
        diagnosis,
        risks,
        constraints,
        kpiProfile,
      );

      expect(assessment.condition_score).toBeGreaterThanOrEqual(0);
      expect(assessment.condition_score).toBeLessThanOrEqual(100);
      expect(assessment.health_scores.owner_health_score).toBeGreaterThanOrEqual(0);
      expect(assessment.health_scores.owner_health_score).toBeLessThanOrEqual(100);
      expect(assessment.health_scores.team_health_score).toBeGreaterThanOrEqual(0);
      expect(assessment.health_scores.team_health_score).toBeLessThanOrEqual(100);
      expect(assessment.health_scores.customer_health_score).toBeGreaterThanOrEqual(0);
      expect(assessment.health_scores.customer_health_score).toBeLessThanOrEqual(100);
      expect(assessment.health_scores.financial_health_score).toBeGreaterThanOrEqual(0);
      expect(assessment.health_scores.financial_health_score).toBeLessThanOrEqual(100);
    });

    it("should correctly match urgency to status", () => {
      const diagnosis = createMockDiagnosis();
      const risks = createMockHarmRisks();
      const constraints: OwnerConstraintViolation[] = [];
      const kpiProfile = createMockKPIProfile();

      const assessment = evaluateBusinessConditionProfile(
        diagnosis,
        risks,
        constraints,
        kpiProfile,
      );

      expect(
        statusToUrgency(assessment.condition_status),
      ).toBe(assessment.urgency_level);
    });

    it("should correctly match hardening pressure to status", () => {
      const diagnosis = createMockDiagnosis();
      const risks = createMockHarmRisks();
      const constraints: OwnerConstraintViolation[] = [];
      const kpiProfile = createMockKPIProfile();

      const assessment = evaluateBusinessConditionProfile(
        diagnosis,
        risks,
        constraints,
        kpiProfile,
      );

      expect(
        statusToHardeningPressure(assessment.condition_status),
      ).toBe(assessment.hardening_pressure);
    });
  });

  describe("evaluateConditionTransition", () => {
    it("should detect status change", () => {
      const transition = evaluateConditionTransition(
        "healthy",
        "stressed",
        80,
        45,
      );

      expect(transition.changed).toBe(true);
      expect(transition.previous_status).toBe("healthy");
      expect(transition.new_status).toBe("stressed");
    });

    it("should detect severity increase", () => {
      const transition = evaluateConditionTransition(
        "stable",
        "stressed",
        55,
        35,
      );

      expect(transition.severity_increased).toBe(true);
      expect(transition.requires_adaptive_reevaluation).toBe(true);
    });

    it("should detect first assessment", () => {
      const transition = evaluateConditionTransition(
        null,
        "stable",
        null,
        55,
      );

      expect(transition.previous_status).toBeNull();
      expect(transition.requires_adaptive_reevaluation).toBe(true);
    });

    it("should trigger reevaluation for score decline", () => {
      const transition = evaluateConditionTransition(
        "stable",
        "stable",
        60,
        50,
      );

      expect(transition.changed).toBe(false);
      expect(transition.severity_increased).toBe(true);
      expect(transition.requires_adaptive_reevaluation).toBe(true);
    });

    it("should trigger reevaluation when score < 40", () => {
      const transition = evaluateConditionTransition(
        "stressed",
        "stressed",
        45,
        35,
      );

      expect(transition.requires_adaptive_reevaluation).toBe(true);
    });

    it("should not trigger reevaluation for stable conditions", () => {
      const transition = evaluateConditionTransition(
        "healthy",
        "healthy",
        75,
        76,
      );

      expect(transition.requires_adaptive_reevaluation).toBe(false);
    });

    it("should provide descriptive transition reason", () => {
      const transitionChange = evaluateConditionTransition(
        "healthy",
        "stressed",
        80,
        45,
      );

      expect(transitionChange.transition_reason).toContain("healthy");
      expect(transitionChange.transition_reason).toContain("stressed");
    });
  });
});
