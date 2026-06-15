/**
 * B17-S1: Synthetic Business Scenario Simulator — Execution Engine
 *
 * Provides:
 * - 12 predefined deterministic scenarios
 * - Scenario loading and retrieval
 * - Result evaluation and scoring
 * - Determinism verification
 */

import type {
  SyntheticScenario,
  ScenarioRunResult,
  ScenarioType,
  BusinessMetrics,
  RiskFlag,
} from "./synthetic-scenario";
import {
  validateSyntheticScenario,
  checkFailureConditions,
  scoreScenarioResult,
} from "./synthetic-scenario";

/**
 * SCENARIO 1: Cash Crisis
 * A profitable business facing immediate cash shortage despite good revenue
 */
function createCashCrisisScenario(): SyntheticScenario {
  return {
    id: "scenario_cash_crisis_v1",
    type: "cash_crisis",
    title: "Cash Crisis: Revenue ≠ Cash",
    description:
      "Business is profitable on paper but facing severe cash shortage. " +
      "Revenue is strong, but sales on credit terms have created receivables buildup. " +
      "Inventory is also high, tying up cash. Immediate crisis: payroll cannot be met.",
    version: 1,
    industryContext: "SaaS (B2B)",
    businessModel: "subscription (annual upfront)",
    businessSize: "small",
    initialMetrics: {
      monthlyRevenue: 150000,
      costOfGoodsSold: 45000,
      operatingExpenses: 80000,
      cashOnHand: 8000, // CRISIS: only 1.3 weeks of expenses
      accountsReceivable: 420000, // 2.8 months of revenue tied up
      inventory: 0,
      staffCount: 12,
      customerCount: 145,
      churnRate: 2.1,
      averageOrderValue: 1034,
      marketingSpend: 25000,
      marketingGeneratedRevenue: 75000,
      monthNumber: 6,
    },
    expectedRootCauses: [
      "Large customer account purchased on 120-day payment terms created accounts receivable buildup",
      "No cash forecast or daily monitoring; gap between profit and cash flow not visible",
      "Customer concentration: single contract represents 35% of monthly recurring revenue",
    ],
    causeDescription:
      "Root causes are: (1) extended payment terms granted to win large customer, creating massive receivables; " +
      "(2) lack of working capital planning; (3) customer concentration risk makes business vulnerable to single account timing.",
    expectedRecommendations: [
      "Implement daily cash forecast (14-day rolling minimum required balance)",
      "Establish credit policy: max 30-day terms unless specifically approved with bank backing",
      "Contact large customer immediately to negotiate early payment or arrange working capital facility against receivables",
      "Hire CFO/controller to establish cash monitoring and forecasting discipline",
      "Negotiate extended payment terms with suppliers to improve cash cycle",
    ],
    recommendationDescription:
      "Recommendations prioritize immediate action (cash forecast and payment terms), medium-term fixes (controller hire, supplier negotiation), " +
      "and strategic risk reduction (customer concentration).",
    expectedRiskFlags: [
      {
        riskType: "cash_runway_critical",
        severity: "critical",
        description: "Cash runway is 1.3 weeks at current burn rate",
      },
      {
        riskType: "customer_concentration",
        severity: "high",
        description: "Single customer represents >30% of recurring revenue",
      },
      {
        riskType: "receivables_aging",
        severity: "high",
        description: "Accounts receivable are 2.8x monthly revenue (>90 days aging)",
      },
      {
        riskType: "weak_financial_controls",
        severity: "high",
        description: "No visible cash forecasting or daily monitoring discipline",
      },
    ],
    riskFlagDescription:
      "Critical risks are: cash runway at 1.3 weeks, customer concentration, aged receivables, weak financial controls. " +
      "Medium risks are: no CFO/controller to establish controls, payment term policy absent.",
    acceptableAnswerRange: {
      minCauseAccuracy: 0.67, // must identify at least 2 of 3 root causes
      minRecommendationQuality: 0.6, // must identify at least 3 of 5 recommendations
      maxFalsePositives: 2, // max 2 wrong causes/recommendations
    },
    failureConditions: [
      {
        type: "missing_critical_risk",
        description: "Must identify cash_runway_critical risk",
        failsSlice: true,
      },
      {
        type: "missing_primary_cause",
        description: "Must identify primary cause: extended payment terms created receivables buildup",
        failsSlice: true,
      },
      {
        type: "hallucinated_cause",
        description: "Cannot hallucinate causes not grounded in metrics (e.g., 'product-market fit issue')",
        failsSlice: false,
      },
      {
        type: "poor_cause_accuracy",
        description: "Must achieve at least 67% cause accuracy",
        failsSlice: true,
      },
    ],
    createdAt: new Date("2026-06-15"),
    updatedAt: new Date("2026-06-15"),
  };
}

/**
 * SCENARIO 2: High Revenue Low Profit
 * Strong revenue growth but profitability declining due to discounting or rising costs
 */
