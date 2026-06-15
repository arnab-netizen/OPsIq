/**
 * B18-S1: Adversarial Test Suite — Evaluator Service
 *
 * Provides:
 * - 11 predefined adversarial case types
 * - Case loading and retrieval
 * - Result evaluation and pass/fail determination
 */

import type {
  AdversarialCase,
  AdversarialCaseRunResult,
  AdversarialCaseType,
} from "@/domain/benchmark/adversarial-case";
import {
  validateAdversarialCase,
  evaluateAdversarialResult,
} from "@/domain/benchmark/adversarial-case";

/**
 * CASE 1: Missing Data
 * Key metrics are null/zero/unavailable; system should flag low data quality
 */
function createMissingDataCase(): AdversarialCase {
  return {
    id: "adversarial_missing_data_v1",
    type: "missing_data",
    title: "Missing Data: Critical Metrics Unavailable",
    description:
      "Financial data is incomplete: cash flow forecast unavailable, " +
      "accounts receivable aging unknown, inventory velocity not tracked. " +
      "System should flag low confidence, not make high-confidence recommendations.",
    version: 1,
    badDataCharacteristics: [
      {
        characteristic: "missing_cash_flow_forecast",
        severity: "critical",
        description: "No 30-day cash flow forecast available",
        howToDetect: "Cash flow forecast field is null or zero",
      },
      {
        characteristic: "missing_ar_aging",
        severity: "high",
        description: "No breakdown of accounts receivable by age",
        howToDetect: "AR aging data not provided",
      },
      {
        characteristic: "missing_inventory_velocity",
        severity: "high",
        description: "Inventory turnover not tracked",
        howToDetect: "Inventory velocity field is zero or unavailable",
      },
    ],
    dataQualityScore: 0.3, // Very bad data
    inputMetrics: {
      monthlyRevenue: 500000,
      costOfGoodsSold: 250000,
      operatingExpenses: 300000,
      cashOnHand: 0, // MISSING: critical
      accountsReceivable: 0, // MISSING: should be ~1-2 months
      inventory: 0, // MISSING: should have value
      staffCount: 25,
      customerCount: 120,
    },
    inputEvidence: [
      "Revenue is $500K",
      "Profitability appears positive on paper",
      "No cash flow data available",
      "No visibility into working capital",
    ],
    acceptableBehavior: {
      mustLowerConfidence: true,
      minConfidenceAfter: 0.4, // System must be <40% confident
      mustNotRecommendAs: [
        "Proceed with growth initiative",
        "Invest in additional inventory",
        "Increase sales spending",
      ],
      mustNotIdentifyAs: [],
      mustFlagIfDetected: ["data quality low", "missing financial visibility"],
    },
    expectedDetection: {
      caseType: "missing_data",
      confidence: 0.85,
      evidence: [
        "Critical fields are missing or zero",
        "Cannot assess working capital health",
        "Cannot make reliable recommendations",
      ],
    },
    createdAt: new Date("2026-06-15"),
    updatedAt: new Date("2026-06-15"),
  };
}

/**
 * CASE 2: Misleading Data
 * Data is internally consistent but misleading (e.g., seasonal spike looks like trend)
 */
