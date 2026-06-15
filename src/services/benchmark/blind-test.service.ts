/**
 * B19-S1: Blind Outcome Testing — Service
 *
 * Provides:
 * - Blind test case generation
 * - Hidden outcome management
 * - Expert action comparison
 * - Result scoring and leakage detection
 */

import type {
  BlindTestContext,
  HiddenOutcome,
  ExpertAction,
  SystemRecommendation,
  BlindTestResult,
} from "@/domain/benchmark/blind-test";
import {
  validateBlindTestContext,
  validateHiddenOutcome,
  hasHiddenFieldLeakage,
  compareRecommendationToExpert,
  scoreBlindTestResult,
} from "@/domain/benchmark/blind-test";

/**
 * Create 5 predefined blind test cases
 * Each includes visible context and hidden outcomes
 */

function createBlindTest1(): {
  context: BlindTestContext;
  hiddenOutcome: HiddenOutcome;
  expertAction: ExpertAction;
} {
  return {
    context: {
      contextId: "blind_cashflow_crisis_v1",
      title: "Cash Flow Crisis (Blind Test)",
      description:
        "Business is profitable on paper. Revenue is strong, costs are controlled. " +
        "However, cash is running low. This test is BLIND: the system does not see the outcome.",
      businessMetrics: {
        monthlyRevenue: 500000,
        operatingExpenses: 250000,
        costOfGoodsSold: 150000,
        cashOnHand: 45000,
        accountsReceivable: 200000, // Extended payment terms
        inventory: 80000,
        staffCount: 25,
        monthlyGrossProfit: 350000, // Revenue - COGS
      },
      evidence: [
        "Revenue is $500K this month",
        "Operational costs are $250K",
        "Profitability margin appears strong",
        "Cash balance is $45K",
        "Accounts receivable are $200K",
      ],
      constraints: ["Cannot lay off staff", "Have committed supplier contracts"],
    },
    hiddenOutcome: {
      outcomeId: "outcome_1_success",
      timeframe: "90 days after diagnosis",
      metricsChanged: [
        {
          metric: "cashOnHand",
          beforeValue: "$45K",
          afterValue: "$250K",
          direction: "up",
        },
        {
          metric: "accountsReceivable",
          beforeValue: "$200K",
          afterValue: "$80K",
          direction: "down",
        },
        {
          metric: "operatingExpenses",
          beforeValue: "$250K",
          afterValue: "$200K",
          direction: "down",
        },
      ],
      success: true,
      successMetrics: ["cash position improved", "AR aging reduced", "cost discipline"],
      failureMetrics: [],
      rootCauseProbability: 0.85,
    },
    expertAction: {
      actionId: "expert_1_action",
      description:
        "Negotiated extended payment terms with customers to 45 days. " +
        "Implemented daily cash forecasting. Reduced discretionary spending by 20%.",
      rationale:
        "The root cause is working capital management, not profitability. " +
        "Extending payment terms improves cash timing. Cost discipline is secondary.",
      expectedOutcome: "Cash position should improve within 90 days",
      confidenceLevel: 0.9,
    },
  };
}