function createHighRevenueHighCostScenario(): SyntheticScenario {
  return {
    id: "scenario_high_revenue_low_profit_v1",
    type: "high_revenue_low_profit",
    title: "High Revenue, Low Profit: Growth Cannibalizing Margin",
    description:
      "Revenue grew 40% YoY but gross margin declined from 72% to 58%. " +
      "Sales team is winning deals at lower prices to hit growth targets. " +
      "Manufacturing costs are rising due to rush orders and inefficient production.",
    version: 1,
    industryContext: "Hardware Manufacturing",
    businessModel: "direct sales",
    businessSize: "medium",
    initialMetrics: {
      monthlyRevenue: 2800000,
      costOfGoodsSold: 1176000, // 42% COGS (down from 28%)
      operatingExpenses: 1400000, // 50% of revenue
      cashOnHand: 450000,
      accountsReceivable: 560000,
      inventory: 2100000, // 9 weeks of inventory
      staffCount: 145,
      customerCount: 892,
      churnRate: 8.5,
      averageOrderValue: 3142,
      marketingSpend: 280000,
      marketingGeneratedRevenue: 1120000,
      monthNumber: 9,
    },
    expectedRootCauses: [
      "Sales team discounting to hit revenue targets (average deal price down 22%)",
      "Manufacturing inefficiency from rush orders; no production scheduling or batching",
      "Accounts Payable stretched; supplier payment times increased from 30 to 45 days",
    ],
    causeDescription:
      "Growth is real but unsustainable. Root causes: (1) sales incentives misaligned (revenue vs. margin); " +
      "(2) manufacturing scaled without process discipline; (3) supply chain pressured.",
    expectedRecommendations: [
      "Change sales compensation to margin-based (not revenue-based) with clawback for deals <40% margin",
      "Implement production scheduling and batch optimization to reduce cost of goods",
      "Conduct supply chain cost reduction analysis; consider reshoring vs. optimization",
      "Hire Chief Manufacturing Officer to establish production discipline and cost controls",
      "Conduct detailed margin analysis by customer segment; exit or restructure unprofitable customers",
    ],
    recommendationDescription:
      "Recommendations address immediate profitability (sales incentive fix, margin analysis), medium-term operational efficiency (manufacturing discipline), " +
      "and strategic positioning (supply chain).",
    expectedRiskFlags: [
      {
        riskType: "margin_erosion",
        severity: "critical",
        description: "Gross margin declining (72% → 58%); at this rate, will hit negative margin in 6 months",
      },
      {
        riskType: "sales_misalignment",
        severity: "high",
        description: "Sales team incentivized on revenue, not margin; driving unprofitable deals",
      },
      {
        riskType: "operational_inefficiency",
        severity: "high",
        description: "Manufacturing cost per unit rising despite volume increase; indicates process failure",
      },
      {
        riskType: "supply_chain_stress",
        severity: "medium",
        description: "Supplier relationships strained; payment terms extended from 30 to 45 days",
      },
    ],
    riskFlagDescription:
      "Critical risk is margin erosion trajectory. High risks are sales misalignment and operational inefficiency. " +
      "Medium risk is supply chain stress.",
    acceptableAnswerRange: {
      minCauseAccuracy: 0.67, // must identify at least 2 of 3 root causes
      minRecommendationQuality: 0.6, // must identify at least 3 of 5 recommendations
      maxFalsePositives: 2,
    },
    failureConditions: [
      {
        type: "missing_critical_risk",
        description: "Must identify margin_erosion risk",
        failsSlice: true,
      },
      {
        type: "missing_primary_cause",
        description: "Must identify primary cause: sales team discounting",
        failsSlice: true,
      },
      {
        type: "poor_recommendation_quality",
        description: "Must achieve at least 60% recommendation quality",
        failsSlice: true,
      },
    ],
    createdAt: new Date("2026-06-15"),
    updatedAt: new Date("2026-06-15"),
  };
}

/**
 * SCENARIO 3: Low Revenue High Profit
 * Small revenue base but high margin and efficient operations
 */
function createLowRevenueHighProfitScenario(): SyntheticScenario {
  return {
    id: "scenario_low_revenue_high_profit_v1",
    type: "low_revenue_high_profit",
    title: "Low Revenue, High Profit: Niche Premium Market",
    description:
      "Boutique consulting firm with modest monthly revenue but 78% net margin. " +
      "Focus is on premium, high-value engagements for Fortune 500 clients. " +
      "Growth is limited by availability of senior consultants, not market demand.",
    version: 1,
    industryContext: "Professional Services (Consulting)",
    businessModel: "project services",
    businessSize: "small",
    initialMetrics: {
      monthlyRevenue: 425000,
      costOfGoodsSold: 0, // Pure services; use OpEx to represent cost
      operatingExpenses: 93500, // 22% of revenue (highly efficient)
      cashOnHand: 185000,
      accountsReceivable: 212500, // 0.5 months outstanding
      inventory: 0,
      staffCount: 18,
      customerCount: 8,
      churnRate: 0,
      averageOrderValue: 53125,
      marketingSpend: 0, // No formal marketing; all referral
      marketingGeneratedRevenue: 425000,
      monthNumber: 11,
    },
    expectedRootCauses: [
      "Scaling limited by senior consultant availability, not demand",
      "Founder unwilling to add management overhead; prefers to keep profit margin high",
      "High-touch service model does not leverage leverage junior consultants or technology",
    ],
    causeDescription:
      "Business is healthy and profitable. Root causes for growth limitation are: (1) supply-side (consultant capacity); " +
      "(2) founder preference (margin vs. growth); (3) service delivery model (high-touch, not leveraged).",
    expectedRecommendations: [
      "Decision: choose between growth and current margin. If growth desired, hire consultants and invest in training",
      "If growth not desired, maintain current model; consider interim to scale specific engagements",
      "Explore leverage: productization of high-value services, workshops, advisory retainers (lower touch)",
      "If pursuing growth, establish associate/junior consultant pipeline with senior mentorship program",
    ],
    recommendationDescription:
      "This scenario does not have a 'problem' in traditional sense; it is a choice scenario. " +
      "Recommendations address strategic decision (growth vs. margin) and operational options.",
    expectedRiskFlags: [
      {
        riskType: "capacity_constraint",
        severity: "medium",
        description: "Growth limited by senior consultant availability; opportunity loss",
      },
      {
        riskType: "customer_concentration",
        severity: "medium",
        description: "Only 8 customers; churn of one represents 12.5% revenue loss",
      },
      {
        riskType: "founder_constraint",
        severity: "medium",
        description: "Founder's reluctance to add management overhead may be limiting strategic growth",
      },
      {
        riskType: "no_marketing",
        severity: "low",
        description: "Reliance on referral; no intentional marketing or brand development",
      },
    ],
    riskFlagDescription:
      "No critical risks. Medium risks are capacity constraint, customer concentration, and founder constraint. " +
      "Low risk is lack of intentional marketing.",
    acceptableAnswerRange: {
      minCauseAccuracy: 0.67, // must identify at least 2 of 3 root causes
      minRecommendationQuality: 0.4, // lower threshold; this is a choice scenario
      maxFalsePositives: 3, // more tolerance for false positives here
    },
    failureConditions: [
      {
        type: "missing_critical_risk",
        description: "Must identify at least one medium-level risk (not hallucinate critical risks)",
        failsSlice: false,
      },
      {
        type: "missing_primary_cause",
        description: "Must identify that growth is capacity-limited, not demand-limited",
        failsSlice: true,
      },
    ],
    createdAt: new Date("2026-06-15"),
    updatedAt: new Date("2026-06-15"),
  };
}

/**
 * SCENARIO 4: Bad Marketing ROI
 * High marketing spend not generating proportional revenue
 */
