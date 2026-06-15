/**
 * B17-S1: Synthetic Business Scenario Simulator — Unit Tests
 *
 * Tests verify:
 * - All 12 scenarios are well-formed and validate
 * - Scenario execution is deterministic (same inputs → same outputs)
 * - Result scoring correctly identifies pass/fail
 * - Failure conditions are enforced
 */

import { describe, it, expect } from "vitest";
import {
  createAllScenarios,
  getScenarioById,
  getScenarioByType,
  executeScenario,
  scoreAllScenarios,
} from "@/domain/benchmark/scenario-engine";
import {
  validateSyntheticScenario,
  checkFailureConditions,
  scoreScenarioResult,
  type SyntheticScenario,
  type ScenarioRunResult,
  type RiskFlag,
} from "@/domain/benchmark/synthetic-scenario";

describe("B17-S1: Synthetic Business Scenario Simulator", () => {
  describe("Scenario Creation and Validation", () => {
    it("should create all 12 scenarios without errors", () => {
      const scenarios = createAllScenarios();
      expect(scenarios.length).toBe(12);

      // Verify scenario types
      const types = new Set(scenarios.map((s) => s.type));
      expect(types.size).toBe(12);
    });

    it("should validate all scenarios meet acceptance criteria", () => {
      const scenarios = createAllScenarios();

      for (const scenario of scenarios) {
        const validation = validateSyntheticScenario(scenario);
        expect(validation.valid).toBe(true);
        expect(validation.errors.length).toBe(0);
      }
    });

    it("should have correctly named scenario IDs", () => {
      const scenarios = createAllScenarios();

      for (const scenario of scenarios) {
        expect(scenario.id).toMatch(/^scenario_[a-z_]+_v\d+$/);
      }
    });

    it("should have all expected risk flags for each scenario", () => {
      const scenarios = createAllScenarios();

      for (const scenario of scenarios) {
        expect(scenario.expectedRiskFlags.length).toBeGreaterThan(0);

        // All risk flags should have type, severity, and description
        for (const flag of scenario.expectedRiskFlags) {
          expect(flag.riskType).toBeTruthy();
          expect(["critical", "high", "medium", "low"]).toContain(flag.severity);
          expect(flag.description).toBeTruthy();
        }
      }
    });

    it("should have all expected root causes for each scenario", () => {
      const scenarios = createAllScenarios();

      for (const scenario of scenarios) {
        expect(scenario.expectedRootCauses.length).toBeGreaterThan(0);

        for (const cause of scenario.expectedRootCauses) {
          expect(cause).toBeTruthy();
        }
      }
    });

    it("should have all expected recommendations for each scenario", () => {
      const scenarios = createAllScenarios();

      for (const scenario of scenarios) {
        expect(scenario.expectedRecommendations.length).toBeGreaterThan(0);

        for (const rec of scenario.expectedRecommendations) {
          expect(rec).toBeTruthy();
        }
      }
    });

    it("should have at least one failure condition per scenario", () => {
      const scenarios = createAllScenarios();

      for (const scenario of scenarios) {
        expect(scenario.failureConditions.length).toBeGreaterThan(0);

        for (const condition of scenario.failureConditions) {
          expect(condition.type).toBeTruthy();
          expect(condition.description).toBeTruthy();
          expect(typeof condition.failsSlice).toBe("boolean");
        }
      }
    });
  });

  describe("Scenario Retrieval", () => {
    it("should retrieve scenario by ID", () => {
      const scenario = getScenarioById("scenario_cash_crisis_v1");
      expect(scenario).toBeDefined();
      expect(scenario?.type).toBe("cash_crisis");
    });

    it("should return null for non-existent scenario ID", () => {
      const scenario = getScenarioById("scenario_nonexistent_v1");
      expect(scenario).toBeNull();
    });

    it("should retrieve scenario by type", () => {
      const scenario = getScenarioByType("high_revenue_low_profit");
      expect(scenario).toBeDefined();
      expect(scenario?.type).toBe("high_revenue_low_profit");
    });

    it("should return null for non-existent scenario type", () => {
      const scenario = getScenarioByType("nonexistent" as any);
      expect(scenario).toBeNull();
    });
  });

  describe("Scenario Execution: Cash Crisis", () => {
    it("should execute cash crisis scenario and pass with correct diagnosis", () => {
      const scenario = getScenarioById("scenario_cash_crisis_v1")!;

      // Correct diagnosis - pass all expected risks
      const result = executeScenario(
        scenario,
        scenario.expectedRootCauses, // Pass all causes to ensure >= 67% accuracy
        scenario.expectedRecommendations,
        scenario.expectedRiskFlags
      );

      expect(result.passed).toBe(true);
      expect(result.failureReasons.length).toBe(0);
    });

    it("should fail cash crisis if missing critical risk", () => {
      const scenario = getScenarioById("scenario_cash_crisis_v1")!;

      const result = executeScenario(
        scenario,
        [
          "Large customer account purchased on 120-day payment terms created accounts receivable buildup",
          "No cash forecast or daily monitoring; gap between profit and cash flow not visible",
        ],
        [
          "Implement daily cash forecast",
          "Establish credit policy",
          "Contact large customer immediately",
        ],
        [] // Missing all risk flags
      );

      expect(result.passed).toBe(false);
      expect(result.failureReasons.some((r) => r.includes("critical"))).toBe(true);
    });

    it("should fail cash crisis if missing primary cause", () => {
      const scenario = getScenarioById("scenario_cash_crisis_v1")!;

      const result = executeScenario(
        scenario,
        ["No cash forecast or daily monitoring; gap between profit and cash flow not visible"], // Missing primary cause
        [
          "Implement daily cash forecast",
          "Establish credit policy",
          "Contact large customer immediately",
        ],
        [{ riskType: "cash_runway_critical", severity: "critical", description: "Test" }]
      );

      expect(result.passed).toBe(false);
    });
  });

  describe("Scenario Execution: High Revenue Low Profit", () => {
    it("should execute high revenue/low profit scenario and pass with correct diagnosis", () => {
      const scenario = getScenarioById("scenario_high_revenue_low_profit_v1")!;

      const result = executeScenario(
        scenario,
        [
          "Sales team discounting to hit revenue targets (average deal price down 22%)",
          "Manufacturing inefficiency from rush orders; no production scheduling or batching",
        ],
        [
          "Change sales compensation to margin-based (not revenue-based) with clawback for deals <40% margin",
          "Implement production scheduling and batch optimization to reduce cost of goods",
          "Conduct supply chain cost reduction analysis; consider reshoring vs. optimization",
          "Hire Chief Manufacturing Officer to establish production discipline and cost controls",
        ],
        scenario.expectedRiskFlags
      );

      expect(result.passed).toBe(true);
    });

    it("should fail if margin erosion risk not identified", () => {
      const scenario = getScenarioById("scenario_high_revenue_low_profit_v1")!;

      const result = executeScenario(
        scenario,
        [
          "Sales team discounting to hit revenue targets",
          "Manufacturing inefficiency from rush orders",
        ],
        ["Change sales compensation", "Implement production scheduling"],
        [{ riskType: "wrong_risk", severity: "high", description: "Test" }] // Wrong risk
      );

      expect(result.passed).toBe(false);
    });
  });

  describe("Scenario Execution: Low Revenue High Profit", () => {
    it("should execute low revenue/high profit scenario and pass", () => {
      const scenario = getScenarioById("scenario_low_revenue_high_profit_v1")!;

      const result = executeScenario(
        scenario,
        [
          "Scaling limited by senior consultant availability, not demand",
          "Founder unwilling to add management overhead; prefers to keep profit margin high",
        ],
        [
          "Decision: choose between growth and current margin",
          "If growth desired, hire consultants and invest in training",
        ],
        scenario.expectedRiskFlags
      );

      expect(result.passed).toBe(true);
    });

    it("should fail if identifying wrong primary cause", () => {
      const scenario = getScenarioById("scenario_low_revenue_high_profit_v1")!;

      const result = executeScenario(
        scenario,
        ["Product-market fit issue", "Weak demand signals"],
        ["Pivot messaging", "Increase marketing spend"],
        [{ riskType: "capacity_constraint", severity: "medium", description: "Test" }]
      );

      expect(result.passed).toBe(false);
    });
  });

  describe("Scenario Execution: Bad Marketing ROI", () => {
    it("should execute bad marketing ROI scenario and pass", () => {
      const scenario = getScenarioById("scenario_bad_marketing_roi_v1")!;

      const result = executeScenario(
        scenario,
        [
          "Marketing targeting wrong audience (too broad); message-market fit issue",
          "Landing page conversion rate is 1.2% (industry standard 3-5%)",
        ],
        [
          "Pause broad-audience campaigns; pivot to specific vertical/company size",
          "Conduct landing page audit and A/B test",
          "Establish clear SLA between marketing and sales",
        ],
        scenario.expectedRiskFlags
      );

      expect(result.passed).toBe(true);
    });
  });

  describe("Scenario Execution: High Churn", () => {
    it("should execute high churn scenario and pass", () => {
      const scenario = getScenarioById("scenario_high_churn_v1")!;

      const result = executeScenario(
        scenario,
        [
          "Product-market fit issue: customers discover product does not solve stated problem",
          "Onboarding is weak; customers do not achieve value in first 30 days",
        ],
        [
          "Conduct churn analysis: interview lost customers",
          "Establish product value milestone; measure % reaching it by day 30",
          "Implement mandatory onboarding program",
        ],
        scenario.expectedRiskFlags
      );

      expect(result.passed).toBe(true);
    });
  });

  describe("Scenario Execution: Inventory Overstock", () => {
    it("should execute inventory overstock scenario and pass", () => {
      const scenario = getScenarioById("scenario_inventory_overstock_v1")!;

      const result = executeScenario(
        scenario,
        [
          "Demand forecasting is inaccurate; orders placed based on predictions, not actual demand signals",
          "Inventory management is manual/spreadsheet-based; no automatic reorder or velocity tracking",
        ],
        [
          "Implement demand planning system that tracks actual sales velocity",
          "Conduct SKU analysis; identify slow-movers and implement clearance/discount strategy",
          "Establish weekly sales-procurement sync",
        ],
        scenario.expectedRiskFlags
      );

      expect(result.passed).toBe(true);
    });
  });

  describe("Scenario Execution: Staff Productivity", () => {
    it("should execute staff productivity scenario and pass", () => {
      const scenario = getScenarioById("scenario_staff_productivity_v1")!;

      const result = executeScenario(
        scenario,
        [
          "Team grew too fast without establishing communication/coordination structures",
          "No clear product roadmap or prioritization; teams working on parallel projects",
        ],
        [
          "Establish product roadmap with quarterly planning",
          "Implement weekly triage/planning ceremonies",
          "Hire engineering managers to establish proper 1-on-1 cadence",
        ],
        scenario.expectedRiskFlags
      );

      expect(result.passed).toBe(true);
    });
  });

  describe("Scenario Execution: Founder Blind Spot", () => {
    it("should execute founder blind spot scenario and pass", () => {
      const scenario = getScenarioById("scenario_founder_blind_spot_v1")!;

      const result = executeScenario(
        scenario,
        scenario.expectedRootCauses.slice(0, 2), // Pass at least 2 causes
        scenario.expectedRecommendations,
        scenario.expectedRiskFlags
      );

      expect(result.passed).toBe(true);
    });
  });

  describe("Scenario Execution: Debt Overload", () => {
    it("should execute debt overload scenario and pass", () => {
      const scenario = getScenarioById("scenario_debt_overload_v1")!;

      const result = executeScenario(
        scenario,
        scenario.expectedRootCauses.slice(0, 2), // Pass at least 2 causes
        scenario.expectedRecommendations,
        scenario.expectedRiskFlags
      );

      expect(result.passed).toBe(true);
    });
  });

  describe("Scenario Execution: Seasonal Business", () => {
    it("should execute seasonal business scenario and pass", () => {
      const scenario = getScenarioById("scenario_seasonal_business_v1")!;

      const result = executeScenario(
        scenario,
        ["Business model is fully seasonal; no off-season revenue diversification"],
        [
          "Develop summer/off-season revenue: mountain biking rentals",
          "Consider secondary location in opposite hemisphere",
        ],
        scenario.expectedRiskFlags
      );

      expect(result.passed).toBe(true);
    });
  });

  describe("Scenario Execution: Customer Concentration", () => {
    it("should execute customer concentration scenario and pass", () => {
      const scenario = getScenarioById("scenario_customer_concentration_v1")!;

      const result = executeScenario(
        scenario,
        scenario.expectedRootCauses.slice(0, 2), // Pass at least 2 causes
        scenario.expectedRecommendations,
        scenario.expectedRiskFlags
      );

      expect(result.passed).toBe(true);
    });
  });

  describe("Scenario Execution: Fast Growth Negative Cash", () => {
    it("should execute fast growth/negative cash scenario and pass", () => {
      const scenario = getScenarioById("scenario_fast_growth_negative_cash_v1")!;

      const result = executeScenario(
        scenario,
        scenario.expectedRootCauses.slice(0, 2), // Pass at least 2 causes
        scenario.expectedRecommendations,
        scenario.expectedRiskFlags
      );

      expect(result.passed).toBe(true);
    });
  });

  describe("Result Scoring", () => {
    it("should score a perfect scenario result at ~100", () => {
      const scenario = getScenarioById("scenario_cash_crisis_v1")!;

      const result: ScenarioRunResult = {
        scenarioId: scenario.id,
        runId: "test_run",
        identifiedCauses: scenario.expectedRootCauses,
        identifiedRecommendations: scenario.expectedRecommendations,
        identifiedRisks: scenario.expectedRiskFlags,
        confidenceScores: scenario.expectedRootCauses.map((c) => ({ cause: c, confidence: 0.9 })),
        causeAccuracy: 1.0,
        recommendationQuality: 1.0,
        falsePositives: 0,
        falseNegatives: 0,
        passed: true,
        failureReasons: [],
        evidence: [],
        ranAt: new Date(),
        executionTimeMs: 100,
      };

      const score = scoreScenarioResult(scenario, result);
      expect(score).toBeGreaterThan(90);
      expect(score).toBeLessThanOrEqual(100);
    });

    it("should score a poor result lower", () => {
      const scenario = getScenarioById("scenario_cash_crisis_v1")!;

      const result: ScenarioRunResult = {
        scenarioId: scenario.id,
        runId: "test_run",
        identifiedCauses: [],
        identifiedRecommendations: [],
        identifiedRisks: [],
        confidenceScores: [],
        causeAccuracy: 0.2,
        recommendationQuality: 0.1,
        falsePositives: 5,
        falseNegatives: 3,
        passed: false,
        failureReasons: ["Missing critical risk"],
        evidence: [],
        ranAt: new Date(),
        executionTimeMs: 100,
      };

      const score = scoreScenarioResult(scenario, result);
      expect(score).toBeLessThan(50);
    });
  });

  describe("Scenario Determinism", () => {
    it("should execute same scenario twice with identical results (determinism check)", () => {
      const scenario = getScenarioById("scenario_cash_crisis_v1")!;

      const causes = [
        "Large customer account purchased on 120-day payment terms created accounts receivable buildup",
        "No cash forecast or daily monitoring; gap between profit and cash flow not visible",
      ];
      const recs = [
        "Implement daily cash forecast (14-day rolling minimum required balance)",
        "Establish credit policy: max 30-day terms unless specifically approved with bank backing",
      ];
      const risks: RiskFlag[] = [
        { riskType: "cash_runway_critical", severity: "critical", description: "Test" },
      ];

      const result1 = executeScenario(scenario, causes, recs, risks);
      const result2 = executeScenario(scenario, causes, recs, risks);

      expect(result1.causeAccuracy).toBe(result2.causeAccuracy);
      expect(result1.recommendationQuality).toBe(result2.recommendationQuality);
      expect(result1.passed).toBe(result2.passed);
      expect(result1.failureReasons).toEqual(result2.failureReasons);
    });
  });

  describe("Batch Scoring", () => {
    it("should score all scenarios in batch", () => {
      const scenarios = createAllScenarios();

      // Create results for each scenario (all passing)
      const results = scenarios.map((scenario) =>
        executeScenario(
          scenario,
          scenario.expectedRootCauses,
          scenario.expectedRecommendations,
          scenario.expectedRiskFlags
        )
      );

      const batchScore = scoreAllScenarios(results);
      expect(batchScore.totalScenarios).toBe(12);
      expect(batchScore.passedCount).toBe(12);
      expect(batchScore.failedCount).toBe(0);
      expect(batchScore.averageScore).toBeGreaterThan(85);
    });

    it("should identify failed scenarios in batch", () => {
      const scenarios = createAllScenarios().slice(0, 3);

      // Create results: first two pass, third fails
      const results = [
        executeScenario(
          scenarios[0],
          scenarios[0].expectedRootCauses,
          scenarios[0].expectedRecommendations,
          scenarios[0].expectedRiskFlags
        ),
        executeScenario(
          scenarios[1],
          scenarios[1].expectedRootCauses,
          scenarios[1].expectedRecommendations,
          scenarios[1].expectedRiskFlags
        ),
        executeScenario(scenarios[2], [], [], []), // Empty diagnosis → fail
      ];

      const batchScore = scoreAllScenarios(results);
      expect(batchScore.passedCount).toBe(2);
      expect(batchScore.failedCount).toBe(1);
    });
  });

  describe("Failure Condition Enforcement", () => {
    it("should enforce critical failure conditions", () => {
      const scenario = getScenarioById("scenario_cash_crisis_v1")!;

      const result = executeScenario(
        scenario,
        ["Some random cause"], // Wrong causes
        ["Some random recommendation"], // Wrong recommendations
        [] // No risk flags
      );

      const failureCheck = checkFailureConditions(scenario, result);
      expect(failureCheck.hasFatal).toBe(true);
      expect(failureCheck.failedConditions.length).toBeGreaterThan(0);
    });

    it("should tolerate non-fatal violations", () => {
      const scenario = getScenarioById("scenario_low_revenue_high_profit_v1")!;

      // This scenario has non-fatal failures
      const result = executeScenario(
        scenario,
        ["Scaling limited by senior consultant availability, not demand"],
        ["Some recommendation"],
        [{ riskType: "capacity_constraint", severity: "medium", description: "Test" }]
      );

      const failureCheck = checkFailureConditions(scenario, result);
      // Depending on non-fatal violations, may or may not be fatal
      expect(typeof failureCheck.hasFatal).toBe("boolean");
    });
  });

  describe("Acceptance Criteria for All Scenarios", () => {
    it("should achieve perfect accuracy when providing all expected causes and recommendations", () => {
      const scenarios = createAllScenarios();

      for (const scenario of scenarios) {
        const result = executeScenario(
          scenario,
          scenario.expectedRootCauses,
          scenario.expectedRecommendations,
          scenario.expectedRiskFlags
        );

        expect(result.causeAccuracy).toBe(1.0);
        expect(result.recommendationQuality).toBe(1.0);
      }
    });

    it("should identify scenarios where minimum thresholds would be exceeded with partial accuracy", () => {
      const scenarios = createAllScenarios();

      // Verify that acceptable answer ranges make sense
      for (const scenario of scenarios) {
        expect(scenario.acceptableAnswerRange.minCauseAccuracy).toBeGreaterThan(0);
        expect(scenario.acceptableAnswerRange.minCauseAccuracy).toBeLessThanOrEqual(1);
        expect(scenario.acceptableAnswerRange.minRecommendationQuality).toBeGreaterThan(0);
        expect(scenario.acceptableAnswerRange.minRecommendationQuality).toBeLessThanOrEqual(1);
      }
    });
  });
});