function createBlindTest2(): {
  context: BlindTestContext;
  hiddenOutcome: HiddenOutcome;
  expertAction: ExpertAction;
} {
  return {
    context: {
      contextId: "blind_margin_collapse_v1",
      title: "Margin Collapse (Blind Test)",
      description:
        "Gross margin has declined from 70% to 50% over 6 months. " +
        "Revenue is growing but profitability is declining. System must diagnose.",
      businessMetrics: {
        monthlyRevenue: 800000,
        currentGrossMargin: 0.5,
        priorGrossMargin: 0.7,
        costOfGoodsSold: 400000,
        operatingExpenses: 300000,
        staffCount: 40,
        newHires6Mo: 15,
        customerCount: 180,
        averageProductionCost: 333, // 400K / 1200 units
      },
      evidence: [
        "Revenue grew 40% year-over-year",
        "Gross margin declined from 70% to 50%",
        "Production headcount increased",
        "Customer acquisition accelerated",
        "Average order size is smaller",
      ],
      constraints: [
        "Cannot raise prices (market competitive)",
        "Need to maintain production quality",
      ],
    },
    hiddenOutcome: {
      outcomeId: "outcome_2_partial_success",
      timeframe: "6 months after diagnosis",
      metricsChanged: [
        {
          metric: "grossMargin",
          beforeValue: "50%",
          afterValue: "62%",
          direction: "up",
        },
        {
          metric: "operatingExpenses",
          beforeValue: "$300K",
          afterValue: "$250K",
          direction: "down",
        },
        {
          metric: "monthlyRevenue",
          beforeValue: "$800K",
          afterValue: "$900K",
          direction: "up",
        },
      ],
      success: true,
      successMetrics: ["margin recovered partially", "cost discipline", "revenue maintained"],
      failureMetrics: ["margin did not fully recover to 70%"],
      rootCauseProbability: 0.7,
    },
    expertAction: {
      actionId: "expert_2_action",
      description:
        "Identified product mix shift toward lower-margin items. " +
        "Implemented production efficiency improvements. Reduced overhead by 17%.",
      rationale:
        "Root cause is operational: product mix and production inefficiency. " +
        "Not a pricing or demand problem.",
      expectedOutcome: "Margin should recover to 60%+ within 6 months",
      confidenceLevel: 0.75,
    },
  };
}

function createBlindTest3(): {
  context: BlindTestContext;
  hiddenOutcome: HiddenOutcome;
  expertAction: ExpertAction;
} {
  return {
    context: {
      contextId: "blind_churn_crisis_v1",
      title: "Churn Crisis (Blind Test)",
      description:
        "Customer churn rate has increased to 8% monthly. " +
        "New customer acquisition is strong but retention is failing.",
      businessMetrics: {
        monthlyRevenue: 300000,
        customerCount: 950,
        monthlyChurn: 0.08,
        newCustomersMonth: 150,
        averageCustomerLifetime: 12.5, // months
        grossMargin: 0.75,
        npsScore: 35, // moderate dissatisfaction
        customerRetentionCost: 5000,
      },
      evidence: [
        "Churn rate is 8% monthly",
        "NPS score is 35 (should be >50)",
        "New customer cohorts have 50% 3-month survival",
        "Customer support is understaffed",
        "Product has not changed, but satisfaction declined",
      ],
      constraints: ["Cannot reduce customer acquisition (board mandate for growth)"],
    },
    hiddenOutcome: {
      outcomeId: "outcome_3_partial_success",
      timeframe: "4 months after diagnosis",
      metricsChanged: [
        {
          metric: "monthlyChurn",
          beforeValue: "8%",
          afterValue: "5.5%",
          direction: "down",
        },
        {
          metric: "npsScore",
          beforeValue: "35",
          afterValue: "52",
          direction: "up",
        },
        {
          metric: "monthlyRevenue",
          beforeValue: "$300K",
          afterValue: "$420K",
          direction: "up",
        },
      ],
      success: true,
      successMetrics: ["churn reduced", "NPS improved", "revenue grew"],
      failureMetrics: ["churn did not reach 3% target"],
      rootCauseProbability: 0.8,
    },
    expertAction: {
      actionId: "expert_3_action",
      description:
        "Expanded customer success team. Implemented proactive onboarding. " +
        "Added product features based on churn analysis.",
      rationale:
        "Root cause is customer success and onboarding quality. " +
        "Customers are not achieving value in first 30 days.",
      expectedOutcome: "Churn should decline to 5% within 4 months",
      confidenceLevel: 0.82,
    },
  };
}