function createBadMarketingROIScenario(): SyntheticScenario {
  return {
    id: "scenario_bad_marketing_roi_v1",
    type: "bad_marketing_roi",
    title: "Bad Marketing ROI: $8 Spend Per $1 Revenue",
    description:
      "SaaS company spent $600K on performance marketing in Q2 but generated only $75K in attributed revenue. " +
      "CAC is $8 per dollar of annual contract value. Average customer value is $2,400 annual contract value. " +
      "Payback period is 40 months; industry standard is 12 months.",
    version: 1,
    industryContext: "SaaS (B2B)",
    businessModel: "subscription",
    businessSize: "medium",
    initialMetrics: {
      monthlyRevenue: 180000, // Mix of new and existing
      costOfGoodsSold: 45000,
      operatingExpenses: 140000, // Including $600K marketing over Q2 (amortized)
      cashOnHand: 125000,
      accountsReceivable: 90000,
      inventory: 0,
      staffCount: 42,
      customerCount: 450,
      churnRate: 5.2,
      averageOrderValue: 400,
      marketingSpend: 200000, // Ongoing burn per month
      marketingGeneratedRevenue: 25000, // Only 12.5% of monthly revenue from marketing
      monthNumber: 7,
    },
    expectedRootCauses: [
      "Marketing targeting wrong audience (too broad); message-market fit issue",
      "Landing page conversion rate is 1.2% (industry standard 3-5%)",
      "Sales team not equipped to close marketing-qualified leads; handoff broken",
    ],
    causeDescription:
      "Root causes are multi-layer: (1) audience/messaging mismatch; (2) conversion funnel broken; (3) sales enablement failure.",
    expectedRecommendations: [
      "Pause broad-audience campaigns; pivot to specific vertical/company size with higher conversion",
      "Conduct landing page audit and A/B test with goal of 3%+ conversion rate",
      "Establish clear SLA between marketing and sales; map lead quality issues",
      "Hire fractional CMO to establish marketing performance baseline and experimentation framework",
      "Implement attribution model (multi-touch) to identify which channels/messages actually work",
    ],
    recommendationDescription:
      "Recommendations address immediate tactical issues (targeting, landing page, attribution), medium-term team and process fixes (sales enablement, CMO), " +
      "and strategic reorientation.",
    expectedRiskFlags: [
      {
        riskType: "marketing_efficiency_critical",
        severity: "critical",
        description: "CAC is $8 per $1 ACV; payback period is 40 months (vs. 12-month standard)",
      },
      {
        riskType: "funnel_conversion_low",
        severity: "high",
        description: "Landing page conversion 1.2%; industry standard 3-5%",
      },
      {
        riskType: "message_market_fit_weak",
        severity: "high",
        description: "Targeting appears too broad; no clear ideal customer profile",
      },
      {
        riskType: "sales_marketing_misalignment",
        severity: "medium",
        description: "No clear SLA or metrics between sales and marketing teams",
      },
    ],
    riskFlagDescription:
      "Critical risk is marketing efficiency (unsustainable CAC). High risks are conversion funnel and message-market fit. " +
      "Medium risk is sales-marketing misalignment.",
    acceptableAnswerRange: {
      minCauseAccuracy: 0.67, // must identify at least 2 of 3 root causes
      minRecommendationQuality: 0.6, // must identify at least 3 of 5 recommendations
      maxFalsePositives: 2,
    },
    failureConditions: [
      {
        type: "missing_critical_risk",
        description: "Must identify marketing_efficiency_critical risk",
        failsSlice: true,
      },
      {
        type: "missing_primary_cause",
        description: "Must identify that marketing efficiency is the core problem",
        failsSlice: true,
      },
    ],
    createdAt: new Date("2026-06-15"),
    updatedAt: new Date("2026-06-15"),
  };
}

/**
 * SCENARIO 5: High Churn
 * Customer acquisition working but retention is failing
 */
function createHighChurnScenario(): SyntheticScenario {
  return {
    id: "scenario_high_churn_v1",
    type: "high_churn",
    title: "High Churn: 8% Monthly Churn Unsustainable",
    description:
      "SaaS product is acquiring customers but losing them at 8% per month. " +
      "New customer cohorts are acquired monthly but half are gone within 3 months. " +
      "Customer feedback indicates product does not deliver on promised value.",
    version: 1,
    industryContext: "SaaS (B2B2C)",
    businessModel: "subscription",
    businessSize: "small",
    initialMetrics: {
      monthlyRevenue: 95000,
      costOfGoodsSold: 0,
      operatingExpenses: 185000, // Heavy acquisition spend
      cashOnHand: 280000,
      accountsReceivable: 47500,
      inventory: 0,
      staffCount: 28,
      customerCount: 1250,
      churnRate: 8.0, // Critical: should be 2-3% for SaaS
      averageOrderValue: 76,
      marketingSpend: 120000,
      marketingGeneratedRevenue: 57000,
      monthNumber: 10,
    },
    expectedRootCauses: [
      "Product-market fit issue: customers discover product does not solve stated problem",
      "Onboarding is weak; customers do not achieve value in first 30 days",
      "Customer success team is understaffed; customers churn without anyone noticing or intervening",
    ],
    causeDescription:
      "Root causes are: (1) product value delivery mismatch; (2) onboarding process failure; (3) lack of retention/success discipline.",
    expectedRecommendations: [
      "Conduct churn analysis: interview lost customers to identify why they left",
      "Establish product value milestone (e.g., 'customer creates first report'); measure % reaching it by day 30",
      "Implement mandatory onboarding program; assign customer success manager to each new customer",
      "Create retention dashboard; track churn by cohort, feature usage, and NPS by segment",
      "If product-market fit issue confirmed, pivot messaging and targeting to better-fit segment",
    ],
    recommendationDescription:
      "Recommendations prioritize diagnosing the churn (customer interviews, value analysis), then establishing retention discipline (onboarding, CSM, dashboards), " +
      "and finally product repositioning if needed.",
    expectedRiskFlags: [
      {
        riskType: "churn_unsustainable",
        severity: "critical",
        description: "Monthly churn at 8% is unsustainable; customer lifetime value is 12.5 months only",
      },
      {
        riskType: "product_market_fit_weak",
        severity: "high",
        description: "Customer feedback suggests value delivery mismatch",
      },
      {
        riskType: "customer_success_missing",
        severity: "high",
        description: "No retention/success infrastructure; customers churn unmanaged",
      },
      {
        riskType: "acquisition_efficiency_poor",
        severity: "high",
        description: "Acquiring customers at cost, but losing them too fast to achieve ROI",
      },
    ],
    riskFlagDescription:
      "Critical risk is unsustainable churn. High risks are product-market fit, customer success absence, and acquisition efficiency.",
    acceptableAnswerRange: {
      minCauseAccuracy: 0.67, // must identify at least 2 of 3 root causes
      minRecommendationQuality: 0.6, // must identify at least 3 of 5 recommendations
      maxFalsePositives: 2,
    },
    failureConditions: [
      {
        type: "missing_critical_risk",
        description: "Must identify churn_unsustainable risk",
        failsSlice: true,
      },
      {
        type: "missing_primary_cause",
        description: "Must identify that churn is the core problem, not acquisition",
        failsSlice: true,
      },
    ],
    createdAt: new Date("2026-06-15"),
    updatedAt: new Date("2026-06-15"),
  };
}

