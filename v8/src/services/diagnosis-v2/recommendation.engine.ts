import type { HypothesisV2, Priority, RecommendationV2, ValidationIssueV2 } from "@/domain/diagnosis-v2/types";

function rec(input: RecommendationV2): RecommendationV2 {
  return input;
}

function priorityForEvidence(issues: ValidationIssueV2[], defaultPriority: Priority): Priority {
  if (issues.some((issue) => issue.blocksCompletion)) return "critical";
  if (issues.some((issue) => issue.severity === "high" || issue.severity === "critical")) return "high";
  return defaultPriority;
}

export function generateRecommendations(hypotheses: HypothesisV2[], issues: ValidationIssueV2[] = []): RecommendationV2[] {
  const keys = new Set(hypotheses.map((hypothesis) => hypothesis.hypothesisKey));
  const recommendations: RecommendationV2[] = [];

  if (keys.has("insufficient_management_information") || issues.some((issue) => issue.blocksCompletion)) {
    recommendations.push(rec({
      recommendationKey: "rec_controls_reconcile_core_inputs",
      title: "Reconcile core evidence before irreversible action",
      category: "controls_reporting",
      description: "Resolve blocking data issues, define customer/order/account units, and attach minimum evidence before trusting high-impact recommendations.",
      rationale: "A governed diagnosis must fail closed when core financial or customer inputs are contradictory, missing, or ambiguous.",
      priority: priorityForEvidence(issues, "high"),
      confidence: 0.84,
      expectedUpside: { primaryMetric: "diagnostic_confidence", target: "minimum evidence score >= 0.75" },
      downsideRisk: { delayRisk: "Short delay before action, but prevents wrong intervention." },
      preconditions: ["Resolve blocking validation issues", "Confirm period alignment", "Attach evidence labels for financial inputs"],
      linkedHypothesisKeys: ["insufficient_management_information", "data_or_customer_definition_risk"],
    }));
  }

  if (keys.has("acute_liquidity_pressure")) {
    recommendations.push(rec({
      recommendationKey: "rec_liquidity_13_week_cash_control",
      title: "Create a 13-week cash control plan before discretionary work",
      category: "liquidity_control",
      description: "Build a short-cycle cash forecast, freeze non-critical spending, sequence supplier payments, and define cash stop-loss triggers.",
      rationale: "When liquidity pressure exists, the first monetizable value is preventing avoidable failure while slower margin corrections take effect.",
      priority: "critical",
      confidence: 0.8,
      expectedUpside: { primaryMetric: "cash_runway_months_after_revenue", timeToImpactDays: 7, runwayProtection: true },
      downsideRisk: { supplierFriction: true, ownerAttentionLoad: "high" },
      preconditions: ["Confirm cash on hand", "Confirm overdue payables", "List critical suppliers", "Set minimum cash threshold"],
      linkedHypothesisKeys: ["acute_liquidity_pressure"],
    }));
  }

  if (keys.has("profit_model_broken")) {
    recommendations.push(rec({
      recommendationKey: "rec_pricing_service_mix_pilot",
      title: "Pilot a service-line margin reset before broad cost cutting",
      category: "pricing_margin",
      description: "Test pricing, packaging, minimum order value, or service-mix correction on one segment and monitor conversion, complaints, and margin for a defined period.",
      rationale: "Cost reduction without service-line economics can damage delivery. A bounded margin pilot tests the real constraint with reversible downside.",
      priority: "high",
      confidence: 0.76,
      expectedUpside: { primaryMetric: "operating_margin", marginLiftPct: 4, timeToImpactDays: 14 },
      downsideRisk: { customerPushback: true, conversionDropPossible: true },
      preconditions: ["Confirm margin by service line", "Select pilot segment", "Define customer communication", "Define rollback threshold"],
      linkedHypothesisKeys: ["profit_model_broken"],
    }));
  }

  if (keys.has("data_or_customer_definition_risk")) {
    recommendations.push(rec({
      recommendationKey: "rec_revenue_quality_unit_split",
      title: "Split revenue quality into unique customers, orders, and enterprise accounts",
      category: "revenue_quality",
      description: "Separate customer definitions and concentration before drawing conclusions from revenue per customer or customer-count metrics.",
      rationale: "High revenue per customer can be attractive enterprise revenue or a dangerous concentration/data-definition error. The intervention differs completely.",
      priority: "high",
      confidence: 0.82,
      expectedUpside: { primaryMetric: "revenue_definition_accuracy", diagnosticAccuracy: "higher" },
      downsideRisk: { noneMaterial: true },
      preconditions: ["Export order/customer list", "Define account vs order vs unique customer", "Identify top-five customer concentration"],
      linkedHypothesisKeys: ["data_or_customer_definition_risk"],
    }));
  }

  if (keys.has("demand_or_retention_leak")) {
    recommendations.push(rec({
      recommendationKey: "rec_demand_retention_leak_audit",
      title: "Audit the demand-to-repeat loop before adding spend",
      category: "demand_retention",
      description: "Map leads, conversion, first purchase, repeat purchase, complaint causes, and churn signals before increasing marketing or sales spend.",
      rationale: "Growth spend is wasteful when conversion or retention leakage is unresolved. Fixing the leak increases monetization from existing demand.",
      priority: "medium",
      confidence: 0.68,
      expectedUpside: { primaryMetric: "repeat_customer_pct", retentionLiftPct: 5, timeToImpactDays: 21 },
      downsideRisk: { analysisDelay: true },
      preconditions: ["Collect lead/conversion figures", "Classify complaints", "Define repeat-customer period"],
      linkedHypothesisKeys: ["demand_or_retention_leak"],
    }));
  }

  if (!recommendations.length) {
    recommendations.push(rec({
      recommendationKey: "rec_monitor_weekly_scorecard",
      title: "Maintain weekly scorecard and trigger-based recheck",
      category: "monitoring",
      description: "Track liquidity, profitability, demand, retention, operations, and controls weekly; trigger targeted re-diagnosis on threshold breach.",
      rationale: "No dominant crisis signal was detected, so the highest-value next step is preserving visibility and avoiding stale-data complacency.",
      priority: "medium",
      confidence: 0.58,
      expectedUpside: { primaryMetric: "data_freshness", timeToImpactDays: 7 },
      downsideRisk: { low: true },
      preconditions: ["Define weekly owner", "Set amber/red thresholds", "Capture next check-in date"],
      linkedHypothesisKeys: ["bounded_stable_state"],
    }));
  }

  return recommendations;
}
