import { describe, it, expect } from "vitest";
import {
  METRIC_HIGHER_IS_BETTER,
  validateBusinessStateSnapshot,
  analyzeBusinessTrend,
  compareToAverage,
  type BusinessStateSnapshotInput,
  type BusinessTrendAnalysisInput,
  type MetricDataPoint,
} from "@/domain/owner-mode/business-state-timeline";

const WS = "00000000-0000-0000-0000-000000000001";
const BIZ = "00000000-0000-0000-0000-000000000002";

function metric(metricName: Parameters<typeof METRIC_HIGHER_IS_BETTER["revenue"]>[0] extends never ? never : string, value: number, periodLabel = "2025-Q3"): MetricDataPoint {
  return { metricName: metricName as any, value, periodLabel };
}

function snapshotInput(overrides: Partial<BusinessStateSnapshotInput> = {}): BusinessStateSnapshotInput {
  return {
    workspaceId: WS,
    businessId: BIZ,
    periodLabel: "2025-Q3",
    metrics: [
      { metricName: "revenue", value: 450000, periodLabel: "2025-Q3" },
      { metricName: "gross_profit", value: 126000, periodLabel: "2025-Q3" },
      { metricName: "cash_balance", value: 85000, periodLabel: "2025-Q3" },
    ],
    ...overrides,
  };
}

function trendInput(
  current: MetricDataPoint[],
  previous: MetricDataPoint[],
  overrides: Partial<BusinessTrendAnalysisInput> = {}
): BusinessTrendAnalysisInput {
  return { workspaceId: WS, businessId: BIZ, currentPeriod: current, previousPeriod: previous, ...overrides };
}

// ─── Policy table tests ───────────────────────────────────────────────────────

describe("METRIC_HIGHER_IS_BETTER", () => {
  it("revenue → higher is better", () => expect(METRIC_HIGHER_IS_BETTER.revenue).toBe(true));
  it("gross_profit → higher is better", () => expect(METRIC_HIGHER_IS_BETTER.gross_profit).toBe(true));
  it("cash_balance → higher is better", () => expect(METRIC_HIGHER_IS_BETTER.cash_balance).toBe(true));
  it("cash_runway_days → higher is better", () => expect(METRIC_HIGHER_IS_BETTER.cash_runway_days).toBe(true));
  it("debt → lower is better", () => expect(METRIC_HIGHER_IS_BETTER.debt).toBe(false));
  it("emi_burden → lower is better", () => expect(METRIC_HIGHER_IS_BETTER.emi_burden).toBe(false));
  it("churn → lower is better", () => expect(METRIC_HIGHER_IS_BETTER.churn).toBe(false));
  it("complaints → lower is better", () => expect(METRIC_HIGHER_IS_BETTER.complaints).toBe(false));
  it("cost_per_acquisition → lower is better", () => expect(METRIC_HIGHER_IS_BETTER.cost_per_acquisition).toBe(false));
  it("marketing_spend → lower is better", () => expect(METRIC_HIGHER_IS_BETTER.marketing_spend).toBe(false));
  it("leads → higher is better", () => expect(METRIC_HIGHER_IS_BETTER.leads).toBe(true));
  it("conversion_rate → higher is better", () => expect(METRIC_HIGHER_IS_BETTER.conversion_rate).toBe(true));
  it("repeat_customer_rate → higher is better", () => expect(METRIC_HIGHER_IS_BETTER.repeat_customer_rate).toBe(true));
});

// ─── BSTL-RULE-1: periodLabel ─────────────────────────────────────────────────

describe("BSTL-RULE-1: periodLabel required", () => {
  it("violation when empty", () => {
    const result = validateBusinessStateSnapshot(snapshotInput({ periodLabel: "" }));
    expect(result.violations.some((v) => v.includes("BSTL-RULE-1"))).toBe(true);
  });

  it("no violation when provided", () => {
    const result = validateBusinessStateSnapshot(snapshotInput());
    expect(result.violations.some((v) => v.includes("BSTL-RULE-1"))).toBe(false);
  });
});