/**
 * SCENARIO 6: Inventory Overstock
 * Inventory tied up in slow-moving SKUs
 */
function createInventoryOverstockScenario(): SyntheticScenario {
  return {
    id: "scenario_inventory_overstock_v1",
    type: "inventory_overstock",
    title: "Inventory Overstock: 22 Weeks of Supply",
    description:
      "Retail/wholesale business has inventory sitting for 22 weeks before sale. " +
      "Forecasting was wrong; inventory ordered for 'anticipated' demand but demand materialized differently. " +
      "Cash is tied up; warehouse space is full.",
    version: 1,
    industryContext: "Wholesale / Retail",
    businessModel: "direct sales + distribution",
    businessSize: "medium",
    initialMetrics: {
      monthlyRevenue: 750000,
      costOfGoodsSold: 450000,
      operatingExpenses: 180000,
      cashOnHand: 95000, // Low despite revenue
      accountsReceivable: 225000, // 0.3 months
      inventory: 3850000, // 22 weeks of supply at COGS rate
      staffCount: 65,
      customerCount: 320,
      churnRate: 4.2,
      averageOrderValue: 2344,
      marketingSpend: 45000,
      marketingGeneratedRevenue: 375000,
      monthNumber: 8,
    },
    expectedRootCauses: [
      "Demand forecasting is inaccurate; orders placed based on predictions, not actual demand signals",
      "Inventory management is manual/spreadsheet-based; no automatic reorder or velocity tracking",
      "Sales team does not communicate pipeline or customer demand changes to procurement",
    ],
    causeDescription:
      "Root causes are: (1) forecasting process failure; (2) lack of inventory management systems; (3) broken communication between sales and procurement.",
    expectedRecommendations: [
      "Implement demand planning system that tracks actual sales velocity and adjusts orders automatically",
      "Conduct SKU analysis; identify slow-movers and implement clearance/discount strategy",
      "Establish weekly sales-procurement sync; require sales team to provide demand forecast",
      "Implement lead-time based minimum/maximum inventory rules; eliminate guessing",
      "Consider third-party logistics (3PL) to expand warehouse capacity while implementing fix",
    ],
    recommendationDescription:
      "Recommendations address immediate inventory excess (SKU analysis, clearance), medium-term process (demand planning system, sales-procurement sync), " +
      "and operational efficiency (3PL, inventory rules).",
    expectedRiskFlags: [
      {
        riskType: "cash_tied_up_critical",
        severity: "critical",
        description: "5.1x annual revenue tied up in inventory; cash runway at 1.3 weeks despite strong sales",
      },
      {
        riskType: "inventory_velocity_low",
        severity: "high",
        description: "22 weeks of supply indicates severe demand-supply mismatch",
      },
      {
        riskType: "obsolescence_risk",
        severity: "high",
        description: "Old inventory risks obsolescence; products may expire or become outdated",
      },
      {
        riskType: "warehouse_capacity",
        severity: "medium",
        description: "Physical space is full; cannot accept new inventory",
      },
    ],
    riskFlagDescription:
      "Critical risk is cash tied up. High risks are inventory velocity and obsolescence. Medium risk is warehouse capacity.",
    acceptableAnswerRange: {
      minCauseAccuracy: 0.67, // must identify at least 2 of 3 root causes
      minRecommendationQuality: 0.6, // must identify at least 3 of 5 recommendations
      maxFalsePositives: 2,
    },
    failureConditions: [
      {
        type: "missing_critical_risk",
        description: "Must identify cash_tied_up_critical risk",
        failsSlice: true,
      },
      {
        type: "missing_primary_cause",
        description: "Must identify that forecasting/inventory management is broken",
        failsSlice: true,
      },
    ],
    createdAt: new Date("2026-06-15"),
    updatedAt: new Date("2026-06-15"),
  };
}

/**
 * SCENARIO 7: Staff Productivity Problem
 * Team is large but output is not increasing proportionally
 */
function createStaffProductivityScenario(): SyntheticScenario {
  return {
    id: "scenario_staff_productivity_v1",
    type: "staff_productivity_problem",
    title: "Staff Productivity Problem: Headcount Up 40%, Revenue Up 8%",
    description:
      "Engineering team doubled from 15 to 30 people in the last year, but feature delivery is slower. " +
      "Meetings, coordination overhead, and unclear priorities are consuming time. No performance tracking.",
    version: 1,
    industryContext: "SaaS (Product)",
    businessModel: "subscription",
    businessSize: "medium",
    initialMetrics: {
      monthlyRevenue: 420000,
      costOfGoodsSold: 105000,
      operatingExpenses: 280000, // Heavy on personnel
      cashOnHand: 210000,
      accountsReceivable: 105000,
      inventory: 0,
      staffCount: 85, // Was 60 a year ago; 42% growth
      customerCount: 650,
      churnRate: 3.1,
      averageOrderValue: 646,
      marketingSpend: 42000,
      marketingGeneratedRevenue: 168000,
      monthNumber: 5,
    },
    expectedRootCauses: [
      "Team grew too fast without establishing communication/coordination structures",
      "No clear product roadmap or prioritization; teams working on parallel projects with unclear interdependencies",
      "Engineering manager-to-IC ratio deteriorated; insufficient 1-on-1 management and coaching",
    ],
    causeDescription:
      "Root causes are: (1) organizational scaling without process discipline; (2) lack of strategic planning; (3) management bandwidth stretched.",
    expectedRecommendations: [
      "Establish product roadmap with quarterly planning; communicate priorities clearly to engineering",
      "Implement weekly triage/planning ceremonies; reduce ad-hoc meetings and context switches",
      "Hire engineering managers to establish proper 1-on-1 cadence and coaching; target 1:6 or 1:7 ratio",
      "Implement sprint-based delivery tracking; measure velocity and identify bottlenecks",
      "Conduct working agreements workshops; establish core hours and communication norms",
    ],
    recommendationDescription:
      "Recommendations address organizational structure (managers, ratios), process discipline (roadmap, sprints, planning), and communication norms.",
    expectedRiskFlags: [
      {
        riskType: "productivity_declining",
        severity: "critical",
        description: "Revenue grew 8% while headcount grew 40%; diminishing returns indicate process failure",
      },
      {
        riskType: "management_stretched",
        severity: "high",
        description: "No clear management structure; insufficient supervision and coaching",
      },
      {
        riskType: "lack_of_strategy",
        severity: "high",
        description: "No clear product roadmap or prioritization; teams working on unclear goals",
      },
      {
        riskType: "meeting_overhead_high",
        severity: "medium",
        description: "Too many meetings and coordination; context switching reducing delivery",
      },
    ],
    riskFlagDescription:
      "Critical risk is declining productivity. High risks are management stretched and lack of strategy. Medium risk is meeting overhead.",
    acceptableAnswerRange: {
      minCauseAccuracy: 0.67, // must identify at least 2 of 3 root causes
      minRecommendationQuality: 0.6, // must identify at least 3 of 5 recommendations
      maxFalsePositives: 2,
    },
    failureConditions: [
      {
        type: "missing_critical_risk",
        description: "Must identify productivity_declining risk",
        failsSlice: true,
      },
      {
        type: "missing_primary_cause",
        description: "Must identify that organizational scaling without process discipline is the issue",
        failsSlice: true,
      },
    ],
    createdAt: new Date("2026-06-15"),
    updatedAt: new Date("2026-06-15"),
  };
}

