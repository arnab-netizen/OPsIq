import { assertWorkspaceScopedQuery } from "./security-rules";

export type BusinessMetricName =
  | "revenue"
  | "gross_profit"
  | "net_profit"
  | "cash_balance"
  | "cash_runway_days"
  | "debt"
  | "emi_burden"
  | "receivables"
  | "payables"
  | "leads"
  | "conversion_rate"
  | "repeat_customer_rate"
  | "churn"
  | "average_order_value"
  | "customer_count"
  | "marketing_spend"
  | "cost_per_lead"
  | "cost_per_acquisition"
  | "inventory"
  | "staff_count"
  | "staff_productivity"
  | "capacity_utilization"
  | "complaints"
  | "refunds"
  | "rework_rate"
  | "delivery_delay_rate";

export type TrendDirection = "rising" | "falling" | "stable" | "insufficient_data";

export type TrendAlertType =
  | "revenue_up_profit_down"
  | "cash_falling_sales_rising"
  | "leads_up_conversion_down"
  | "new_customers_up_repeat_down"
  | "marketing_spend_up_cac_worsening"
  | "staff_up_productivity_down"
  | "complaints_up_before_churn"
  | "debt_growing_faster_than_cash";

// Whether a metric improvement means the value goes UP (true) or DOWN (false)
export const METRIC_HIGHER_IS_BETTER: Readonly<Record<BusinessMetricName, boolean>> = {
  revenue: true,
  gross_profit: true,
  net_profit: true,
  cash_balance: true,
  cash_runway_days: true,
  debt: false,
  emi_burden: false,
  receivables: true,
  payables: false,
  leads: true,
  conversion_rate: true,
  repeat_customer_rate: true,
  churn: false,
  average_order_value: true,
  customer_count: true,
  marketing_spend: false,
  cost_per_lead: false,
  cost_per_acquisition: false,
  inventory: true,
  staff_count: true,
  staff_productivity: true,
  capacity_utilization: true,
  complaints: false,
  refunds: false,
  rework_rate: false,
  delivery_delay_rate: false,
};

export interface MetricDataPoint {
  metricName: BusinessMetricName;
  value: number;
  periodLabel: string; // e.g. "2025-Q3", "2025-10"
  unit?: string; // "USD", "pct", "count", etc.
}

export interface BusinessStateSnapshotInput {
  workspaceId: string;
  businessId: string;
  periodLabel: string;
  metrics: MetricDataPoint[];
  snapshotNotes?: string;
}

export interface MetricComparison {
  metricName: BusinessMetricName;
  currentValue: number;
  previousValue: number;
  absoluteChange: number;
  percentageChange: number;
  direction: TrendDirection;
  isImprovement: boolean;
}

export interface TrendAlert {
  alertType: TrendAlertType;
  description: string;
  severity: "warning" | "critical";
}

export interface BusinessStateSnapshotResult {
  valid: boolean;
  violations: string[];
  periodLabel: string;
  metricsRecorded: number;
  metricNames: BusinessMetricName[];
}

export interface BusinessTrendAnalysisInput {
  workspaceId: string;
  businessId: string;
  currentPeriod: MetricDataPoint[];
  previousPeriod: MetricDataPoint[];
  threeMonthAverages?: Partial<Record<BusinessMetricName, number>>;
}

export interface BusinessTrendAnalysisResult {
  valid: boolean;
  violations: string[];
  comparisons: MetricComparison[];
  trendAlerts: TrendAlert[];
  improvingMetrics: BusinessMetricName[];
  worseningMetrics: BusinessMetricName[];
}

const MIN_METRICS_COUNT = 1;

// BSTL-RULE-1: periodLabel must be provided
// BSTL-RULE-2: at least one metric required
// BSTL-RULE-3: metric values must be finite numbers
// BSTL-RULE-4: trend analysis requires at least 2 matching metrics

export function validateBusinessStateSnapshot(
  input: BusinessStateSnapshotInput
): BusinessStateSnapshotResult {
  assertWorkspaceScopedQuery({ workspaceId: input.workspaceId });

  const violations: string[] = [];

  // BSTL-RULE-1
  if (!input.periodLabel || input.periodLabel.trim().length === 0) {
    violations.push("periodLabel is required (BSTL-RULE-1)");
  }

  // BSTL-RULE-2
  if (!input.metrics || input.metrics.length < MIN_METRICS_COUNT) {
    violations.push(`At least ${MIN_METRICS_COUNT} metric required (BSTL-RULE-2)`);
  }

  // BSTL-RULE-3
  for (const m of input.metrics ?? []) {
    if (!isFinite(m.value)) {
      violations.push(
        `Metric ${m.metricName} has non-finite value ${m.value} (BSTL-RULE-3)`
      );
    }
  }

  return {
    valid: violations.length === 0,
    violations,
    periodLabel: input.periodLabel,
    metricsRecorded: input.metrics?.length ?? 0,
    metricNames: (input.metrics ?? []).map((m) => m.metricName),
  };
}

function computeDirection(pctChange: number): TrendDirection {
  if (Math.abs(pctChange) < 0.001) return "stable";
  return pctChange > 0 ? "rising" : "falling";
}