// ─── BSTL-RULE-2: at least one metric ────────────────────────────────────────

describe("BSTL-RULE-2: at least one metric required", () => {
  it("violation when metrics is empty array", () => {
    const result = validateBusinessStateSnapshot(snapshotInput({ metrics: [] }));
    expect(result.violations.some((v) => v.includes("BSTL-RULE-2"))).toBe(true);
  });

  it("no violation when metrics provided", () => {
    const result = validateBusinessStateSnapshot(snapshotInput());
    expect(result.violations.some((v) => v.includes("BSTL-RULE-2"))).toBe(false);
  });
});

// ─── BSTL-RULE-3: finite metric values ───────────────────────────────────────

describe("BSTL-RULE-3: metric values must be finite", () => {
  it("violation for Infinity value", () => {
    const result = validateBusinessStateSnapshot(
      snapshotInput({
        metrics: [{ metricName: "revenue", value: Infinity, periodLabel: "2025-Q3" }],
      })
    );
    expect(result.violations.some((v) => v.includes("BSTL-RULE-3"))).toBe(true);
  });

  it("violation for NaN value", () => {
    const result = validateBusinessStateSnapshot(
      snapshotInput({
        metrics: [{ metricName: "revenue", value: NaN, periodLabel: "2025-Q3" }],
      })
    );
    expect(result.violations.some((v) => v.includes("BSTL-RULE-3"))).toBe(true);
  });

  it("no violation for zero value", () => {
    const result = validateBusinessStateSnapshot(
      snapshotInput({
        metrics: [{ metricName: "cash_balance", value: 0, periodLabel: "2025-Q3" }],
      })
    );
    expect(result.violations.some((v) => v.includes("BSTL-RULE-3"))).toBe(false);
  });
});

// ─── Scenario: create monthly snapshot ───────────────────────────────────────

describe("scenario: create monthly snapshot", () => {
  it("snapshot with multiple metrics records all", () => {
    const result = validateBusinessStateSnapshot(snapshotInput());
    expect(result.valid).toBe(true);
    expect(result.metricsRecorded).toBe(3);
    expect(result.metricNames).toContain("revenue");
    expect(result.metricNames).toContain("gross_profit");
    expect(result.metricNames).toContain("cash_balance");
  });
});

// ─── Scenario: compare month vs previous ─────────────────────────────────────

describe("scenario: compare month vs previous", () => {
  it("revenue improvement detected", () => {
    const result = analyzeBusinessTrend(
      trendInput(
        [{ metricName: "revenue", value: 480000, periodLabel: "2025-Q3" }],
        [{ metricName: "revenue", value: 450000, periodLabel: "2025-Q2" }]
      )
    );
    expect(result.valid).toBe(true);
    const rev = result.comparisons.find((c) => c.metricName === "revenue")!;
    expect(rev.direction).toBe("rising");
    expect(rev.isImprovement).toBe(true);
    expect(result.improvingMetrics).toContain("revenue");
  });

  it("churn worsening detected (churn rising = bad)", () => {
    const result = analyzeBusinessTrend(
      trendInput(
        [{ metricName: "churn", value: 8.5, periodLabel: "2025-Q3" }],
        [{ metricName: "churn", value: 6.0, periodLabel: "2025-Q2" }]
      )
    );
    const churn = result.comparisons.find((c) => c.metricName === "churn")!;
    expect(churn.direction).toBe("rising");
    expect(churn.isImprovement).toBe(false);
    expect(result.worseningMetrics).toContain("churn");
  });

  it("absolute and percentage change computed correctly", () => {
    const result = analyzeBusinessTrend(
      trendInput(
        [{ metricName: "gross_profit", value: 132000, periodLabel: "2025-Q3" }],
        [{ metricName: "gross_profit", value: 120000, periodLabel: "2025-Q2" }]
      )
    );
    const gp = result.comparisons.find((c) => c.metricName === "gross_profit")!;
    expect(gp.absoluteChange).toBe(12000);
    expect(gp.percentageChange).toBeCloseTo(10, 1);
  });
});

// ─── Scenario: compare month vs 3-month average ───────────────────────────────

