import type { DerivedMetricV2, NormalizedFact } from "@/domain/diagnosis-v2/types";
import { getNumberFact } from "./intake-normalization.engine";
import { round, safeDivide } from "./utils";

function add(metrics: DerivedMetricV2[], metricKey: string, metricValue: number, unit: string | undefined, confidence: number, lineage: string[]): void {
  metrics.push({ metricKey, metricValue: round(metricValue, 4), unit, confidence: round(confidence, 2), lineage });
}

export function computeDiagnosisMetrics(facts: NormalizedFact[]): DerivedMetricV2[] {
  const metrics: DerivedMetricV2[] = [];
  const revenue = getNumberFact(facts, "finance.monthly_revenue");
  const costs = getNumberFact(facts, "finance.monthly_costs");
  const customers = getNumberFact(facts, "customers.count");
  const orders = getNumberFact(facts, "orders.count");
  const cash = getNumberFact(facts, "finance.cash_on_hand");
  const overdue = getNumberFact(facts, "finance.overdue_payables");
  const grossMarginPct = getNumberFact(facts, "finance.gross_margin_pct");
  const repeatCustomerPct = getNumberFact(facts, "customers.repeat_pct");
  const leadCount = getNumberFact(facts, "sales.lead_count");
  const conversionRatePct = getNumberFact(facts, "sales.conversion_rate_pct");
  const complaintCount = getNumberFact(facts, "customers.complaint_count");
  const staffCount = getNumberFact(facts, "people.staff_count");

  if (revenue !== undefined) add(metrics, "monthly_revenue", revenue, "money/month", 0.9, ["finance.monthly_revenue"]);
  if (costs !== undefined) add(metrics, "monthly_costs", costs, "money/month", 0.9, ["finance.monthly_costs"]);
  if (cash !== undefined) add(metrics, "cash_on_hand", cash, "money", 0.86, ["finance.cash_on_hand"]);
  if (overdue !== undefined) add(metrics, "overdue_payables", overdue, "money", 0.84, ["finance.overdue_payables"]);

  if (revenue !== undefined && costs !== undefined) {
    add(metrics, "operating_profit", revenue - costs, "money/month", 0.86, ["finance.monthly_revenue", "finance.monthly_costs"]);
    add(metrics, "operating_margin", safeDivide(revenue - costs, revenue, revenue === 0 ? -1 : 0), "ratio", 0.82, ["finance.monthly_revenue", "finance.monthly_costs"]);
    add(metrics, "cost_to_revenue_ratio", safeDivide(costs, Math.max(revenue, 1), costs > 0 ? 999 : 0), "ratio", 0.84, ["finance.monthly_revenue", "finance.monthly_costs"]);
    add(metrics, "monthly_cash_gap", Math.max(0, costs - revenue), "money/month", 0.82, ["finance.monthly_revenue", "finance.monthly_costs"]);
  }
  if (cash !== undefined && costs !== undefined) {
    add(metrics, "cash_runway_months_before_revenue", safeDivide(cash, Math.max(costs, 1), cash > 0 ? 999 : 0), "months", 0.78, ["finance.cash_on_hand", "finance.monthly_costs"]);
  }
  if (cash !== undefined && revenue !== undefined && costs !== undefined) {
    add(metrics, "cash_runway_months_after_revenue", safeDivide(cash, Math.max(costs - revenue, 1), costs <= revenue ? 999 : 0), "months", 0.78, ["finance.cash_on_hand", "finance.monthly_revenue", "finance.monthly_costs"]);
  }
  if (overdue !== undefined && cash !== undefined) add(metrics, "payables_to_cash_ratio", safeDivide(overdue, Math.max(cash, 1), overdue > 0 ? 999 : 0), "ratio", 0.76, ["finance.overdue_payables", "finance.cash_on_hand"]);
  if (revenue !== undefined && customers !== undefined) add(metrics, "revenue_per_customer", safeDivide(revenue, Math.max(customers, 1), 0), "money/customer/month", 0.8, ["finance.monthly_revenue", "customers.count"]);
  if (revenue !== undefined && orders !== undefined) add(metrics, "average_order_value", safeDivide(revenue, Math.max(orders, 1), 0), "money/order", 0.78, ["finance.monthly_revenue", "orders.count"]);
  if (orders !== undefined && customers !== undefined) add(metrics, "orders_per_customer", safeDivide(orders, Math.max(customers, 1), 0), "orders/customer", 0.74, ["orders.count", "customers.count"]);
  if (grossMarginPct !== undefined) add(metrics, "gross_margin_pct", grossMarginPct, "percent", 0.72, ["finance.gross_margin_pct"]);
  if (repeatCustomerPct !== undefined) add(metrics, "repeat_customer_pct", repeatCustomerPct, "percent", 0.72, ["customers.repeat_pct"]);
  if (leadCount !== undefined) add(metrics, "lead_count", leadCount, "leads/month", 0.72, ["sales.lead_count"]);
  if (conversionRatePct !== undefined) add(metrics, "conversion_rate_pct", conversionRatePct, "percent", 0.72, ["sales.conversion_rate_pct"]);
  if (complaintCount !== undefined && customers !== undefined) add(metrics, "complaints_per_100_customers", safeDivide(complaintCount * 100, Math.max(customers, 1), 0), "complaints/100customers", 0.7, ["customers.complaint_count", "customers.count"]);
  if (revenue !== undefined && staffCount !== undefined) add(metrics, "revenue_per_staff", safeDivide(revenue, Math.max(staffCount, 1), 0), "money/staff/month", 0.7, ["finance.monthly_revenue", "people.staff_count"]);

  return metrics;
}

export function metricValue(metrics: DerivedMetricV2[], key: string): number | undefined {
  return metrics.find((metric) => metric.metricKey === key)?.metricValue;
}
