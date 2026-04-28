import type { DerivedMetricV2, DiagnosisDomainKey, NormalizedFact } from "@/domain/diagnosis-v2/types";

export interface VariableSnapshot {
  variableKey: string;
  domainKey: DiagnosisDomainKey;
  value: unknown;
  unit?: string;
  confidence: number;
  sourceKeys: string[];
  freshnessStatus: "current" | "unknown";
  threshold?: { amber?: number; red?: number; direction: "increase_bad" | "decrease_bad" | "outside_band_bad" };
}

const domainByMetric: Record<string, DiagnosisDomainKey> = {
  monthly_revenue: "revenue_quality",
  monthly_costs: "profitability",
  operating_profit: "profitability",
  operating_margin: "profitability",
  cost_to_revenue_ratio: "profitability",
  cash_on_hand: "liquidity",
  cash_runway_months_before_revenue: "liquidity",
  cash_runway_months_after_revenue: "liquidity",
  payables_to_cash_ratio: "liquidity",
  revenue_per_customer: "revenue_quality",
  average_order_value: "revenue_quality",
  orders_per_customer: "retention",
  repeat_customer_pct: "retention",
  conversion_rate_pct: "demand_generation",
  lead_count: "demand_generation",
  complaints_per_100_customers: "retention",
  revenue_per_staff: "people_capacity",
};

const thresholds: Record<string, VariableSnapshot["threshold"]> = {
  cost_to_revenue_ratio: { amber: 0.9, red: 1.1, direction: "increase_bad" },
  operating_margin: { amber: 0.05, red: 0, direction: "decrease_bad" },
  cash_runway_months_after_revenue: { amber: 3, red: 1, direction: "decrease_bad" },
  payables_to_cash_ratio: { amber: 0.75, red: 1.25, direction: "increase_bad" },
  revenue_per_customer: { amber: 2500, red: 5000, direction: "increase_bad" },
  complaints_per_100_customers: { amber: 4, red: 8, direction: "increase_bad" },
  conversion_rate_pct: { amber: 15, red: 8, direction: "decrease_bad" },
};

export function buildVariableSnapshots(input: { facts: NormalizedFact[]; metrics: DerivedMetricV2[] }): VariableSnapshot[] {
  const factVariables = input.facts.map<VariableSnapshot>((fact) => ({
    variableKey: `fact.${fact.key}`,
    domainKey: fact.key.startsWith("finance.") ? "profitability" : fact.key.startsWith("customers.") ? "revenue_quality" : fact.key.startsWith("sales.") ? "demand_generation" : "controls_reporting",
    value: fact.value,
    unit: fact.unit,
    confidence: fact.confidence,
    sourceKeys: fact.lineage,
    freshnessStatus: "unknown",
  }));

  const metricVariables = input.metrics.map<VariableSnapshot>((metric) => ({
    variableKey: `metric.${metric.metricKey}`,
    domainKey: domainByMetric[metric.metricKey] ?? "controls_reporting",
    value: metric.metricValue,
    unit: metric.unit,
    confidence: metric.confidence,
    sourceKeys: metric.lineage,
    freshnessStatus: "current",
    threshold: thresholds[metric.metricKey],
  }));

  return [...factVariables, ...metricVariables];
}