function createBlindTest4(): {
  context: BlindTestContext;
  hiddenOutcome: HiddenOutcome;
  expertAction: ExpertAction;
} {
  return {
    context: {
      contextId: "blind_false_alarm_v1",
      title: "False Alarm (Blind Test)",
      description:
        "Revenue declined 15% last month. " +
        "Owner is panicked. System must determine if this is a crisis or normal variation.",
      businessMetrics: {
        currentMonthRevenue: 425000,
        priorMonthRevenue: 500000,
        revenueDecline: -0.15,
        monthNumber: 8, // August
        priorYearAugustRevenue: 400000, // YoY is actually up
        averageMonthlyRevenue: 480000,
        customerCount: 200,
        operatingExpenses: 250000,
        cashOnHand: 300000,
      },
      evidence: [
        "Revenue declined 15% month-over-month",
        "Prior month was exceptionally high (May is peak season)",
        "Year-over-year revenue is up 6%",
        "Customer count is stable",
        "Operating expenses are controlled",
      ],
      constraints: ["Board is anxious about performance"],
    },
    hiddenOutcome: {
      outcomeId: "outcome_4_no_action_needed",
      timeframe: "30 days after diagnosis",
      metricsChanged: [
        {
          metric: "monthlyRevenue",
          beforeValue: "$425K",
          afterValue: "$520K",
          direction: "up",
        },
      ],
      success: true,
      successMetrics: ["revenue recovered to normal levels"],
      failureMetrics: [],
      rootCauseProbability: 1.0, // This WAS a false alarm
    },
    expertAction: {
      actionId: "expert_4_action",
      description:
        "No significant action. Confirmed seasonal pattern. " +
        "Communicated to board that August is historically slower.",
      rationale:
        "This is normal seasonality, not a crisis. " +
        "Month-over-month comparisons are misleading; year-over-year shows growth.",
      expectedOutcome: "Revenue will return to normal next month without intervention",
      confidenceLevel: 0.95,
    },
  };
}

function createBlindTest5(): {
  context: BlindTestContext;
  hiddenOutcome: HiddenOutcome;
  expertAction: ExpertAction;
} {
  return {
    context: {
      contextId: "blind_wrong_diagnosis_v1",
      title: "System Misdiagnosis (Blind Test)",
      description:
        "Sales are declining. " +
        "Owner initially blamed sales team. " +
        "System must identify actual root cause.",
      businessMetrics: {
        monthlyRevenue: 350000,
        priorMonthRevenue: 500000,
        revenueDecline: -0.3,
        salesTeamSize: 12,
        newSalesRep: 4, // 50% new
        customerAcquisitionCost: 8000,
        marketingSpend: 120000,
        productVersion: 2.1, // recent update
        bugReportsMonth: 45, // unusual increase
      },
      evidence: [
        "Revenue declined 30% month-over-month",
        "Sales team has 4 new reps (hired this month)",
        "Marketing spend increased 25%",
        "New product version released this month",
        "Customer complaints increased about stability",
      ],
      constraints: ["Sales team is demoralized"],
    },
    hiddenOutcome: {
      outcomeId: "outcome_5_product_issue",
      timeframe: "45 days after diagnosis",
      metricsChanged: [
        {
          metric: "monthlyRevenue",
          beforeValue: "$350K",
          afterValue: "$520K",
          direction: "up",
        },
        {
          metric: "bugReportsMonth",
          beforeValue: "45",
          afterValue: "3",
          direction: "down",
        },
      ],
      success: true,
      successMetrics: ["revenue recovered", "product stability restored"],
      failureMetrics: [],
      rootCauseProbability: 0.9,
    },
    expertAction: {
      actionId: "expert_5_action",
      description:
        "Identified product regression in v2.1. Rolled back to v2.0. " +
        "Implemented regression testing before future releases.",
      rationale:
        "Root cause is NOT sales team or marketing. " +
        "Product update introduced bugs that drove customers away.",
      expectedOutcome: "Revenue should recover within 2-3 weeks of rollback",
      confidenceLevel: 0.92,
    },
  };
}

/**
 * Create all 5 blind test cases
 */