/**
 * SCENARIO 8: Founder Blind Spot
 * Founder is not aware of critical problem; team sees it but doesn't communicate
 */
function createFounderBlindSpotScenario(): SyntheticScenario {
  return {
    id: "scenario_founder_blind_spot_v1",
    type: "founder_blind_spot",
    title: "Founder Blind Spot: Sales Team Unhappy, Founder Unaware",
    description:
      "Founder believes sales team is high-performing and loyal. In reality, 60% of sales team is job-searching. " +
      "Commissions were cut; territory rules changed; management support was withdrawn. Sales team is not surfacing issues to founder.",
    version: 1,
    industryContext: "Enterprise Software",
    businessModel: "enterprise sales",
    businessSize: "medium",
    initialMetrics: {
      monthlyRevenue: 580000,
      costOfGoodsSold: 145000,
      operatingExpenses: 348000,
      cashOnHand: 290000,
      accountsReceivable: 290000, // 0.5 months
      inventory: 0,
      staffCount: 68,
      customerCount: 145,
      churnRate: 4.1,
      averageOrderValue: 4000,
      marketingSpend: 58000,
      marketingGeneratedRevenue: 232000,
      monthNumber: 9,
    },
    expectedRootCauses: [
      "Founder made sales comp and territory changes without sales team input; perceived as punishment",
      "No regular communication between founder and sales team (all-hands, listening tours); information asymmetry",
      "Sales manager is not escalating team morale issues; either lacks authority or doesn't want to challenge founder",
    ],
    causeDescription:
      "Root causes are: (1) poor change management; (2) lack of communication and feedback loops; (3) management layer not functioning as bridge.",
    expectedRecommendations: [
      "Conduct confidential sales team survey immediately; identify specific concerns (pay, territory, support, career)",
      "Founder should conduct 1-on-1s with each salesperson; listen without defending",
      "Revisit comp and territory changes with sales team input; explain reasoning or adjust if needed",
      "Hire VP Sales to establish regular communication cadence and represent sales team needs to founder",
      "Establish quarterly business reviews (QBRs) with clear metrics and accountability",
    ],
    recommendationDescription:
      "Recommendations prioritize diagnosis (survey, 1-on-1s), then structural fixes (VP Sales, QBRs), and finally ongoing communication norms.",
    expectedRiskFlags: [
      {
        riskType: "team_morale_critical",
        severity: "critical",
        description: "Sales team morale is very low; high risk of mass departure and revenue loss",
      },
      {
        riskType: "information_asymmetry",
        severity: "high",
        description: "Founder is unaware of team concerns; risk of poorly informed decisions",
      },
      {
        riskType: "management_gap",
        severity: "high",
        description: "Sales manager is not functioning as bridge between team and founder",
      },
      {
        riskType: "execution_risk",
        severity: "medium",
        description: "If team leaves, revenue target at risk",
      },
    ],
    riskFlagDescription:
      "Critical risk is team morale. High risks are information asymmetry and management gap. Medium risk is execution risk.",
    acceptableAnswerRange: {
      minCauseAccuracy: 0.67, // must identify at least 2 of 3 root causes
      minRecommendationQuality: 0.6, // must identify at least 3 of 5 recommendations
      maxFalsePositives: 2,
    },
    failureConditions: [
      {
        type: "missing_critical_risk",
        description: "Must identify team_morale_critical risk",
        failsSlice: true,
      },
      {
        type: "missing_primary_cause",
        description: "Must identify that poor communication and change management is the issue",
        failsSlice: true,
      },
    ],
    createdAt: new Date("2026-06-15"),
    updatedAt: new Date("2026-06-15"),
  };
}

/**
 * SCENARIO 9: Debt Overload
 * Company carries high debt burden; covenant risk
 */