function createMisleadingDataCase(): AdversarialCase {
  return {
    id: "adversarial_misleading_data_v1",
    type: "misleading_data",
    title: "Misleading Data: Seasonal Spike vs. Trend",
    description:
      "One exceptional month makes trends look better than reality. " +
      "December revenue +60% due to seasonal sales, not underlying business improvement. " +
      "System should detect seasonality, not celebrate fake growth.",
    version: 1,
    badDataCharacteristics: [
      {
        characteristic: "seasonal_spike_misinterpreted",
        severity: "high",
        description: "One-time seasonal spike looks like sustainable growth",
        howToDetect: "Compare December to November (60% vs. baseline 0%)",
      },
      {
        characteristic: "lacks_historical_context",
        severity: "high",
        description: "No multi-year history to identify seasonal pattern",
        howToDetect: "Only current month data provided, no year-over-year",
      },
    ],
    dataQualityScore: 0.7, // Decent data, but misleading
    inputMetrics: {
      monthlyRevenue: 800000, // December spike
      previousMonthRevenue: 500000, // November normal
      costOfGoodsSold: 400000,
      operatingExpenses: 200000,
      cashOnHand: 250000,
      accountsReceivable: 100000,
      inventory: 150000,
      staffCount: 30,
      customerCount: 180,
      monthNumber: 12, // December
    },
    inputEvidence: [
      "Revenue grew 60% month-over-month",
      "December is the largest revenue month",
      "Profit margin improved to 60%",
      "No prior year data provided",
    ],
    acceptableBehavior: {
      mustLowerConfidence: true,
      minConfidenceAfter: 0.5, // Moderate confidence only
      mustNotRecommendAs: [
        "Celebrate growth achievement",
        "Increase expansion plans based on growth",
        "Add permanent headcount",
      ],
      mustNotIdentifyAs: ["sustainable growth", "market expansion success"],
      mustFlagIfDetected: [
        "seasonal bias",
        "needs historical context",
        "single-month comparison insufficient",
      ],
    },
    expectedDetection: {
      caseType: "misleading_data",
      confidence: 0.8,
      evidence: [
        "Single exceptional month without historical baseline",
        "Pattern consistent with seasonality",
        "Insufficient data for trend confirmation",
      ],
    },
    createdAt: new Date("2026-06-15"),
    updatedAt: new Date("2026-06-15"),
  };
}

/**
 * CASE 3: Conflicting Data
 * Different metrics tell contradictory stories
 */
function createConflictingDataCase(): AdversarialCase {
  return {
    id: "adversarial_conflicting_data_v1",
    type: "conflicting_data",
    title: "Conflicting Data: Revenue Up, Cash Down",
    description:
      "Revenue growing but cash declining; accounts receivable exploding. " +
      "Data is internally contradictory. System should flag conflict and lower confidence, " +
      "not make recommendations when signals are mixed.",
    version: 1,
    badDataCharacteristics: [
      {
        characteristic: "revenue_vs_cash_contradiction",
        severity: "critical",
        description: "Revenue +40% but cash declining despite profitability",
        howToDetect: "Revenue > prior month AND cash < prior month",
      },
      {
        characteristic: "receivables_explosion",
        severity: "high",
        description: "AR tripled while revenue only grew 40%",
        howToDetect: "AR growth rate > revenue growth rate",
      },
      {
        characteristic: "margins_vs_cash_contradiction",
        severity: "high",
        description: "High margins but cash declining",
        howToDetect: "Gross margin >50% but cash runway <2 months",
      },
    ],
    dataQualityScore: 0.5, // Conflicting data
    inputMetrics: {
      monthlyRevenue: 700000, // +40% vs. prior month
      previousMonthRevenue: 500000,
      costOfGoodsSold: 210000, // 30% COGS
      operatingExpenses: 200000,
      cashOnHand: 80000, // DOWN from prior month (e.g., was 200K)
      accountsReceivable: 1500000, // TRIPLED
      inventory: 300000,
      staffCount: 40,
      customerCount: 210,
      profitMargin: 0.6, // High margin claimed
    },
    inputEvidence: [
      "Revenue growing 40%",
      "Gross margin is 70%",
      "Operating leverage improving",
      "Cash is declining despite profitability",
      "AR is 2x monthly revenue (60+ days aging)",
    ],
    acceptableBehavior: {
      mustLowerConfidence: true,
      minConfidenceAfter: 0.3, // Very low confidence
      mustNotRecommendAs: [
        "Celebrate profitability",
        "Invest aggressively",
        "Relax cash controls",
      ],
      mustNotIdentifyAs: ["healthy growth"],
      mustFlagIfDetected: [
        "conflicting signals",
        "cash flow mismatch",
        "cannot recommend until conflict resolved",
      ],
    },
    expectedDetection: {
      caseType: "conflicting_data",
      confidence: 0.9,
      evidence: [
        "Revenue and cash metrics contradict",
        "Margin claims inconsistent with cash reality",
        "Multiple conflicting signals present",
      ],
    },
    createdAt: new Date("2026-06-15"),
    updatedAt: new Date("2026-06-15"),
  };
}

/**
 * CASE 4: Fake Improvement
 * Metrics improved but for wrong reasons (cost cutting while ignoring revenue decline)
 */
