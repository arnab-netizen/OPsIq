/**
 * B19-S1: Blind Outcome Testing — Unit Tests
 *
 * Tests blind test case creation, validation, leakage detection, and scoring.
 */

import {
  validateBlindTestContext,
  validateHiddenOutcome,
  hasHiddenFieldLeakage,
  compareRecommendationToExpert,
  scoreBlindTestResult,
  type BlindTestContext,
  type HiddenOutcome,
  type ExpertAction,
  type SystemRecommendation,
  type BlindTestResult,
} from "@/domain/benchmark/blind-test";
import {
  createAllBlindTests,
  getBlindTestByContextId,
  runBlindTest,
} from "@/services/benchmark/blind-test.service";

describe("B19-S1 — Blind Outcome Testing", () => {
  describe("createAllBlindTests", () => {
    it("should create exactly 5 blind test cases", () => {
      const tests = createAllBlindTests();
      expect(tests).toHaveLength(5);
    });

    it("should assign unique context IDs to each test", () => {
      const tests = createAllBlindTests();
      const contextIds = tests.map((t) => t.context.contextId);
      expect(new Set(contextIds).size).toBe(5); // all unique
    });

    it("should validate all test contexts", () => {
      const tests = createAllBlindTests();
      for (const test of tests) {
        const validation = validateBlindTestContext(test.context);
        expect(validation.valid).toBe(true);
      }
    });

    it("should validate all hidden outcomes", () => {
      const tests = createAllBlindTests();
      for (const test of tests) {
        const validation = validateHiddenOutcome(test.hiddenOutcome);
        expect(validation.valid).toBe(true);
      }
    });

    it("should have business metrics in each context", () => {
      const tests = createAllBlindTests();
      for (const test of tests) {
        expect(Object.keys(test.context.businessMetrics).length).toBeGreaterThan(0);
      }
    });

    it("should have evidence in each context", () => {
      const tests = createAllBlindTests();
      for (const test of tests) {
        expect(test.context.evidence.length).toBeGreaterThan(0);
      }
    });

    it("should have metric changes in each outcome", () => {
      const tests = createAllBlindTests();
      for (const test of tests) {
        expect(test.hiddenOutcome.metricsChanged.length).toBeGreaterThan(0);
      }
    });
  });

  describe("Blind Test 1: Cash Flow Crisis", () => {
    it("should have correct context structure", () => {
      const tests = createAllBlindTests();
      const test = tests[0];
      expect(test.context.contextId).toBe("blind_cashflow_crisis_v1");
      expect(test.context.businessMetrics.cashOnHand).toBe(45000);
      expect(test.context.businessMetrics.accountsReceivable).toBe(200000);
    });

    it("should show success outcome in hidden result", () => {
      const tests = createAllBlindTests();
      const test = tests[0];
      expect(test.hiddenOutcome.success).toBe(true);
      expect(test.hiddenOutcome.successMetrics).toContain("cash position improved");
    });

    it("should have expert action with high confidence", () => {
      const tests = createAllBlindTests();
      const test = tests[0];
      expect(test.expertAction.confidenceLevel).toBeGreaterThan(0.8);
    });
  });

  describe("Blind Test 2: Margin Collapse", () => {
    it("should have margin metrics", () => {
      const tests = createAllBlindTests();
      const test = tests[1];
      expect(test.context.businessMetrics.currentGrossMargin).toBe(0.5);
      expect(test.context.businessMetrics.priorGrossMargin).toBe(0.7);
    });

    it("should show partial success with recovery", () => {
      const tests = createAllBlindTests();
      const test = tests[1];
      expect(test.hiddenOutcome.success).toBe(true);
      expect(test.hiddenOutcome.failureMetrics.length).toBeGreaterThan(0);
    });
  });

  describe("Blind Test 3: Churn Crisis", () => {
    it("should have customer retention metrics", () => {
      const tests = createAllBlindTests();
      const test = tests[2];
      expect(test.context.businessMetrics.monthlyChurn).toBe(0.08);
      expect(test.context.businessMetrics.npsScore).toBe(35);
    });

    it("should show NPS improvement in outcome", () => {
      const tests = createAllBlindTests();
      const test = tests[2];
      const npsChange = test.hiddenOutcome.metricsChanged.find(
        (m) => m.metric === "npsScore"
      );
      expect(npsChange).toBeDefined();
      expect(npsChange?.direction).toBe("up");
    });
  });

  describe("Blind Test 4: False Alarm", () => {
    it("should show normal seasonality context", () => {
      const tests = createAllBlindTests();
      const test = tests[3];
      expect(test.context.businessMetrics.monthNumber).toBe(8);
      expect(test.context.businessMetrics.revenueDecline).toBe(-0.15);
    });

    it("should have success outcome with root cause probability 1.0", () => {
      const tests = createAllBlindTests();
      const test = tests[3];
      expect(test.hiddenOutcome.rootCauseProbability).toBe(1.0);
      expect(test.hiddenOutcome.success).toBe(true);
    });

    it("expert should recommend no significant action", () => {
      const tests = createAllBlindTests();
      const test = tests[3];
      expect(test.expertAction.description).toContain("No significant action");
    });
  });

  describe("Blind Test 5: System Misdiagnosis", () => {
    it("should show product issue context", () => {
      const tests = createAllBlindTests();
      const test = tests[4];
      expect(test.context.businessMetrics.bugReportsMonth).toBe(45);
      expect(test.context.businessMetrics.productVersion).toBe(2.1);
    });

    it("should show product-related recovery", () => {
      const tests = createAllBlindTests();
      const test = tests[4];
      expect(test.hiddenOutcome.successMetrics).toContain("product stability restored");
    });
  });

  describe("getBlindTestByContextId", () => {
    it("should retrieve test by context ID", () => {
      const test = getBlindTestByContextId("blind_cashflow_crisis_v1");
      expect(test).not.toBeNull();
      expect(test?.context.contextId).toBe("blind_cashflow_crisis_v1");
    });

    it("should return null for unknown context ID", () => {
      const test = getBlindTestByContextId("unknown_test");
      expect(test).toBeNull();
    });

    it("should retrieve all 5 tests by their IDs", () => {
      const tests = createAllBlindTests();
      for (const originalTest of tests) {
        const retrieved = getBlindTestByContextId(originalTest.context.contextId);
        expect(retrieved).not.toBeNull();
        expect(retrieved?.context.contextId).toBe(originalTest.context.contextId);
      }
    });
  });

  describe("validateBlindTestContext", () => {
    it("should validate proper context", () => {
      const context: BlindTestContext = {
        contextId: "blind_test_001",
        title: "Test Case",
        description: "Test description",
        businessMetrics: { metric1: 100 },
        evidence: ["evidence1"],
        constraints: [],
      };
      const result = validateBlindTestContext(context);
      expect(result.valid).toBe(true);
    });

    it("should reject context without blind_ prefix", () => {
      const context: BlindTestContext = {
        contextId: "test_001",
        title: "Test Case",
        description: "Test description",
        businessMetrics: { metric1: 100 },
        evidence: ["evidence1"],
        constraints: [],
      };
      const result = validateBlindTestContext(context);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("should reject context without business metrics", () => {
      const context: BlindTestContext = {
        contextId: "blind_test_001",
        title: "Test Case",
        description: "Test description",
        businessMetrics: {},
        evidence: ["evidence1"],
        constraints: [],
      };
      const result = validateBlindTestContext(context);
      expect(result.valid).toBe(false);
    });

    it("should reject context without evidence", () => {
      const context: BlindTestContext = {
        contextId: "blind_test_001",
        title: "Test Case",
        description: "Test description",
        businessMetrics: { metric1: 100 },
        evidence: [],
        constraints: [],
      };
      const result = validateBlindTestContext(context);
      expect(result.valid).toBe(false);
    });
  });

  describe("validateHiddenOutcome", () => {
    it("should validate proper outcome", () => {
      const outcome: HiddenOutcome = {
        outcomeId: "outcome_001",
        timeframe: "90 days",
        metricsChanged: [
          {
            metric: "revenue",
            beforeValue: "100",
            afterValue: "150",
            direction: "up",
          },
        ],
        success: true,
        successMetrics: ["revenue improved"],
        failureMetrics: [],
        rootCauseProbability: 0.85,
      };
      const result = validateHiddenOutcome(outcome);
      expect(result.valid).toBe(true);
    });

    it("should reject outcome without ID", () => {
      const outcome: Partial<HiddenOutcome> = {
        timeframe: "90 days",
        metricsChanged: [
          {
            metric: "revenue",
            beforeValue: "100",
            afterValue: "150",
            direction: "up",
          },
        ],
        success: true,
        successMetrics: [],
        failureMetrics: [],
        rootCauseProbability: 0.85,
      };
      const result = validateHiddenOutcome(outcome as HiddenOutcome);
      expect(result.valid).toBe(false);
    });

    it("should reject outcome without metric changes", () => {
      const outcome: HiddenOutcome = {
        outcomeId: "outcome_001",
        timeframe: "90 days",
        metricsChanged: [],
        success: true,
        successMetrics: [],
        failureMetrics: [],
        rootCauseProbability: 0.85,
      };
      const result = validateHiddenOutcome(outcome);
      expect(result.valid).toBe(false);
    });

    it("should reject outcome with invalid probability", () => {
      const outcome: HiddenOutcome = {
        outcomeId: "outcome_001",
        timeframe: "90 days",
        metricsChanged: [
          {
            metric: "revenue",
            beforeValue: "100",
            afterValue: "150",
            direction: "up",
          },
        ],
        success: true,
        successMetrics: [],
        failureMetrics: [],
        rootCauseProbability: 1.5, // invalid
      };
      const result = validateHiddenOutcome(outcome);
      expect(result.valid).toBe(false);
    });
  });

  describe("hasHiddenFieldLeakage", () => {
    it("should detect no leakage when outcome indicators absent from context", () => {
      const context: BlindTestContext = {
        contextId: "blind_test_001",
        title: "Test",
        description: "Test context",
        businessMetrics: { metric1: 100 },
        evidence: ["Evidence 1"],
        constraints: [],
      };

      const result: BlindTestResult = {
        testId: "test1",
        contextId: context.contextId,
        systemRecommendation: {
          recommendationId: "rec1",
          causes: ["cause1"],
          actions: ["action1"],
          confidenceScore: 0.8,
          reasoning: "Test reasoning",
        },
        expertAction: {
          actionId: "exp1",
          description: "Expert action",
          rationale: "Expert rationale",
          expectedOutcome: "Expected outcome",
          confidenceLevel: 0.9,
        },
        actualOutcome: {
          outcomeId: "out1",
          timeframe: "90 days",
          metricsChanged: [],
          success: true,
          successMetrics: [],
          failureMetrics: [],
          rootCauseProbability: 0.85,
        },
        causesCorrect: 0,
        actionsAligned: 0,
        outcomeAlignment: 0,
        score: 0,
        passed: false,
        failureReasons: [],
        evidence: [],
        testedAt: new Date(),
        executionTimeMs: 0,
      };

      const leakage = hasHiddenFieldLeakage(result, context);
      expect(leakage).toBe(false);
    });

    it("should detect leakage when outcome indicators in recommendation but not context", () => {
      const context: BlindTestContext = {
        contextId: "blind_test_001",
        title: "Test",
        description: "Test context without outcome info",
        businessMetrics: { metric1: 100 },
        evidence: ["Evidence 1"],
        constraints: [],
      };

      const result: BlindTestResult = {
        testId: "test1",
        contextId: context.contextId,
        systemRecommendation: {
          recommendationId: "rec1",
          causes: ["cause of failure"],
          actions: ["action for improved success"],
          confidenceScore: 0.8,
          reasoning: "Based on 3 months of data showing improvement outcome",
        },
        expertAction: {
          actionId: "exp1",
          description: "Expert action",
          rationale: "Expert rationale",
          expectedOutcome: "Expected outcome",
          confidenceLevel: 0.9,
        },
        actualOutcome: {
          outcomeId: "out1",
          timeframe: "3 months after diagnosis",
          metricsChanged: [],
          success: true,
          successMetrics: [],
          failureMetrics: [],
          rootCauseProbability: 0.85,
        },
        causesCorrect: 0,
        actionsAligned: 0,
        outcomeAlignment: 0,
        score: 0,
        passed: false,
        failureReasons: [],
        evidence: [],
        testedAt: new Date(),
        executionTimeMs: 0,
      };

      const leakage = hasHiddenFieldLeakage(result, context);
      expect(leakage).toBe(true);
    });
  });

  describe("compareRecommendationToExpert", () => {
    it("should calculate causes correctly", () => {
      const systemRec: SystemRecommendation = {
        recommendationId: "rec1",
        causes: ["working capital", "cash flow"],
        actions: ["action1"],
        confidenceScore: 0.8,
        reasoning: "Test reasoning",
      };

      const expertAction: ExpertAction = {
        actionId: "exp1",
        description: "Address working capital issues",
        rationale: "Focus on cash flow management",
        expectedOutcome: "Improved liquidity",
        confidenceLevel: 0.9,
      };

      const outcome: HiddenOutcome = {
        outcomeId: "out1",
        timeframe: "90 days",
        metricsChanged: [],
        success: true,
        successMetrics: ["cash improved"],
        failureMetrics: [],
        rootCauseProbability: 0.85,
      };

      const comparison = compareRecommendationToExpert(systemRec, expertAction, outcome);
      expect(comparison.causesCorrect).toBeGreaterThan(0);
    });

    it("should calculate actions aligned", () => {
      const systemRec: SystemRecommendation = {
        recommendationId: "rec1",
        causes: ["cause1"],
        actions: ["reduce costs", "improve efficiency"],
        confidenceScore: 0.8,
        reasoning: "Test reasoning",
      };

      const expertAction: ExpertAction = {
        actionId: "exp1",
        description: "Reduce costs through process efficiency improvements",
        rationale: "Cost structure needs adjustment",
        expectedOutcome: "Lower operating expenses",
        confidenceLevel: 0.9,
      };

      const outcome: HiddenOutcome = {
        outcomeId: "out1",
        timeframe: "90 days",
        metricsChanged: [],
        success: true,
        successMetrics: ["costs reduced"],
        failureMetrics: [],
        rootCauseProbability: 0.85,
      };

      const comparison = compareRecommendationToExpert(systemRec, expertAction, outcome);
      expect(comparison.actionsAligned).toBeGreaterThan(0);
    });

    it("should calculate outcome alignment for successful outcomes", () => {
      const systemRec: SystemRecommendation = {
        recommendationId: "rec1",
        causes: ["cause1"],
        actions: ["action1"],
        confidenceScore: 0.8,
        reasoning: "Test reasoning",
      };

      const expertAction: ExpertAction = {
        actionId: "exp1",
        description: "Expert action",
        rationale: "Expert rationale",
        expectedOutcome: "Expected outcome",
        confidenceLevel: 0.9,
      };

      const outcome: HiddenOutcome = {
        outcomeId: "out1",
        timeframe: "90 days",
        metricsChanged: [
          {
            metric: "metric1",
            beforeValue: "100",
            afterValue: "150",
            direction: "up",
          },
        ],
        success: true,
        successMetrics: ["metric1"],
        failureMetrics: [],
        rootCauseProbability: 0.85,
      };

      const comparison = compareRecommendationToExpert(systemRec, expertAction, outcome);
      expect(comparison.outcomeAlignment).toBeGreaterThan(0);
    });

    it("should handle failed outcomes gracefully", () => {
      const systemRec: SystemRecommendation = {
        recommendationId: "rec1",
        causes: ["cause1"],
        actions: ["action1"],
        confidenceScore: 0.8,
        reasoning: "Test reasoning",
      };

      const expertAction: ExpertAction = {
        actionId: "exp1",
        description: "Expert action",
        rationale: "Expert rationale",
        expectedOutcome: "Expected outcome",
        confidenceLevel: 0.9,
      };

      const outcome: HiddenOutcome = {
        outcomeId: "out1",
        timeframe: "90 days",
        metricsChanged: [],
        success: false,
        successMetrics: [],
        failureMetrics: ["metric1"],
        rootCauseProbability: 0.5,
      };

      const comparison = compareRecommendationToExpert(systemRec, expertAction, outcome);
      expect(comparison.outcomeAlignment).toBe(0.3); // partial credit
    });
  });

  describe("scoreBlindTestResult", () => {
    it("should return 0 for results with hidden field leakage", () => {
      const result: BlindTestResult = {
        testId: "test1",
        contextId: "blind_test_001",
        systemRecommendation: {
          recommendationId: "rec1",
          causes: ["cause1"],
          actions: ["action1"],
          confidenceScore: 0.8,
          reasoning: "Test reasoning",
        },
        expertAction: {
          actionId: "exp1",
          description: "Expert action",
          rationale: "Expert rationale",
          expectedOutcome: "Expected outcome",
          confidenceLevel: 0.9,
        },
        actualOutcome: {
          outcomeId: "out1",
          timeframe: "90 days",
          metricsChanged: [],
          success: true,
          successMetrics: [],
          failureMetrics: [],
          rootCauseProbability: 0.85,
        },
        causesCorrect: 1,
        actionsAligned: 1,
        outcomeAlignment: 0.9,
        score: 0,
        passed: false,
        failureReasons: [],
        evidence: [],
        testedAt: new Date(),
        executionTimeMs: 0,
      };

      const score = scoreBlindTestResult(result, true); // leakage detected
      expect(score).toBe(0);
    });

    it("should calculate score based on causes, actions, and outcome", () => {
      const result: BlindTestResult = {
        testId: "test1",
        contextId: "blind_test_001",
        systemRecommendation: {
          recommendationId: "rec1",
          causes: ["cause1"],
          actions: ["action1"],
          confidenceScore: 0.8,
          reasoning: "Test reasoning",
        },
        expertAction: {
          actionId: "exp1",
          description: "Expert action",
          rationale: "Expert rationale",
          expectedOutcome: "Expected outcome",
          confidenceLevel: 0.9,
        },
        actualOutcome: {
          outcomeId: "out1",
          timeframe: "90 days",
          metricsChanged: [],
          success: true,
          successMetrics: [],
          failureMetrics: [],
          rootCauseProbability: 0.85,
        },
        causesCorrect: 1,
        actionsAligned: 1,
        outcomeAlignment: 0.9,
        score: 0,
        passed: false,
        failureReasons: [],
        evidence: [],
        testedAt: new Date(),
        executionTimeMs: 0,
      };

      const score = scoreBlindTestResult(result, false);
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it("should weight outcome alignment heavily (40%)", () => {
      const resultWithGoodOutcome: BlindTestResult = {
        testId: "test1",
        contextId: "blind_test_001",
        systemRecommendation: {
          recommendationId: "rec1",
          causes: ["cause1"],
          actions: ["action1"],
          confidenceScore: 0.8,
          reasoning: "Test reasoning",
        },
        expertAction: {
          actionId: "exp1",
          description: "Expert action",
          rationale: "Expert rationale",
          expectedOutcome: "Expected outcome",
          confidenceLevel: 0.9,
        },
        actualOutcome: {
          outcomeId: "out1",
          timeframe: "90 days",
          metricsChanged: [],
          success: true,
          successMetrics: [],
          failureMetrics: [],
          rootCauseProbability: 0.85,
        },
        causesCorrect: 0,
        actionsAligned: 0,
        outcomeAlignment: 1.0,
        score: 0,
        passed: false,
        failureReasons: [],
        evidence: [],
        testedAt: new Date(),
        executionTimeMs: 0,
      };

      const resultWithPoorOutcome: BlindTestResult = {
        ...resultWithGoodOutcome,
        outcomeAlignment: 0,
      };

      const scoreGood = scoreBlindTestResult(resultWithGoodOutcome, false);
      const scorePoor = scoreBlindTestResult(resultWithPoorOutcome, false);

      expect(scoreGood).toBeGreaterThan(scorePoor);
      expect(scoreGood - scorePoor).toBeCloseTo(40, 0); // 40% weight
    });
  });

  describe("runBlindTest", () => {
    it("should run a blind test and return result", () => {
      const context: BlindTestContext = {
        contextId: "blind_test_001",
        title: "Test",
        description: "Test context",
        businessMetrics: { metric1: 100 },
        evidence: ["Evidence 1"],
        constraints: [],
      };

      const hiddenOutcome: HiddenOutcome = {
        outcomeId: "out1",
        timeframe: "90 days",
        metricsChanged: [
          {
            metric: "metric1",
            beforeValue: "100",
            afterValue: "150",
            direction: "up",
          },
        ],
        success: true,
        successMetrics: ["metric1"],
        failureMetrics: [],
        rootCauseProbability: 0.85,
      };

      const expertAction: ExpertAction = {
        actionId: "exp1",
        description: "Action to improve metric1",
        rationale: "Based on business analysis",
        expectedOutcome: "metric1 should increase",
        confidenceLevel: 0.9,
      };

      const systemRec: SystemRecommendation = {
        recommendationId: "rec1",
        causes: ["metric1 too low"],
        actions: ["improve metric1"],
        confidenceScore: 0.8,
        reasoning: "Test analysis",
      };

      const result = runBlindTest(context, hiddenOutcome, expertAction, systemRec);

      expect(result.testId).toBeDefined();
      expect(result.contextId).toBe(context.contextId);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
      expect(typeof result.passed).toBe("boolean");
    });

    it("should detect leakage and fail test", () => {
      const context: BlindTestContext = {
        contextId: "blind_test_001",
        title: "Test",
        description: "Test context",
        businessMetrics: { metric1: 100 },
        evidence: ["Evidence 1"],
        constraints: [],
      };

      const hiddenOutcome: HiddenOutcome = {
        outcomeId: "out1",
        timeframe: "3 months after diagnosis",
        metricsChanged: [],
        success: true,
        successMetrics: [],
        failureMetrics: [],
        rootCauseProbability: 0.85,
      };

      const expertAction: ExpertAction = {
        actionId: "exp1",
        description: "Action",
        rationale: "Rationale",
        expectedOutcome: "Expected outcome",
        confidenceLevel: 0.9,
      };

      const systemRec: SystemRecommendation = {
        recommendationId: "rec1",
        causes: ["cause of the failure"],
        actions: ["action for success"],
        confidenceScore: 0.8,
        reasoning: "Analysis shows improved outcome will result",
      };

      const result = runBlindTest(context, hiddenOutcome, expertAction, systemRec);

      expect(result.score).toBe(0);
      expect(result.passed).toBe(false);
      expect(result.failureReasons[0]).toContain("leakage");
    });

    it("should set passed=true when score >= 65", () => {
      const context: BlindTestContext = {
        contextId: "blind_test_001",
        title: "Test",
        description: "Test context with detailed evidence",
        businessMetrics: {
          cashFlow: 100,
          workingCapital: 50,
          payment_terms: 30,
        },
        evidence: [
          "Cash flow analysis",
          "Payment terms data",
          "Working capital metrics",
        ],
        constraints: [],
      };

      const hiddenOutcome: HiddenOutcome = {
        outcomeId: "out1",
        timeframe: "90 days after diagnosis",
        metricsChanged: [
          {
            metric: "cashFlow",
            beforeValue: "100",
            afterValue: "200",
            direction: "up",
          },
        ],
        success: true,
        successMetrics: ["cash improved"],
        failureMetrics: [],
        rootCauseProbability: 0.85,
      };

      const expertAction: ExpertAction = {
        actionId: "exp1",
        description: "Improved payment terms and working capital management",
        rationale: "Cash flow optimization through term negotiation",
        expectedOutcome: "Cash flow improves",
        confidenceLevel: 0.9,
      };

      const systemRec: SystemRecommendation = {
        recommendationId: "rec1",
        causes: ["working capital issue"],
        actions: ["improve payment terms"],
        confidenceScore: 0.85,
        reasoning: "Working capital and cash flow analysis",
      };

      const result = runBlindTest(context, hiddenOutcome, expertAction, systemRec);

      if (result.score >= 65) {
        expect(result.passed).toBe(true);
      } else {
        expect(result.passed).toBe(false);
      }
    });
  });

  describe("Integration: Full blind test workflow", () => {
    it("should execute all 5 blind tests without errors", () => {
      const tests = createAllBlindTests();
      expect(tests.length).toBe(5);

      for (const test of tests) {
        // Verify test structure is complete
        expect(test.context).toBeDefined();
        expect(test.hiddenOutcome).toBeDefined();
        expect(test.expertAction).toBeDefined();

        // Verify context is valid
        const contextValidation = validateBlindTestContext(test.context);
        expect(contextValidation.valid).toBe(true);

        // Verify outcome is valid
        const outcomeValidation = validateHiddenOutcome(test.hiddenOutcome);
        expect(outcomeValidation.valid).toBe(true);
      }
    });

    it("should demonstrate blind test concept", () => {
      const test = getBlindTestByContextId("blind_cashflow_crisis_v1");
      expect(test).not.toBeNull();

      if (test) {
        // System makes a recommendation based only on visible context
        const systemRec: SystemRecommendation = {
          recommendationId: "sys_rec_1",
          causes: ["working capital bottleneck"],
          actions: [
            "accelerate cash collection",
            "reduce inventory",
            "negotiate supplier terms",
          ],
          confidenceScore: 0.75,
          reasoning: "Based on visible metrics: low cash, high AR",
        };

        // Run the test - this reveals expert action and outcome
        const result = runBlindTest(
          test.context,
          test.hiddenOutcome,
          test.expertAction,
          systemRec
        );

        // Result should have comparison metrics
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.evidence.length).toBeGreaterThan(0);
      }
    });
  });
});