function createDebtOverloadScenario(): SyntheticScenario {
  return {
    id: "scenario_debt_overload_v1",
    type: "debt_overload",
    title: "Debt Overload: $2.8M Debt on $1.2M Annual EBITDA",
    description:
      "Company borrowed $2.8M in 2024 for expansion. Lender covenant requires minimum 1.5x EBITDA. " +
      "Current EBITDA is $1.2M; covenant is at 2.33x leverage. Expansion did not produce expected revenue.",
    version: 1,
    industryContext: "Manufacturing / Distribution",
    businessModel: "direct sales",
    businessSize: "medium",
    initialMetrics: {
      monthlyRevenue: 650000,
      costOfGoodsSold: 325000,
      operatingExpenses: 195000,
      cashOnHand: 185000,
      accountsReceivable: 325000,
      inventory: 1625000,
      staffCount: 78,
      customerCount: 410,
      churnRate: 3.8,
      averageOrderValue: 1585,
      marketingSpend: 65000,
      marketingGeneratedRevenue: 325000,
      monthNumber: 11,
    },
    expectedRootCauses: [
      "Expansion was not properly integrated; new facility has not ramped to planned capacity utilization",
      "Sales team was not equipped to support expansion; revenue growth flat while costs grew",
      "Debt servicing is high; $240K per month goes to debt service (37% of EBITDA)",
    ],
    causeDescription:
      "Root causes are: (1) expansion execution failure; (2) sales team not scaled to support expansion; (3) debt burden too high for current EBITDA.",
    expectedRecommendations: [
      "Conduct break-even analysis on new facility; identify minimum revenue needed to justify costs",
      "Hire sales director and 2-3 additional sales staff to accelerate revenue at new facility",
      "Negotiate with lender: present plan to reach 1.5x leverage in 18 months; request covenant waiver if needed",
      "Conduct cost reduction analysis on expansion (overhead, inefficiency, underutilized assets)",
      "Defer non-essential capital spending; prioritize debt reduction",
    ],
    recommendationDescription:
      "Recommendations address operational improvement (facility utilization, sales hiring), lender management (covenant waiver negotiation), " +
      "and financial discipline (cost reduction, capex deferral).",
    expectedRiskFlags: [
      {
        riskType: "covenant_risk_critical",
        severity: "critical",
        description: "Current leverage is 2.33x; covenant requires <1.5x; risk of default if not improved",
      },
      {
        riskType: "expansion_underperforming",
        severity: "high",
        description: "New facility not generating planned revenue; capacity underutilized",
      },
      {
        riskType: "debt_burden_high",
        severity: "high",
        description: "Debt service is 37% of EBITDA; limits financial flexibility",
      },
      {
        riskType: "sales_not_scaled",
        severity: "high",
        description: "Sales team not equipped to support expansion revenue targets",
      },
    ],
    riskFlagDescription:
      "Critical risk is covenant violation. High risks are expansion underperformance, debt burden, and sales not scaled.",
    acceptableAnswerRange: {
      minCauseAccuracy: 0.67, // must identify at least 2 of 3 root causes
      minRecommendationQuality: 0.6, // must identify at least 3 of 5 recommendations
      maxFalsePositives: 2,
    },
    failureConditions: [
      {
        type: "missing_critical_risk",
        description: "Must identify covenant_risk_critical",
        failsSlice: true,
      },
      {
        type: "missing_primary_cause",
        description: "Must identify that expansion execution failed",
        failsSlice: true,
      },
    ],
    createdAt: new Date("2026-06-15"),
    updatedAt: new Date("2026-06-15"),
  };
}

/**
 * SCENARIO 10: Seasonal Business
 * Business has strong seasonality; off-season creates cash crisis
 */
function createSeasonalBusinessScenario(): SyntheticScenario {
  return {
    id: "scenario_seasonal_business_v1",
    type: "seasonal_business",
    title: "Seasonal Business: Peak Season Hides Off-Season Problem",
    description:
      "Ski rental business generates 70% of annual revenue in winter (Dec-Mar). " +
      "Summer (Jun-Aug) is very slow. Company struggles in summer despite strong winter revenue. " +
      "No strategy to diversify revenue or smooth cash flow.",
    version: 1,
    industryContext: "Seasonal Retail (Ski Rentals)",
    businessModel: "rental + lessons",
    businessSize: "small",
    initialMetrics: {
      monthlyRevenue: 185000, // Current month is May (shoulder season)
      costOfGoodsSold: 46250,
      operatingExpenses: 111000,
      cashOnHand: 340000, // Built up from good winter
      accountsReceivable: 0,
      inventory: 920000, // Ski equipment and gear
      staffCount: 35,
      customerCount: 1250, // Seasonal; low in summer
      churnRate: 0, // N/A for seasonal
      averageOrderValue: 148,
      marketingSpend: 18500,
      marketingGeneratedRevenue: 92500,
      monthNumber: 5,
    },
    expectedRootCauses: [
      "Business model is fully seasonal; no off-season revenue diversification",
      "No complementary services or products for off-season (e.g., dry-land training, equipment maintenance services)",
      "Staff are seasonal contractors; cannot sustain year-round team",
    ],
    causeDescription:
      "Root cause is the fundamental business model: fully seasonal with no diversification strategy.",
    expectedRecommendations: [
      "Develop summer/off-season revenue: mountain biking rentals, hiking guides, adventure tourism, camps",
      "Consider secondary location in opposite hemisphere or season (e.g., summer mountain biking location)",
      "Establish core year-round staff with benefits; hire seasonal contractors as needed",
      "Create subscription/membership model for locals (off-season discounts); build repeatable base",
      "Explore equipment rental to other resorts or retailers (wholesale) to smooth revenue",
    ],
    recommendationDescription:
      "Recommendations address revenue diversification (off-season products), geographic expansion (opposite season), staffing strategy, and business model evolution (subscriptions).",
    expectedRiskFlags: [
      {
        riskType: "revenue_seasonality_extreme",
        severity: "high",
        description: "70% of revenue concentrated in 4 months; 6-month off-season creates cash flow challenge",
      },
      {
        riskType: "business_model_risk",
        severity: "high",
        description: "Single-season business model is fragile; vulnerable to weather, economic cycles",
      },
      {
        riskType: "staffing_unstable",
        severity: "medium",
        description: "Seasonal contractors create training burden and knowledge loss annually",
      },
      {
        riskType: "capacity_underutilized",
        severity: "medium",
        description: "Equipment and staff are idle 6 months per year; low asset utilization",
      },
    ],
    riskFlagDescription:
      "High risks are revenue seasonality and business model fragility. Medium risks are staffing instability and underutilized capacity.",
    acceptableAnswerRange: {
      minCauseAccuracy: 1.0, // Must identify the single root cause (seasonal model)
      minRecommendationQuality: 0.4, // Lower threshold; this is a strategic challenge
      maxFalsePositives: 3, // More tolerance for strategic options
    },
    failureConditions: [
      {
        type: "missing_primary_cause",
        description: "Must identify that seasonal business model is the root cause",
        failsSlice: true,
      },
    ],
    createdAt: new Date("2026-06-15"),
    updatedAt: new Date("2026-06-15"),
  };
}

/**
 * SCENARIO 11: Customer Concentration
 * Business depends on too few customers
 */