function createFakeImprovementCase(): AdversarialCase {
  return {
    id: "adversarial_fake_improvement_v1",
    type: "fake_improvement",
    title: "Fake Improvement: Margin Up Due to Cost Cut, Revenue Down",
    description:
      "Gross margin improved 10% but only because costs were cut. " +
      "Revenue actually declined 15%. System should detect: improvement is fake and masks underlying problem.",
    version: 1,
    badDataCharacteristics: [
      {
        characteristic: "fake_profitability_improvement",
        severity: "critical",
        description: "Margin improved but revenue declined",
        howToDetect: "Margin up vs. prior period, but revenue down",
      },
      {
        characteristic: "cost_cutting_masking_decline",
        severity: "high",
        description: "Cost cuts create appearance of improvement",
        howToDetect: "COGS down disproportionate to revenue decline",
      },
    ],
    dataQualityScore: 0.6, // Misleading data
    inputMetrics: {
      monthlyRevenue: 425000, // DOWN 15% from 500K
      previousMonthRevenue: 500000,
      costOfGoodsSold: 80000, // DOWN (cost cut)
      costOfGoodsSoldPrior: 150000, // Was 30%, now 18.8%
      operatingExpenses: 180000,
      grossMargin: 0.812, // UP 10% (from 70% to 81%)
      cashOnHand: 150000,
      accountsReceivable: 85000,
      customerCount: 140, // DOWN from 180
      churnRate: 0.08, // UP to 8%
    },
    inputEvidence: [
      "Gross margin improved 10%",
      "Operating leverage improving",
      "Cost controls in effect",
      "Revenue actually declined 15%",
      "Customer count down",
      "Churn rate rising",
    ],
    acceptableBehavior: {
      mustLowerConfidence: true,
      minConfidenceAfter: 0.35, // Low confidence
      mustNotRecommendAs: [
        "Celebrate margin improvement",
        "Continue cost-cutting strategy",
        "Reduce sales spending further",
      ],
      mustNotIdentifyAs: ["profitability success"],
      mustFlagIfDetected: [
        "improvement is false",
        "masks underlying decline",
        "cost cuts unsustainable",
      ],
    },
    expectedDetection: {
      caseType: "fake_improvement",
      confidence: 0.85,
      evidence: [
        "Margin improved while revenue declined",
        "Underlying metrics show deterioration",
        "Improvement is not sustainable",
      ],
    },
    createdAt: new Date("2026-06-15"),
    updatedAt: new Date("2026-06-15"),
  };
}

/**
 * CASE 5: Vanity Metrics
 * Metrics look good but don't correlate to business health
 */
function createVanityMetricsCase(): AdversarialCase {
  return {
    id: "adversarial_vanity_metrics_v1",
    type: "vanity_metrics",
    title: "Vanity Metrics: Signup Growth Doesn't Drive Revenue",
    description:
      "New user signups +100% but revenue flat. Low conversion rate (1.2% vs. 5% target). " +
      "System should not celebrate growth if it doesn't drive revenue and lowering confidence.",
    version: 1,
    badDataCharacteristics: [
      {
        characteristic: "vanity_growth",
        severity: "high",
        description: "Growth in metric that doesn't drive revenue",
        howToDetect: "Signups +100% but revenue flat",
      },
      {
        characteristic: "poor_conversion",
        severity: "high",
        description: "Signup-to-customer conversion very low",
        howToDetect: "Conversion rate 1.2% vs. 5% benchmark",
      },
    ],
    dataQualityScore: 0.65, // Okay data, but misleading interpretation
    inputMetrics: {
      monthlyRevenue: 180000, // Flat YoY
      revenueYoY: 180000,
      monthlySignups: 45000, // +100%
      signupsYoY: 22500,
      trialConversionRate: 0.012, // 1.2%
      trialConversionRateBenchmark: 0.05, // 5%
      cashOnHand: 200000,
      accountsReceivable: 30000,
      customerCount: 400,
      operatingExpenses: 280000,
    },
    inputEvidence: [
      "New user signups doubled",
      "Product growth metrics up",
      "Team celebrating user growth",
      "Revenue unchanged",
      "Conversion rate is 1.2%",
      "Not profitable",
    ],
    acceptableBehavior: {
      mustLowerConfidence: true,
      minConfidenceAfter: 0.4,
      mustNotRecommendAs: [
        "Celebrate growth metrics",
        "Increase marketing spend",
        "Scale based on signup growth",
      ],
      mustNotIdentifyAs: ["healthy growth"],
      mustFlagIfDetected: [
        "vanity metrics",
        "growth not tied to revenue",
        "low conversion rate",
        "focus on revenue, not signups",
      ],
    },
    expectedDetection: {
      caseType: "vanity_metrics",
      confidence: 0.8,
      evidence: [
        "Growth in non-revenue metric",
        "Revenue metrics flat",
        "Conversion rate below benchmark",
      ],
    },
    createdAt: new Date("2026-06-15"),
    updatedAt: new Date("2026-06-15"),
  };
}