export function createAllBlindTests(): Array<{
  context: BlindTestContext;
  hiddenOutcome: HiddenOutcome;
  expertAction: ExpertAction;
}> {
  const tests = [
    createBlindTest1(),
    createBlindTest2(),
    createBlindTest3(),
    createBlindTest4(),
    createBlindTest5(),
  ];

  // Validate all
  for (const test of tests) {
    const contextVal = validateBlindTestContext(test.context);
    if (!contextVal.valid) {
      throw new Error(`Test ${test.context.contextId} context invalid: ${contextVal.errors.join("; ")}`);
    }

    const outcomeVal = validateHiddenOutcome(test.hiddenOutcome);
    if (!outcomeVal.valid) {
      throw new Error(`Test ${test.context.contextId} outcome invalid: ${outcomeVal.errors.join("; ")}`);
    }
  }

  return tests;
}

/**
 * Get test by context ID
 */
export function getBlindTestByContextId(contextId: string): {
  context: BlindTestContext;
  hiddenOutcome: HiddenOutcome;
  expertAction: ExpertAction;
} | null {
  const tests = createAllBlindTests();
  return tests.find((t) => t.context.contextId === contextId) || null;
}

/**
 * Run a blind test: system makes recommendation, then compare to expert/outcome
 */
export function runBlindTest(
  context: BlindTestContext,
  hiddenOutcome: HiddenOutcome,
  expertAction: ExpertAction,
  systemRecommendation: SystemRecommendation
): BlindTestResult {
  const testId = `blindtest_${context.contextId}_${Date.now()}`;

  // Check for hidden field leakage
  const leakage = hasHiddenFieldLeakage(
    {
      testId,
      contextId: context.contextId,
      systemRecommendation,
      expertAction,
      actualOutcome: hiddenOutcome,
      causesCorrect: 0,
      actionsAligned: 0,
      outcomeAlignment: 0,
      score: 0,
      passed: false,
      failureReasons: [],
      evidence: [],
      testedAt: new Date(),
      executionTimeMs: 0,
    },
    context
  );

  if (leakage) {
    return {
      testId,
      contextId: context.contextId,
      systemRecommendation,
      expertAction,
      actualOutcome: hiddenOutcome,
      causesCorrect: 0,
      actionsAligned: 0,
      outcomeAlignment: 0,
      score: 0,
      passed: false,
      failureReasons: ["Hidden field leakage detected"],
      evidence: ["System recommendation contains information not in visible context"],
      testedAt: new Date(),
      executionTimeMs: 0,
    };
  }

  // Compare recommendation to expert/outcome
  const comparison = compareRecommendationToExpert(systemRecommendation, expertAction, hiddenOutcome);

  // Score the result
  const score = scoreBlindTestResult(
    {
      testId,
      contextId: context.contextId,
      systemRecommendation,
      expertAction,
      actualOutcome: hiddenOutcome,
      causesCorrect: comparison.causesCorrect,
      actionsAligned: comparison.actionsAligned,
      outcomeAlignment: comparison.outcomeAlignment,
      score: 0,
      passed: false,
      failureReasons: [],
      evidence: [],
      testedAt: new Date(),
      executionTimeMs: 0,
    },
    false // no leakage
  );

  const passed = score >= 65; // 65+ is passing

  return {
    testId,
    contextId: context.contextId,
    systemRecommendation,
    expertAction,
    actualOutcome: hiddenOutcome,
    causesCorrect: comparison.causesCorrect,
    actionsAligned: comparison.actionsAligned,
    outcomeAlignment: comparison.outcomeAlignment,
    score,
    passed,
    failureReasons: score < 65 ? [`Score ${score.toFixed(1)}/100 below passing threshold`] : [],
    evidence: [
      `Causes identified: ${comparison.causesCorrect}/${systemRecommendation.causes.length}`,
      `Actions aligned: ${comparison.actionsAligned}/${systemRecommendation.actions.length}`,
      `Outcome alignment: ${(comparison.outcomeAlignment * 100).toFixed(1)}%`,
      `Overall score: ${score.toFixed(1)}/100`,
    ],
    testedAt: new Date(),
    executionTimeMs: 0,
  };
}