function createCustomerConcentrationScenario(): SyntheticScenario {
  return {
    id: "scenario_customer_concentration_v1",
    type: "customer_concentration",
    title: "Customer Concentration: Top 3 Customers = 65% Revenue",
    description:
      "B2B software company has 45 total customers, but top 3 generate 65% of revenue. " +
      "Any one customer loss is existential risk. Largest customer is not happy; using leverage to negotiate price.",
    version: 1,
    industryContext: "Enterprise Software",
    businessModel: "annual licenses",
    businessSize: "small",
    initialMetrics: {
      monthlyRevenue: 420000,
      costOfGoodsSold: 84000,
      operatingExpenses: 252000,
      cashOnHand: 210000,
      accountsReceivable: 840000, // 2 months outstanding
      inventory: 0,
      staffCount: 32,
      customerCount: 45,
      churnRate: 0, // N/A; annual contracts
      averageOrderValue: 9333,
      marketingSpend: 42000,
      marketingGeneratedRevenue: 126000,
      monthNumber: 7,
    },
    expectedRootCauses: [
      "Sales strategy focused on landing big deals; neglected small/medium customer acquisition",
      "Product is complex and not self-service; requires high-touch implementation (costly, not scalable)",
      "Customer success is weak; only large customers get sufficient support and advocacy",
    ],
    causeDescription:
      "Root causes are: (1) sales strategy optimized for big deals, not breadth; (2) product requires high-touch implementation; (3) customer success skewed to large accounts.",
    expectedRecommendations: [
      "Develop product simplification and self-service motion; reduce implementation cost",
      "Establish small/medium business (SMB) go-to-market with partner channel or inside sales",
      "Implement customer success program for all customers (not just large ones); establish NPS tracking",
      "Conduct customer satisfaction audit with top 3 customers; develop retention plan for each",
      "Set customer concentration target (e.g., top 3 < 50% of revenue); measure quarterly",
    ],
    recommendationDescription:
      "Recommendations address product/go-to-market strategy (simplification, SMB motion), customer success (universal program), and risk management (concentration target).",
    expectedRiskFlags: [
      {
        riskType: "customer_concentration_critical",
        severity: "critical",
        description: "Top 3 customers = 65% of revenue; loss of any one is existential",
      },
      {
        riskType: "largest_customer_at_risk",
        severity: "high",
        description: "Largest customer is negotiating aggressively on price; retention at risk",
      },
      {
        riskType: "customer_success_absent",
        severity: "high",
        description: "Customer success is weak; only large customers receive proactive support",
      },
      {
        riskType: "breadth_strategy_missing",
        severity: "medium",
        description: "Sales strategy has not attempted to build customer breadth; all deals are enterprise",
      },
    ],
    riskFlagDescription:
      "Critical risk is customer concentration. High risks are largest customer at risk and customer success absence. Medium risk is lack of breadth strategy.",
    acceptableAnswerRange: {
      minCauseAccuracy: 0.67, // must identify at least 2 of 3 root causes
      minRecommendationQuality: 0.6, // must identify at least 3 of 5 recommendations
      maxFalsePositives: 2,
    },
    failureConditions: [
      {
        type: "missing_critical_risk",
        description: "Must identify customer_concentration_critical",
        failsSlice: true,
      },
      {
        type: "missing_primary_cause",
        description: "Must identify that sales strategy focused on big deals caused concentration",
        failsSlice: true,
      },
    ],
    createdAt: new Date("2026-06-15"),
    updatedAt: new Date("2026-06-15"),
  };
}

/**
 * SCENARIO 12: Fast Growth, Negative Cash
 * Revenue is growing but cash flow is negative
 */
function createFastGrowthNegativeCashScenario(): SyntheticScenario {
  return {
    id: "scenario_fast_growth_negative_cash_v1",
    type: "fast_growth_negative_cash",
    title: "Fast Growth, Negative Cash: Revenue +50% YoY, Burning $300K/Month",
    description:
      "SaaS company is growing rapidly (50% YoY) but cash burn is accelerating. " +
      "Cash runway is 8 months. Company has not yet raised Series B. Sales/marketing spending is driving growth but is not yet profitable.",
    version: 1,
    industryContext: "SaaS (B2B)",
    businessModel: "subscription",
    businessSize: "medium",
    initialMetrics: {
      monthlyRevenue: 540000,
      costOfGoodsSold: 108000,
      operatingExpenses: 840000, // Heavy S&M and R&D
      cashOnHand: 2400000, // Series A funding
      accountsReceivable: 270000,
      inventory: 0,
      staffCount: 125,
      customerCount: 890,
      churnRate: 2.8,
      averageOrderValue: 607,
      marketingSpend: 350000,
      marketingGeneratedRevenue: 270000,
      monthNumber: 6,
    },
    expectedRootCauses: [
      "Company is unprofitable; selling at a loss (CAC > LTV when considering operating expenses)",
      "Sales/marketing spending is driving top-line growth but unit economics are poor (burning $300K per month)",
      "Engineering and R&D spending is not contained; headcount growing faster than revenue",
    ],
    causeDescription:
      "Root causes are: (1) poor unit economics; (2) marketing efficiency declining; (3) cost structure growing faster than revenue.",
    expectedRecommendations: [
      "Conduct unit economics analysis (CAC, LTV, payback period); identify break-even point",
      "Implement SaaS metrics dashboard (MRR, ARR, churn, NRR, CAC, LTV); track monthly",
      "Slow hiring in non-revenue-generating functions; prioritize sales, customer success, and critical engineering",
      "Establish path to Series B: articulate the $X unit economics, $Y revenue/timeline, $Z run-rate plan to profitability",
      "If Series B not achievable in 6 months, switch to profitability focus (cut burn 50%, raise from existing investors)",
    ],
    recommendationDescription:
      "Recommendations address unit economics (analysis, metrics dashboard), cost discipline (hiring discipline), and strategic planning (Series B narrative or pivot to profitability).",
    expectedRiskFlags: [
      {
        riskType: "cash_runway_limited",
        severity: "critical",
        description: "8 months of cash runway; Series B must be closed or company must pivot to profitability",
      },
      {
        riskType: "unit_economics_poor",
        severity: "critical",
        description: "CAC and burn rate indicate unprofitable growth; not sustainable",
      },
      {
        riskType: "marketing_efficiency_declining",
        severity: "high",
        description: "CAC is increasing; marketing spend is not generating proportional new customers",
      },
      {
        riskType: "cost_growth_outpacing_revenue",
        severity: "high",
        description: "Spending grew 40% YoY while revenue grew 50%; burn is accelerating",
      },
    ],
    riskFlagDescription:
      "Critical risks are cash runway and poor unit economics. High risks are declining marketing efficiency and cost growth outpacing revenue.",
    acceptableAnswerRange: {
      minCauseAccuracy: 0.67, // must identify at least 2 of 3 root causes
      minRecommendationQuality: 0.6, // must identify at least 3 of 5 recommendations
      maxFalsePositives: 2,
    },
    failureConditions: [
      {
        type: "missing_critical_risk",
        description: "Must identify at least one critical risk (cash_runway_limited or unit_economics_poor)",
        failsSlice: true,
      },
      {
        type: "missing_primary_cause",
        description: "Must identify that unprofitable growth is the core issue",
        failsSlice: true,
      },
    ],
    createdAt: new Date("2026-06-15"),
    updatedAt: new Date("2026-06-15"),
  };
}