/**
 * CASE 6: Wrong Attribution
 * Revenue attributed to wrong source
 */
function createWrongAttributionCase(): AdversarialCase {
  return {
    id: "adversarial_wrong_attribution_v1",
    type: "wrong_attribution",
    title: "Wrong Attribution: Took Credit for Partner Win",
    description:
      "Revenue spike attributed to sales team's efforts, but actually from partner referral. " +
      "System should flag attribution uncertainty, not make confident recommendations.",
    version: 1,
    badDataCharacteristics: [
      {
        characteristic: "attribution_uncertainty",
        severity: "critical",
        description: "Source of new revenue unclear",
        howToDetect: "No clear tracking of which channel drove each customer",
      },
      {
        characteristic: "assumed_success_credit",
        severity: "high",
        description: "Assuming internal team responsible for external win",
        howToDetect: "Partner referral mistakenly attributed to sales",
      },
    ],
    dataQualityScore: 0.55, // Okay overall, but attribution wrong
    inputMetrics: {
      monthlyRevenue: 600000,
      marketingGeneratedRevenue: 150000, // Assumed
      salesGeneratedRevenue: 450000, // Assumed, actually partner
      partnerReferralRevenue: 0, // Not tracked properly
      salesTeamClaimedCredit: 450000,
      actualSalesSourceRevenue: 100000,
      operatingExpenses: 250000,
      customerCount: 180,
    },
    inputEvidence: [
      "Revenue grew 50%",
      "Sales team expanded 40%",
      "New customers onboarded from partner",
      "Sales team reports strong performance",
      "But attribution not verified",
    ],
    acceptableBehavior: {
      mustLowerConfidence: true,
      minConfidenceAfter: 0.5,
      mustNotRecommendAs: [
        "Expand sales team based on performance",
        "Celebrate sales team success",
        "Increase sales spending based on ROI",
      ],
      mustNotIdentifyAs: ["sales team success"],
      mustFlagIfDetected: [
        "attribution unclear",
        "partner vs. internal credit unknown",
        "require verification before scaling",
      ],
    },
    expectedDetection: {
      caseType: "wrong_attribution",
      confidence: 0.75,
      evidence: [
        "Revenue source unclear",
        "Attribution not tracked properly",
        "Risk of false success credit",
      ],
    },
    createdAt: new Date("2026-06-15"),
    updatedAt: new Date("2026-06-15"),
  };
}

/**
 * CASE 7: Margin Illusion
 * Margin looks good but contains one-time gains
 */