function detectTrendAlerts(
  current: Map<BusinessMetricName, number>,
  previous: Map<BusinessMetricName, number>
): TrendAlert[] {
  const alerts: TrendAlert[] = [];

  const get = (m: BusinessMetricName, map: Map<BusinessMetricName, number>) => map.get(m);

  const changed = (a: number | undefined, b: number | undefined) =>
    a !== undefined && b !== undefined;

  const isRising = (metric: BusinessMetricName) => {
    const c = get(metric, current);
    const p = get(metric, previous);
    return changed(c, p) && c! > p!;
  };

  const isFalling = (metric: BusinessMetricName) => {
    const c = get(metric, current);
    const p = get(metric, previous);
    return changed(c, p) && c! < p!;
  };

  // revenue rising but profit falling
  if (isRising("revenue") && isFalling("gross_profit")) {
    alerts.push({
      alertType: "revenue_up_profit_down",
      description: "Revenue is rising but gross profit is falling — margin compression detected.",
      severity: "critical",
    });
  }

  // cash falling despite sales rising
  if (isFalling("cash_balance") && isRising("revenue")) {
    alerts.push({
      alertType: "cash_falling_sales_rising",
      description: "Cash balance falling despite rising revenue — check collections and expenses.",
      severity: "critical",
    });
  }

  // leads rising but conversion falling
  if (isRising("leads") && isFalling("conversion_rate")) {
    alerts.push({
      alertType: "leads_up_conversion_down",
      description: "Leads increasing but conversion rate falling — lead quality may have deteriorated.",
      severity: "warning",
    });
  }

  // new customers rising but repeat rate falling
  if (isRising("customer_count") && isFalling("repeat_customer_rate")) {
    alerts.push({
      alertType: "new_customers_up_repeat_down",
      description:
        "New customers rising but repeat rate falling — retention issue emerging.",
      severity: "warning",
    });
  }

  // marketing spend rising but CAC worsening
  if (isRising("marketing_spend") && isRising("cost_per_acquisition")) {
    alerts.push({
      alertType: "marketing_spend_up_cac_worsening",
      description: "Marketing spend increasing but cost per acquisition is also rising.",
      severity: "warning",
    });
  }

  // staff count rising but productivity falling
  if (isRising("staff_count") && isFalling("staff_productivity")) {
    alerts.push({
      alertType: "staff_up_productivity_down",
      description: "Staff count rising but productivity per head is falling.",
      severity: "warning",
    });
  }

  // complaints rising (early churn signal)
  if (isRising("complaints")) {
    alerts.push({
      alertType: "complaints_up_before_churn",
      description: "Complaints rising — early indicator of potential churn increase.",
      severity: "warning",
    });
  }

  // debt burden increasing faster than cash generation
  const debtCurr = get("debt", current);
  const debtPrev = get("debt", previous);
  const cashCurr = get("cash_balance", current);
  const cashPrev = get("cash_balance", previous);
  if (
    debtCurr !== undefined &&
    debtPrev !== undefined &&
    cashCurr !== undefined &&
    cashPrev !== undefined
  ) {
    const debtGrowth = debtCurr - debtPrev;
    const cashGrowth = cashCurr - cashPrev;
    if (debtGrowth > 0 && cashGrowth < debtGrowth) {
      alerts.push({
        alertType: "debt_growing_faster_than_cash",
        description: "Debt is growing faster than cash generation — solvency risk increasing.",
        severity: "critical",
      });
    }
  }

  return alerts;
}

export function analyzeBusinessTrend(
  input: BusinessTrendAnalysisInput
): BusinessTrendAnalysisResult {
  assertWorkspaceScopedQuery({ workspaceId: input.workspaceId });

  const violations: string[] = [];

  if (!input.currentPeriod || input.currentPeriod.length === 0) {
    violations.push("currentPeriod must have at least one metric (BSTL-RULE-4)");
  }
  if (!input.previousPeriod || input.previousPeriod.length === 0) {
    violations.push("previousPeriod must have at least one metric (BSTL-RULE-4)");
  }

  if (violations.length > 0) {
    return { valid: false, violations, comparisons: [], trendAlerts: [], improvingMetrics: [], worseningMetrics: [] };
  }

  const currentMap = new Map<BusinessMetricName, number>(
    input.currentPeriod.map((m) => [m.metricName, m.value])
  );
  const previousMap = new Map<BusinessMetricName, number>(
    input.previousPeriod.map((m) => [m.metricName, m.value])
  );

  const comparisons: MetricComparison[] = [];
  const improvingMetrics: BusinessMetricName[] = [];
  const worseningMetrics: BusinessMetricName[] = [];

  for (const [metric, currentValue] of currentMap.entries()) {
    const previousValue = previousMap.get(metric);
    if (previousValue === undefined) continue;

    const absoluteChange = currentValue - previousValue;
    const percentageChange = previousValue !== 0 ? (absoluteChange / Math.abs(previousValue)) * 100 : 0;
    const direction = computeDirection(percentageChange);
    const higherIsBetter = METRIC_HIGHER_IS_BETTER[metric];
    const isImprovement =
      direction === "stable" ? false :
      (direction === "rising") === higherIsBetter;

    comparisons.push({ metricName: metric, currentValue, previousValue, absoluteChange, percentageChange, direction, isImprovement });

    if (direction !== "stable") {
      if (isImprovement) improvingMetrics.push(metric);
      else worseningMetrics.push(metric);
    }
  }

  const trendAlerts = detectTrendAlerts(currentMap, previousMap);

  return {
    valid: true,
    violations: [],
    comparisons,
    trendAlerts,
    improvingMetrics,
    worseningMetrics,
  };
}

export function compareToAverage(
  currentValue: number,
  averageValue: number,
  metric: BusinessMetricName
): { direction: TrendDirection; isImprovement: boolean; deviationPct: number } {
  const deviationPct = averageValue !== 0
    ? ((currentValue - averageValue) / Math.abs(averageValue)) * 100
    : 0;
  const direction = computeDirection(deviationPct);
  const higherIsBetter = METRIC_HIGHER_IS_BETTER[metric];
  const isImprovement = direction === "stable" ? false : (direction === "rising") === higherIsBetter;
  return { direction, isImprovement, deviationPct };
}