/**
 * Create all 12 predefined scenarios
 */
export function createAllScenarios(): SyntheticScenario[] {
  const scenarios: SyntheticScenario[] = [
    createCashCrisisScenario(),
    createHighRevenueHighCostScenario(),
    createLowRevenueHighProfitScenario(),
    createBadMarketingROIScenario(),
    createHighChurnScenario(),
    createInventoryOverstockScenario(),
    createStaffProductivityScenario(),
    createFounderBlindSpotScenario(),
    createDebtOverloadScenario(),
    createSeasonalBusinessScenario(),
    createCustomerConcentrationScenario(),
    createFastGrowthNegativeCashScenario(),
  ];

  // Validate all scenarios
  for (const scenario of scenarios) {
    const validation = validateSyntheticScenario(scenario);
    if (!validation.valid) {
      throw new Error(`Scenario ${scenario.id} is invalid: ${validation.errors.join("; ")}`);
    }
  }

  return scenarios;
}

/**
 * Get a scenario by ID
 */
export function getScenarioById(scenarioId: string): SyntheticScenario | null {
  const scenarios = createAllScenarios();
  return scenarios.find((s) => s.id === scenarioId) || null;
}

/**
 * Get a scenario by type
 */
export function getScenarioByType(type: ScenarioType): SyntheticScenario | null {
  const scenarios = createAllScenarios();
  return scenarios.find((s) => s.type === type) || null;
}

/**
 * Execute a scenario: evaluate diagnosis result against expected outcomes
 */
export function executeScenario(
  scenario: SyntheticScenario,
  identifiedCauses: string[],
  identifiedRecommendations: string[],
  identifiedRisks: RiskFlag[],
  confidenceScores: { cause: string; confidence: number }[]
): ScenarioRunResult {
  const runId = `run_${scenario.id}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const startTime = Date.now();

  // Calculate cause accuracy
  const expectedCausesSet = new Set(scenario.expectedRootCauses);
  const identifiedCausesSet = new Set(identifiedCauses);
  const matchingCauses = Array.from(identifiedCausesSet).filter((c) => expectedCausesSet.has(c));
  const causeAccuracy = expectedCausesSet.size > 0 ? matchingCauses.length / expectedCausesSet.size : 0;

  // Calculate recommendation quality
  const expectedRecsSet = new Set(scenario.expectedRecommendations);
  const identifiedRecsSet = new Set(identifiedRecommendations);
  const matchingRecs = Array.from(identifiedRecsSet).filter((r) => expectedRecsSet.has(r));
  const recommendationQuality = expectedRecsSet.size > 0 ? matchingRecs.length / expectedRecsSet.size : 0;

  // Calculate false positives
  const wrongCauses = identifiedCauses.filter((c) => !expectedCausesSet.has(c)).length;
  const wrongRecs = identifiedRecommendations.filter((r) => !expectedRecsSet.has(r)).length;
  const falsePositives = wrongCauses + wrongRecs;

  // Calculate false negatives
  const falseNegatives = expectedCausesSet.size - matchingCauses.length;

  const result: ScenarioRunResult = {
    scenarioId: scenario.id,
    runId,
    identifiedCauses,
    identifiedRecommendations,
    identifiedRisks,
    confidenceScores,
    causeAccuracy,
    recommendationQuality,
    falsePositives,
    falseNegatives,
    passed: false, // Will be determined after failure condition check
    failureReasons: [],
    evidence: [],
    ranAt: new Date(),
    executionTimeMs: Date.now() - startTime,
  };

  // Check failure conditions
  const failureCheck = checkFailureConditions(scenario, result);
  if (failureCheck.hasFatal) {
    result.passed = false;
    result.failureReasons = failureCheck.failedConditions.map((c) => c.description);
    result.evidence.push(
      `Cause accuracy: ${(causeAccuracy * 100).toFixed(1)}% (expected: ${(scenario.acceptableAnswerRange.minCauseAccuracy * 100).toFixed(0)}%)`
    );
    result.evidence.push(
      `Recommendation quality: ${(recommendationQuality * 100).toFixed(1)}% (expected: ${(scenario.acceptableAnswerRange.minRecommendationQuality * 100).toFixed(0)}%)`
    );
    result.evidence.push(`False positives: ${falsePositives} (max: ${scenario.acceptableAnswerRange.maxFalsePositives})`);
  } else {
    result.passed = true;
    result.evidence.push(
      `Cause accuracy: ${(causeAccuracy * 100).toFixed(1)}% (expected: ${(scenario.acceptableAnswerRange.minCauseAccuracy * 100).toFixed(0)}%)`
    );
    result.evidence.push(
      `Recommendation quality: ${(recommendationQuality * 100).toFixed(1)}% (expected: ${(scenario.acceptableAnswerRange.minRecommendationQuality * 100).toFixed(0)}%)`
    );
    result.evidence.push(`False positives: ${falsePositives} (max: ${scenario.acceptableAnswerRange.maxFalsePositives})`);
    if (failureCheck.nonFatalViolations.length > 0) {
      result.evidence.push(
        `Non-fatal violations: ${failureCheck.nonFatalViolations.map((c) => c.type).join(", ")}`
      );
    }
  }

  return result;
}

/**
 * Score all 12 scenarios and generate a summary
 */
export function scoreAllScenarios(
  results: ScenarioRunResult[]
): {
  totalScenarios: number;
  passedCount: number;
  failedCount: number;
  averageScore: number;
  scoresByScenario: {
    scenarioId: string;
    score: number;
    passed: boolean;
  }[];
} {
  const scenarios = createAllScenarios();
  const scoresByScenario: {
    scenarioId: string;
    score: number;
    passed: boolean;
  }[] = [];

  let totalScore = 0;
  let passedCount = 0;

  for (const result of results) {
    const scenario = scenarios.find((s) => s.id === result.scenarioId);
    if (!scenario) continue;

    const score = scoreScenarioResult(scenario, result);
    scoresByScenario.push({
      scenarioId: result.scenarioId,
      score,
      passed: result.passed,
    });

    totalScore += score;
    if (result.passed) {
      passedCount += 1;
    }
  }

  return {
    totalScenarios: scoresByScenario.length,
    passedCount,
    failedCount: scoresByScenario.length - passedCount,
    averageScore: scoresByScenario.length > 0 ? totalScore / scoresByScenario.length : 0,
    scoresByScenario,
  };
}