function createMarginIllusionCase(): AdversarialCase {
  return {
    id: "adversarial_margin_illusion_v1",
    type: "margin_illusion",
    title: "Margin Illusion: One-Time Tax Refund in Results",
    description:
      "Operating margin is 45% but includes $150K one-time tax refund (20% of earnings). " +
      "Sustainable margin is actually ~25%. System should adjust for one-time items.",
    version: 1,
    badDataCharacteristics: [
      {
        characteristic: "one_time_gain_in_margin",
        severity: "high",
        description: "Tax refund boosts margin artificially",
        howToDetect: "One-time items > 10% of net income",
      },
      {
        characteristic: "sustainable_vs_reported_margin",
        severity: "high",
        description: "Reported margin higher than sustainable",
        howToDetect: "Adjust for one-time items, margin drops 50%+",
      },
    ],
    dataQualityScore: 0.7, // Okay data, but interpretation wrong
    inputMetrics: {
      monthlyRevenue: 1000000,
      costOfGoodsSold: 400000,
      operatingExpenses: 300000,
      oneTimeItems: 150000, // Tax refund
      reportedNetIncome: 300000, // 30% margin (including one-time)
      sustainableNetIncome: 150000, // 15% sustainable
      reportedMargin: 0.45, // Looks great!
      sustainableMargin: 0.25, // Actually okay
      cashOnHand: 350000,
      customerCount: 280,
    },
    inputEvidence: [
      "Operating margin is 45%",
      "Profitability excellent",
      "One-time tax refund of $150K received",
      "Core operations less profitable",
    ],
    acceptableBehavior: {
      mustLowerConfidence: true,
      minConfidenceAfter: 0.55,
      mustNotRecommendAs: [
        "Celebrate margin achievement",
        "Plan to maintain 45% margins",
        "Use reported margin for forecasts",
      ],
      mustNotIdentifyAs: ["sustainable profitability"],
      mustFlagIfDetected: [
        "one-time items present",
        "adjust for non-recurring gains",
        "use sustainable margin for planning",
      ],
    },
    expectedDetection: {
      caseType: "margin_illusion",
      confidence: 0.8,
      evidence: [
        "One-time gains in results",
        "Sustainable margin much lower",
        "Cannot rely on reported margin",
      ],
    },
    createdAt: new Date("2026-06-15"),
    updatedAt: new Date("2026-06-15"),
  };
}

/**
 * CASE 8: Cash Illusion
 * Cash position looks good but accounts payable obligations not counted
 */
function createCashIllusionCase(): AdversarialCase {
  return {
    id: "adversarial_cash_illusion_v1",
    type: "cash_illusion",
    title: "Cash Illusion: Ignoring Accounts Payable Obligations",
    description:
      "Cash $500K looks strong, but company owes $400K in payables due this month. " +
      "True available cash is only $100K. System should flag working capital risk, not celebrate cash position.",
    version: 1,
    badDataCharacteristics: [
      {
        characteristic: "unpaid_obligations_ignored",
        severity: "critical",
        description: "Accounts payable obligations not subtracted from cash",
        howToDetect: "Cash high, but AP also very high",
      },
      {
        characteristic: "net_cash_misstated",
        severity: "critical",
        description: "Reported cash vs. available cash mismatch",
        howToDetect: "Cash - AP = much smaller number",
      },
    ],
    dataQualityScore: 0.4, // Bad data interpretation
    inputMetrics: {
      cashOnHand: 500000, // Looks good!
      accountsPayable: 400000, // Ignored
      netAvailableCash: 100000, // Reality
      monthlyExpenses: 350000,
      accountsReceivable: 200000,
      inventory: 150000,
      monthlyRevenue: 600000,
    },
    inputEvidence: [
      "Cash balance is $500K",
      "Strong balance sheet",
      "Large invoices due to suppliers",
      "Payroll due this month",
      "Accounts payable high but ignored",
    ],
    acceptableBehavior: {
      mustLowerConfidence: true,
      minConfidenceAfter: 0.25, // Very low confidence
      mustNotRecommendAs: [
        "Celebrate cash position",
        "Invest cash in growth",
        "Relax credit terms",
      ],
      mustNotIdentifyAs: ["strong liquidity"],
      mustFlagIfDetected: [
        "accounts payable obligations high",
        "net cash position critical",
        "liquidity crisis risk",
        "must address payables",
      ],
    },
    expectedDetection: {
      caseType: "cash_illusion",
      confidence: 0.9,
      evidence: [
        "Large payable obligations present",
        "Net cash position much weaker",
        "Liquidity crisis at risk",
      ],
    },
    createdAt: new Date("2026-06-15"),
    updatedAt: new Date("2026-06-15"),
  };
}

/**
 * CASE 9: Founder Bias
 * Data reflects founder's optimism, not market reality
 */