describe("scenario: compare month vs 3-month average", () => {
  it("above average is improvement for revenue", () => {
    const r = compareToAverage(500000, 450000, "revenue");
    expect(r.direction).toBe("rising");
    expect(r.isImprovement).toBe(true);
    expect(r.deviationPct).toBeCloseTo(11.11, 1);
  });

  it("below average is improvement for debt", () => {
    const r = compareToAverage(80000, 100000, "debt");
    expect(r.direction).toBe("falling");
    expect(r.isImprovement).toBe(true);
  });

  it("stable (no change)", () => {
    const r = compareToAverage(100, 100, "revenue");
    expect(r.direction).toBe("stable");
    expect(r.isImprovement).toBe(false);
  });
});

// ─── Scenario: detect revenue up / profit down ───────────────────────────────

describe("scenario: detect revenue up/profit down", () => {
  it("revenue rising + gross_profit falling → alert", () => {
    const result = analyzeBusinessTrend(
      trendInput(
        [
          { metricName: "revenue", value: 500000, periodLabel: "2025-Q3" },
          { metricName: "gross_profit", value: 110000, periodLabel: "2025-Q3" },
        ],
        [
          { metricName: "revenue", value: 450000, periodLabel: "2025-Q2" },
          { metricName: "gross_profit", value: 130000, periodLabel: "2025-Q2" },
        ]
      )
    );
    const alert = result.trendAlerts.find((a) => a.alertType === "revenue_up_profit_down");
    expect(alert).toBeDefined();
    expect(alert!.severity).toBe("critical");
  });

  it("revenue and profit both rising → no alert", () => {
    const result = analyzeBusinessTrend(
      trendInput(
        [
          { metricName: "revenue", value: 500000, periodLabel: "2025-Q3" },
          { metricName: "gross_profit", value: 145000, periodLabel: "2025-Q3" },
        ],
        [
          { metricName: "revenue", value: 450000, periodLabel: "2025-Q2" },
          { metricName: "gross_profit", value: 130000, periodLabel: "2025-Q2" },
        ]
      )
    );
    const alert = result.trendAlerts.find((a) => a.alertType === "revenue_up_profit_down");
    expect(alert).toBeUndefined();
  });
});

// ─── Scenario: detect cash runway worsening ──────────────────────────────────

describe("scenario: detect cash falling sales rising", () => {
  it("cash falling + revenue rising → critical alert", () => {
    const result = analyzeBusinessTrend(
      trendInput(
        [
          { metricName: "cash_balance", value: 60000, periodLabel: "2025-Q3" },
          { metricName: "revenue", value: 500000, periodLabel: "2025-Q3" },
        ],
        [
          { metricName: "cash_balance", value: 90000, periodLabel: "2025-Q2" },
          { metricName: "revenue", value: 450000, periodLabel: "2025-Q2" },
        ]
      )
    );
    const alert = result.trendAlerts.find((a) => a.alertType === "cash_falling_sales_rising");
    expect(alert).toBeDefined();
    expect(alert!.severity).toBe("critical");
  });
});

// ─── Scenario: detect leads up / conversion down ─────────────────────────────

describe("scenario: detect leads up/conversion down", () => {
  it("leads rising + conversion falling → warning alert", () => {
    const result = analyzeBusinessTrend(
      trendInput(
        [
          { metricName: "leads", value: 320, periodLabel: "2025-Q3" },
          { metricName: "conversion_rate", value: 4.2, periodLabel: "2025-Q3" },
        ],
        [
          { metricName: "leads", value: 250, periodLabel: "2025-Q2" },
          { metricName: "conversion_rate", value: 6.8, periodLabel: "2025-Q2" },
        ]
      )
    );
    const alert = result.trendAlerts.find((a) => a.alertType === "leads_up_conversion_down");
    expect(alert).toBeDefined();
    expect(alert!.severity).toBe("warning");
  });
});

// ─── Debt growing faster than cash ───────────────────────────────────────────

