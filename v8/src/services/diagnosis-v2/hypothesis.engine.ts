import type { DerivedMetricV2, DomainScoreV2, HypothesisV2, ValidationIssueV2 } from "@/domain/diagnosis-v2/types";
import { metricValue } from "./metrics.engine";
import { clamp01, round } from "./utils";

function evidenceFor(label: string, key?: string) {
  return { type: "metric" as const, key, label };
}

function buildHypothesis(input: Omit<HypothesisV2, "rank">): HypothesisV2 {
  return { ...input, rank: 999, confidence: clamp01(input.confidence) };
}

export function generateHypotheses(metrics: DerivedMetricV2[], scores: DomainScoreV2[], issues: ValidationIssueV2[]): HypothesisV2[] {
  const hypotheses: HypothesisV2[] = [];
  const crr = metricValue(metrics, "cost_to_revenue_ratio") ?? 0;
  const margin = metricValue(metrics, "operating_margin") ?? 0;
  const rpc = metricValue(metrics, "revenue_per_customer") ?? 0;
  const runwayAfter = metricValue(metrics, "cash_runway_months_after_revenue") ?? 999;
  const runwayBefore = metricValue(metrics, "cash_runway_months_before_revenue") ?? 999;
  const payables = metricValue(metrics, "payables_to_cash_ratio") ?? 0;
  const complaintRate = metricValue(metrics, "complaints_per_100_customers") ?? 0;
  const repeatPct = metricValue(metrics, "repeat_customer_pct");
  const conversionPct = metricValue(metrics, "conversion_rate_pct");
  const scoreByDomain = new Map(scores.map((score) => [score.domainKey, score]));
  const dataIntegrityIssueCount = issues.filter((issue) => ["anomaly", "contradiction", "ambiguous_definition"].includes(issue.issueType)).length;

  if (crr > 1 || margin < 0) {
    hypotheses.push(buildHypothesis({
      hypothesisKey: "profit_model_broken",
      title: "Cost base exceeds current revenue capacity",
      description: "The business appears structurally unprofitable at the current revenue, price, cost, and service-mix levels. Cost cutting alone is not enough unless the margin model is verified.",
      confidence: round(0.56 + Math.min(0.3, Math.max(crr - 1, Math.abs(Math.min(margin, 0))) / 2), 2),
      evidenceFor: [evidenceFor("Cost-to-revenue ratio or margin indicates negative spread", "cost_to_revenue_ratio")],
      evidenceAgainst: [],
    }));
  }

  if (runwayAfter < 2 || runwayBefore < 1.5 || payables > 1) {
    hypotheses.push(buildHypothesis({
      hypothesisKey: "acute_liquidity_pressure",
      title: "Immediate liquidity pressure outranks growth activity",
      description: "Cash runway and overdue-payable burden indicate survival risk; short-cycle cash control and supplier handling should outrank slow strategic initiatives.",
      confidence: round(0.58 + (runwayAfter < 1 ? 0.18 : 0.08) + (payables > 1 ? 0.12 : 0), 2),
      evidenceFor: [evidenceFor("Cash runway/payables pressure", "cash_runway_months_after_revenue")],
      evidenceAgainst: [],
    }));
  }

  if (rpc > 2500 || dataIntegrityIssueCount > 0) {
    hypotheses.push(buildHypothesis({
      hypothesisKey: "data_or_customer_definition_risk",
      title: "Customer/revenue definition may be wrong or dangerously concentrated",
      description: "Revenue per customer or validation anomalies mean the system must separate unique customers, orders, enterprise accounts, and data-entry errors before prescribing broad interventions.",
      confidence: round(0.62 + Math.min(0.2, dataIntegrityIssueCount * 0.06) + (rpc > 2500 ? 0.08 : 0), 2),
      evidenceFor: [{ type: "validation_issue", label: "Revenue/customer anomaly or contradictory input" }],
      evidenceAgainst: [],
    }));
  }

  if ((conversionPct !== undefined && conversionPct < 10) || (repeatPct !== undefined && repeatPct < 20) || complaintRate > 4) {
    hypotheses.push(buildHypothesis({
      hypothesisKey: "demand_or_retention_leak",
      title: "Demand capture or retention leak is contributing to weak economics",
      description: "Low conversion, low repeat share, or elevated complaints suggest that revenue weakness may be driven by customer acquisition or retention leakage, not only internal cost structure.",
      confidence: round(0.55 + (conversionPct !== undefined && conversionPct < 10 ? 0.12 : 0) + (repeatPct !== undefined && repeatPct < 20 ? 0.1 : 0) + (complaintRate > 4 ? 0.08 : 0), 2),
      evidenceFor: [evidenceFor("Demand or retention metrics indicate leakage", "conversion_rate_pct")],
      evidenceAgainst: [],
    }));
  }

  if ((scoreByDomain.get("controls_reporting")?.score ?? 100) < 55 || issues.some((issue) => issue.blocksCompletion)) {
    hypotheses.push(buildHypothesis({
      hypothesisKey: "insufficient_management_information",
      title: "Insufficient management information is limiting decision quality",
      description: "Missing, contradictory, or ambiguous data materially limits diagnostic certainty; high-impact recommendations should be blocked or approval-gated until core evidence is corrected.",
      confidence: 0.72,
      evidenceFor: [{ type: "validation_issue", label: "Blocking or high-severity validation issues" }],
      evidenceAgainst: [],
    }));
  }

  if (!hypotheses.length) {
    hypotheses.push(buildHypothesis({
      hypothesisKey: "bounded_stable_state",
      title: "No dominant crisis signal detected from available inputs",
      description: "Available evidence does not expose a dominant crisis signal, but this is not proof of health; it only means the current input set does not show severe stress.",
      confidence: 0.55,
      evidenceFor: [{ type: "metric", label: "No major V2 threshold breach detected" }],
      evidenceAgainst: issues.map((issue) => ({ type: "validation_issue" as const, label: issue.message })),
    }));
  }

  return hypotheses
    .sort((a, b) => b.confidence - a.confidence)
    .map((hypothesis, index) => ({ ...hypothesis, rank: index + 1 }));
}