function createFounderBiasCase(): AdversarialCase {
  return {
    id: "adversarial_founder_bias_v1",
    type: "founder_bias",
    title: "Founder Bias: Optimistic Forecasts Vs. Actual Delivery",
    description:
      "Founder projects 50% growth next quarter. Historical track record is 8% actual vs. 40% forecast. " +
      "System should flag forecast bias and use historical accuracy for planning.",
    version: 1,
    badDataCharacteristics: [
      {
        characteristic: "forecast_bias",
        severity: "high",
        description: "Founder forecasts historically 5x too optimistic",
        howToDetect: "Compare prior quarter forecasts to actuals",
      },
      {
        characteristic: "optimism_bias",
        severity: "high",
        description: "Pattern of overconfidence in projections",
        howToDetect: "Historical accuracy rate <20% of forecast",
      },
    ],
    dataQualityScore: 0.65, // Data is accurate, but forecast is biased
    inputMetrics: {
      monthlyRevenue: 400000,
      priorQuarterForecast: 500000, // Forecast 40% growth
      priorQuarterActual: 412000, // Actual 8% growth (32% miss)
      founderNextQuarterForecast: 600000, // 50% growth projected
      historicalForecastAccuracy: 0.18, // Only 18% accurate
      historicalAverageMiss: 4.2, // 4.2x overestimate
      recentPerformance: 0.08, // Recent growth is 8%
    },
    inputEvidence: [
      "Founder projects 50% growth next quarter",
      "Last quarter forecast was 40% growth",
      "Last quarter actual was 8% growth (32% variance)",
      "Pattern of optimistic forecasts",
      "Market conditions unchanged",
    ],
    acceptableBehavior: {
      mustLowerConfidence: true,
      minConfidenceAfter: 0.4,
      mustNotRecommendAs: [
        "Trust founder forecast for planning",
        "Hire based on growth projections",
        "Invest capex based on forecast",
      ],
      mustNotIdentifyAs: ["sustainable growth trajectory"],
      mustFlagIfDetected: [
        "founder forecast bias detected",
        "historical accuracy low",
        "use historical growth rate for planning",
        "apply conservatism to projections",
      ],
    },
    expectedDetection: {
      caseType: "founder_bias",
      confidence: 0.8,
      evidence: [
        "Pattern of forecast misses",
        "Optimism bias in projections",
        "Historical accuracy low",
      ],
    },
    createdAt: new Date("2026-06-15"),
    updatedAt: new Date("2026-06-15"),
  };
}

/**
 * CASE 10: Seasonality Trap
 * Baseline understanding of seasonality is missing
 */
function createSeasonalityTrapCase(): AdversarialCase {
  return {
    id: "adversarial_seasonality_trap_v1",
    type: "seasonality_trap",
    title: "Seasonality Trap: Mistaking Seasonal Decline for Crisis",
    description:
      "August revenue dropped 40% from July, causing panic. But August is historically 35% down. " +
      "System should recognize seasonality pattern, not flag false crisis.",
    version: 1,
    badDataCharacteristics: [
      {
        characteristic: "seasonal_pattern_not_recognized",
        severity: "high",
        description: "Normal seasonal decline misinterpreted as crisis",
        howToDetect: "Month-over-month decline matches historical seasonal pattern",
      },
      {
        characteristic: "lacks_year_over_year_comparison",
        severity: "high",
        description: "No comparison to prior year same month",
        howToDetect: "YoY shows growth despite MoM decline",
      },
    ],
    dataQualityScore: 0.7, // Data is good, interpretation wrong
    inputMetrics: {
      currentMonthRevenue: 300000, // August (down 40%)
      priorMonthRevenue: 500000, // July
      monthOverMonthChange: -0.4,
      priorYearAugustRevenue: 280000, // August YoY
      yearOverYearChange: 0.07, // Actually +7% YoY
      historicalSeasonalityFactor: -0.35, // August is historically -35%
      currentMonthNumber: 8,
    },
    inputEvidence: [
      "Revenue down 40% month-over-month",
      "Team panicking about decline",
      "Prior year August was lower revenue",
      "Year-over-year actually up 7%",
    ],
    acceptableBehavior: {
      mustLowerConfidence: false, // Actually should be normal confidence!
      minConfidenceAfter: 0.65,
      mustNotRecommendAs: [
        "Emergency intervention",
        "Cut spending immediately",
        "Pause growth plans",
      ],
      mustNotIdentifyAs: ["business in crisis"],
      mustFlagIfDetected: [
        "seasonal pattern recognized",
        "do not panic on seasonal decline",
        "compare YoY, not MoM",
      ],
    },
    expectedDetection: {
      caseType: "seasonality_trap",
      confidence: 0.8,
      evidence: [
        "Decline matches historical seasonality",
        "YoY metrics are healthy",
        "No underlying problem",
      ],
    },
    createdAt: new Date("2026-06-15"),
    updatedAt: new Date("2026-06-15"),
  };
}