describe("detect debt growing faster than cash", () => {
  it("debt +50k cash +10k → critical alert", () => {
    const result = analyzeBusinessTrend(
      trendInput(
        [
          { metricName: "debt", value: 250000, periodLabel: "2025-Q3" },
          { metricName: "cash_balance", value: 95000, periodLabel: "2025-Q3" },
        ],
        [
          { metricName: "debt", value: 200000, periodLabel: "2025-Q2" },
          { metricName: "cash_balance", value: 85000, periodLabel: "2025-Q2" },
        ]
      )
    );
    const alert = result.trendAlerts.find((a) => a.alertType === "debt_growing_faster_than_cash");
    expect(alert).toBeDefined();
    expect(alert!.severity).toBe("critical");
  });

  it("cash growing faster than debt → no alert", () => {
    const result = analyzeBusinessTrend(
      trendInput(
        [
          { metricName: "debt", value: 210000, periodLabel: "2025-Q3" },
          { metricName: "cash_balance", value: 140000, periodLabel: "2025-Q3" },
        ],
        [
          { metricName: "debt", value: 200000, periodLabel: "2025-Q2" },
          { metricName: "cash_balance", value: 85000, periodLabel: "2025-Q2" },
        ]
      )
    );
    const alert = result.trendAlerts.find((a) => a.alertType === "debt_growing_faster_than_cash");
    expect(alert).toBeUndefined();
  });
});

// ─── Marketing spend + CAC worsening ─────────────────────────────────────────

describe("detect marketing spend up + CAC worsening", () => {
  it("marketing up + CAC up → warning", () => {
    const result = analyzeBusinessTrend(
      trendInput(
        [
          { metricName: "marketing_spend", value: 45000, periodLabel: "2025-Q3" },
          { metricName: "cost_per_acquisition", value: 380, periodLabel: "2025-Q3" },
        ],
        [
          { metricName: "marketing_spend", value: 35000, periodLabel: "2025-Q2" },
          { metricName: "cost_per_acquisition", value: 290, periodLabel: "2025-Q2" },
        ]
      )
    );
    const alert = result.trendAlerts.find((a) => a.alertType === "marketing_spend_up_cac_worsening");
    expect(alert).toBeDefined();
  });
});

// ─── Complaints rising ────────────────────────────────────────────────────────

describe("detect complaints rising", () => {
  it("complaints up → early churn warning", () => {
    const result = analyzeBusinessTrend(
      trendInput(
        [{ metricName: "complaints", value: 28, periodLabel: "2025-Q3" }],
        [{ metricName: "complaints", value: 15, periodLabel: "2025-Q2" }]
      )
    );
    const alert = result.trendAlerts.find((a) => a.alertType === "complaints_up_before_churn");
    expect(alert).toBeDefined();
    expect(alert!.severity).toBe("warning");
  });
});

// ─── BSTL-RULE-4: requires periods ───────────────────────────────────────────

describe("BSTL-RULE-4: trend analysis requires non-empty periods", () => {
  it("empty current period → violation", () => {
    const result = analyzeBusinessTrend(trendInput([], [{ metricName: "revenue", value: 100, periodLabel: "2025-Q2" }]));
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.includes("BSTL-RULE-4"))).toBe(true);
  });

  it("empty previous period → violation", () => {
    const result = analyzeBusinessTrend(trendInput([{ metricName: "revenue", value: 100, periodLabel: "2025-Q3" }], []));
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.includes("BSTL-RULE-4"))).toBe(true);
  });
});

// ─── Workspace scoping ────────────────────────────────────────────────────────

describe("workspace scoping", () => {
  it("snapshot throws when workspaceId is empty", () => {
    expect(() => validateBusinessStateSnapshot(snapshotInput({ workspaceId: "" }))).toThrow();
  });

  it("trend analysis throws when workspaceId is empty", () => {
    expect(() =>
      analyzeBusinessTrend(
        trendInput(
          [{ metricName: "revenue", value: 100, periodLabel: "2025-Q3" }],
          [{ metricName: "revenue", value: 90, periodLabel: "2025-Q2" }],
          { workspaceId: "" }
        )
      )
    ).toThrow();
  });
});
