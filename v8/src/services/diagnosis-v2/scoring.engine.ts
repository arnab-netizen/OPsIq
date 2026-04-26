import type { DerivedMetricV2, DiagnosisDomainKey, DomainScoreV2, ValidationIssueV2 } from "@/domain/diagnosis-v2/types";
import { metricValue } from "./metrics.engine";
import { clampScore, round } from "./utils";

function band(score: number): DomainScoreV2["band"] {
  if (score < 35) return "critical";
  if (score < 55) return "stressed";
  if (score < 75) return "fragile_recovery";
  if (score < 90) return "stable";
  return "growth_capable";
}

function driver(key: string, contribution: number, explanation: string) {
  return { key, contribution: Math.round(contribution), explanation };
}

function domain(domainKey: DiagnosisDomainKey, base: number, penalties: Array<{ key: string; value: number; explanation: string }>, confidence: number): DomainScoreV2 {
  const totalPenalty = penalties.reduce((sum, p) => sum + p.value, 0);
  const score = clampScore(base - totalPenalty);
  return {
    domainKey,
    score,
    band: band(score),
    rationale: {
      confidence: round(confidence, 2),
      topDrivers: penalties.length
        ? penalties.map((p) => driver(p.key, -p.value, p.explanation))
        : [driver("no_material_penalty", 0, "No material penalty detected from available evidence.")],
    },
  };
}

export function scoreDiagnosisDomains(metrics: DerivedMetricV2[], issues: ValidationIssueV2[]): DomainScoreV2[] {
  const crr = metricValue(metrics, "cost_to_revenue_ratio");
  const margin = metricValue(metrics, "operating_margin");
  const runwayBeforeRevenue = metricValue(metrics, "cash_runway_months_before_revenue");
  const runwayAfterRevenue = metricValue(metrics, "cash_runway_months_after_revenue");
  const payables = metricValue(metrics, "payables_to_cash_ratio");
  const revenuePerCustomer = metricValue(metrics, "revenue_per_customer");
  const repeatPct = metricValue(metrics, "repeat_customer_pct");
  const conversionPct = metricValue(metrics, "conversion_rate_pct");
  const complaintRate = metricValue(metrics, "complaints_per_100_customers");
  const revenuePerStaff = metricValue(metrics, "revenue_per_staff");

  const blockingPenalty = issues.filter((i) => i.blocksCompletion).length * 14;
  const dataPenalty = issues.filter((i) => ["anomaly", "contradiction", "ambiguous_definition"].includes(i.issueType)).length * 7;
  const highSeverityPenalty = issues.filter((i) => i.severity === "high" || i.severity === "critical").length * 5;

  return [
    domain("liquidity", 78, [
      { key: "cash_runway", value: runwayAfterRevenue !== undefined ? (runwayAfterRevenue < 1 ? 35 : runwayAfterRevenue < 2 ? 22 : runwayAfterRevenue < 4 ? 10 : 0) : runwayBeforeRevenue !== undefined && runwayBeforeRevenue < 1 ? 25 : 10, explanation: "Cash runway is the dominant short-term survivability signal." },
      { key: "payables_to_cash_ratio", value: payables !== undefined && payables > 2 ? 24 : payables !== undefined && payables > 1 ? 14 : 0, explanation: "Overdue payables relative to cash indicate liquidity pressure." },
      { key: "blocking_evidence", value: blockingPenalty, explanation: "Blocking evidence issues reduce confidence in liquidity actions." },
    ].filter((p) => p.value > 0), 0.76),
    domain("profitability", 80, [
      { key: "cost_to_revenue_ratio", value: crr !== undefined ? Math.max(0, (crr - 0.75) * 45) : 18, explanation: "Cost-to-revenue ratio drives profitability stress." },
      { key: "operating_margin", value: margin !== undefined && margin < 0 ? Math.min(28, Math.abs(margin) * 45) : 0, explanation: "Negative margin directly reduces profitability health." },
    ].filter((p) => p.value > 0), 0.8),
    domain("revenue_quality", 74, [
      { key: "revenue_per_customer", value: revenuePerCustomer !== undefined && revenuePerCustomer > 2500 ? 22 : 0, explanation: "Very high revenue per customer may mean concentration or data-definition risk." },
      { key: "repeat_customer_pct", value: repeatPct !== undefined && repeatPct < 20 ? 14 : 0, explanation: "Weak repeat customer share increases demand fragility." },
      { key: "data_integrity", value: dataPenalty, explanation: "Anomalies and contradictions lower revenue-quality trust." },
    ].filter((p) => p.value > 0), 0.68),
    domain("demand_generation", 72, [
      { key: "conversion_rate", value: conversionPct !== undefined && conversionPct < 10 ? 18 : 0, explanation: "Low conversion suggests weak demand capture." },
      { key: "lead_signal_missing", value: conversionPct === undefined ? 8 : 0, explanation: "Missing demand-side metrics limits growth recommendations." },
    ].filter((p) => p.value > 0), 0.62),
    domain("retention", 72, [
      { key: "complaints", value: complaintRate !== undefined && complaintRate > 8 ? 18 : complaintRate !== undefined && complaintRate > 4 ? 9 : 0, explanation: "Complaint rate is a retention and service-quality early warning signal." },
      { key: "repeat_customer_pct", value: repeatPct !== undefined && repeatPct < 20 ? 12 : 0, explanation: "Low repeat share can indicate retention weakness." },
    ].filter((p) => p.value > 0), 0.58),
    domain("operations", 73, [
      { key: "cost_intensity", value: crr !== undefined && crr > 1.2 ? 18 : crr !== undefined && crr > 1 ? 10 : 0, explanation: "High cost intensity can reflect operational inefficiency or overcapacity." },
      { key: "revenue_per_staff", value: revenuePerStaff !== undefined && revenuePerStaff < 1000 ? 10 : 0, explanation: "Low revenue per staff may indicate capacity or productivity pressure." },
      { key: "data_anomalies", value: dataPenalty, explanation: "Operational diagnosis is weakened by input anomalies." },
    ].filter((p) => p.value > 0), 0.64),
    domain("people_capacity", 70, [
      { key: "people_metric_missing", value: revenuePerStaff === undefined ? 8 : 0, explanation: "Staffing data is missing, so capacity recommendations must remain bounded." },
      { key: "high_severity_issues", value: highSeverityPenalty, explanation: "High-severity validation issues reduce safe people-capacity conclusions." },
    ].filter((p) => p.value > 0), 0.52),
    domain("controls_reporting", 78, [
      { key: "blocking_issues", value: blockingPenalty, explanation: "Blocking evidence issues reduce controls/reporting score." },
      { key: "data_integrity", value: dataPenalty, explanation: "Anomalies, contradictions, and ambiguous definitions reduce reporting trust." },
      { key: "high_severity_issues", value: highSeverityPenalty, explanation: "High-severity validation issues indicate governance weakness." },
    ].filter((p) => p.value > 0), 0.74),
    domain("strategy_resilience", 70, [
      { key: "profit_liquidity_combination", value: (crr !== undefined && crr > 1 ? 12 : 0) + (runwayAfterRevenue !== undefined && runwayAfterRevenue < 2 ? 14 : 0), explanation: "Strategy resilience weakens when profitability and runway are both stressed." },
      { key: "evidence_gap", value: blockingPenalty / 2, explanation: "Missing evidence limits strategic confidence." },
    ].filter((p) => p.value > 0), 0.6),
  ];
}