/**
 * CASE 11: Outlier Distortion
 * Single extreme event distorts aggregate metrics
 */
function createOutlierDistortionCase(): AdversarialCase {
  return {
    id: "adversarial_outlier_distortion_v1",
    type: "outlier_distortion",
    title: "Outlier Distortion: One Large Customer Skews Metrics",
    description:
      "One customer is 40% of revenue but is acquisition anomaly (largest deal ever). " +
      "Normalized metrics show real business is much smaller. System should exclude or flag outliers.",
    version: 1,
    badDataCharacteristics: [
      {
        characteristic: "outlier_customer_concentration",
        severity: "critical",
        description: "Single customer is extreme outlier",
        howToDetect: "One customer > 3x average customer size",
      },
      {
        characteristic: "metrics_distorted_by_outlier",
        severity: "high",
        description: "Aggregate metrics don't represent typical",
        howToDetect: "Average customer value much higher than median",
      },
    ],
    dataQualityScore: 0.75, // Good data, but distorted by outlier
    inputMetrics: {
      totalRevenue: 700000,
      outlierCustomerRevenue: 280000, // 40% of total
      revenueExcludingOutlier: 420000,
      customerCount: 65,
      averageCustomerValue: 10769, // Includes outlier
      medianCustomerValue: 6000, // Without outlier
      largestCustomerSize: 280000,
      secondLargestCustomerSize: 35000,
    },
    inputEvidence: [
      "Average customer value is $10,769",
      "One customer generated $280K",
      "Rest of customer base much smaller",
      "Outlier won in one-time deal",
      "Unlikely to repeat",
    ],
    acceptableBehavior: {
      mustLowerConfidence: true,
      minConfidenceAfter: 0.5,
      mustNotRecommendAs: [
        "Scale based on current revenue",
        "Plan around large customer stability",
        "Hire based on customer value metrics",
      ],
      mustNotIdentifyAs: ["healthy customer base"],
      mustFlagIfDetected: [
        "outlier customer identified",
        "metrics distorted by outlier",
        "analyze excluding outlier",
        "customer concentration risk",
      ],
    },
    expectedDetection: {
      caseType: "outlier_distortion",
      confidence: 0.85,
      evidence: [
        "Extreme outlier customer present",
        "Metrics heavily skewed",
        "Normalized metrics much smaller",
      ],
    },
    createdAt: new Date("2026-06-15"),
    updatedAt: new Date("2026-06-15"),
  };
}

/**
 * Create all 11 adversarial cases
 */
export function createAllAdversarialCases(): AdversarialCase[] {
  const cases: AdversarialCase[] = [
    createMissingDataCase(),
    createMisleadingDataCase(),
    createConflictingDataCase(),
    createFakeImprovementCase(),
    createVanityMetricsCase(),
    createWrongAttributionCase(),
    createMarginIllusionCase(),
    createCashIllusionCase(),
    createFounderBiasCase(),
    createSeasonalityTrapCase(),
    createOutlierDistortionCase(),
  ];

  // Validate all cases
  for (const adversarialCase of cases) {
    const validation = validateAdversarialCase(adversarialCase);
    if (!validation.valid) {
      throw new Error(
        `Adversarial case ${adversarialCase.id} is invalid: ${validation.errors.join("; ")}`
      );
    }
  }

  return cases;
}

/**
 * Get case by ID
 */
export function getCaseById(caseId: string): AdversarialCase | null {
  const cases = createAllAdversarialCases();
  return cases.find((c) => c.id === caseId) || null;
}

/**
 * Get case by type
 */
export function getCaseByType(type: AdversarialCaseType): AdversarialCase | null {
  const cases = createAllAdversarialCases();
  return cases.find((c) => c.type === type) || null;
}

/**
 * Evaluate case result
 */
export function evaluateAdversarialCase(
  caseData: AdversarialCase,
  result: AdversarialCaseRunResult
): {
  passed: boolean;
  violations: string[];
  evidence: string[];
} {
  return evaluateAdversarialResult(caseData, result);
}
