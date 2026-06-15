/**
 * B16-S2 — Public Dataset Test Harness: Advanced Evaluation.
 *
 * Pure-function (LANE_A) tests for deterministic segmentation, trend,
 * anomaly, forecast, output-validation, and failure-reporting logic.
 * No DB, no I/O — identical inputs must produce identical outputs.
 */

import { describe, it, expect } from "vitest";
import {
  evaluateSegmentation,
  evaluateTrend,
  evaluateAnomaly,
  evaluateForecast,
  computeForecast,
  detectAnomalies,
  classifyTrend,
  validateOutput,
  buildHarnessReport,
  type SegmentationCheck,
  type TrendCheck,
  type AnomalyCheck,
  type ForecastCheck,
} from "@/domain/benchmark/dataset-evaluation";

const retailRows = [
  { transaction_id: "t001", amount: 100, category: "electronics" },
  { transaction_id: "t002", amount: 250, category: "clothing" },
  { transaction_id: "t003", amount: 75, category: "food" },
  { transaction_id: "t004", amount: 500, category: "electronics" },
  { transaction_id: "t005", amount: 150, category: "clothing" },
];

describe("B16-S2 evaluateSegmentation", () => {
  it("passes when sum-by-segment matches expected", () => {
    const check: SegmentationCheck = {
      groupByField: "category",
      measureField: "amount",
      aggregation: "sum",
      expectedSegments: { electronics: 600, clothing: 400, food: 75 },
    };
    const result = evaluateSegmentation(retailRows, check);
    expect(result.passed).toBe(true);
    expect(result.checkType).toBe("segmentation");
    expect(result.evidence.length).toBe(3);
    expect(result.failureReason).toBeUndefined();
  });

  it("passes for avg and count aggregations", () => {
    expect(
      evaluateSegmentation(retailRows, {
        groupByField: "category",
        measureField: "amount",
        aggregation: "avg",
        expectedSegments: { electronics: 300, clothing: 200, food: 75 },
      }).passed,
    ).toBe(true);

    expect(
      evaluateSegmentation(retailRows, {
        groupByField: "category",
        aggregation: "count",
        expectedSegments: { electronics: 2, clothing: 2, food: 1 },
      }).passed,
    ).toBe(true);
  });

  it("fails with evidence when a segment value is wrong", () => {
    const result = evaluateSegmentation(retailRows, {
      groupByField: "category",
      measureField: "amount",
      aggregation: "sum",
      expectedSegments: { electronics: 999, clothing: 400, food: 75 },
    });
    expect(result.passed).toBe(false);
    expect(result.failureReason).toContain("electronics");
    const ev = result.evidence.find((e) => e.metric === "segment:electronics");
    expect(ev?.expected).toBe(999);
    expect(ev?.actual).toBe(600);
  });

  it("fails when an expected segment is missing from data", () => {
    const result = evaluateSegmentation(retailRows, {
      groupByField: "category",
      measureField: "amount",
      aggregation: "sum",
      expectedSegments: { luxury: 1000 },
    });
    expect(result.passed).toBe(false);
    expect(result.failureReason).toContain("missing segment");
  });

  it("honors relative tolerance", () => {
    const result = evaluateSegmentation(retailRows, {
      groupByField: "category",
      measureField: "amount",
      aggregation: "sum",
      expectedSegments: { electronics: 610 }, // 600 vs 610 ~1.67%
      tolerance: 0.02,
    });
    expect(result.passed).toBe(true);
  });

  it("fails closed when measure value is non-numeric", () => {
    const rows = [
      { category: "a", amount: 10 },
      { category: "a", amount: "not-a-number" },
    ];
    const result = evaluateSegmentation(rows, {
      groupByField: "category",
      measureField: "amount",
      aggregation: "sum",
      expectedSegments: { a: 10 },
    });
    expect(result.passed).toBe(false);
    expect(result.failureReason).toContain("non-numeric");
  });

  it("fails closed when measureField missing for non-count aggregation", () => {
    const result = evaluateSegmentation(retailRows, {
      groupByField: "category",
      aggregation: "sum",
      expectedSegments: { electronics: 600 },
    });
    expect(result.passed).toBe(false);
    expect(result.failureReason).toContain("measureField is required");
  });
});

describe("B16-S2 evaluateTrend", () => {
  it("detects an increasing trend", () => {
    const check: TrendCheck = {
      series: [
        { period: "Jan", value: 10 },
        { period: "Feb", value: 20 },
        { period: "Mar", value: 30 },
        { period: "Apr", value: 40 },
      ],
      expectedDirection: "increasing",
    };
    const result = evaluateTrend(check);
    expect(result.passed).toBe(true);
    const ev = result.evidence.find((e) => e.metric === "direction");
    expect(ev?.actual).toBe("increasing");
  });

  it("detects a decreasing trend", () => {
    const result = evaluateTrend({
      series: [
        { period: "Jan", value: 40 },
        { period: "Feb", value: 30 },
        { period: "Mar", value: 20 },
        { period: "Apr", value: 10 },
      ],
      expectedDirection: "decreasing",
    });
    expect(result.passed).toBe(true);
  });

  it("detects a flat trend", () => {
    const result = evaluateTrend({
      series: [
        { period: "Jan", value: 20 },
        { period: "Feb", value: 20 },
        { period: "Mar", value: 20 },
      ],
      expectedDirection: "flat",
    });
    expect(result.passed).toBe(true);
  });

  it("fails with evidence when observed direction differs from expected", () => {
    const result = evaluateTrend({
      series: [
        { period: "Jan", value: 10 },
        { period: "Feb", value: 20 },
        { period: "Mar", value: 30 },
      ],
      expectedDirection: "decreasing",
    });
    expect(result.passed).toBe(false);
    expect(result.failureReason).toContain("expected decreasing");
  });

  it("validates expected slope within tolerance", () => {
    const result = evaluateTrend({
      series: [
        { period: "1", value: 0 },
        { period: "2", value: 10 },
        { period: "3", value: 20 },
      ],
      expectedDirection: "increasing",
      expectedSlope: 10,
      slopeTolerance: 0,
    });
    expect(result.passed).toBe(true);
  });

  it("fails closed for a series shorter than 2 points", () => {
    const result = evaluateTrend({
      series: [{ period: "Jan", value: 10 }],
      expectedDirection: "flat",
    });
    expect(result.passed).toBe(false);
    expect(result.failureReason).toContain("need >= 2");
  });

  it("classifyTrend respects flatThreshold", () => {
    expect(classifyTrend(0.0000001, 1e-3)).toBe("flat");
    expect(classifyTrend(5, 1e-9)).toBe("increasing");
    expect(classifyTrend(-5, 1e-9)).toBe("decreasing");
  });
});

describe("B16-S2 evaluateAnomaly", () => {
  it("detects a z-score outlier", () => {
    const series = [5, 5, 5, 5, 5, 5, 5, 5, 5, 100];
    expect(detectAnomalies(series, "zscore", 2.5)).toEqual([9]);
    const result = evaluateAnomaly({
      series,
      method: "zscore",
      threshold: 2.5,
      expectedAnomalyIndices: [9],
    });
    expect(result.passed).toBe(true);
  });

  it("reports no z-score anomaly when threshold is high", () => {
    const series = [5, 5, 5, 5, 5, 5, 5, 5, 5, 100];
    const result = evaluateAnomaly({
      series,
      method: "zscore",
      threshold: 3.5,
      expectedAnomalyIndices: [],
    });
    expect(result.passed).toBe(true);
    expect(detectAnomalies(series, "zscore", 3.5)).toEqual([]);
  });

  it("detects an IQR outlier", () => {
    const series = [1, 2, 3, 4, 5, 6, 7, 8, 9, 100];
    expect(detectAnomalies(series, "iqr", 1.5)).toEqual([9]);
    const result = evaluateAnomaly({
      series,
      method: "iqr",
      expectedAnomalyIndices: [9],
    });
    expect(result.passed).toBe(true);
  });

  it("fails with evidence when expected and detected anomalies differ", () => {
    const result = evaluateAnomaly({
      series: [5, 5, 5, 5, 5, 5, 5, 5, 5, 100],
      method: "zscore",
      threshold: 2.5,
      expectedAnomalyIndices: [3], // wrong
    });
    expect(result.passed).toBe(false);
    expect(result.failureReason).toContain("missed anomalies at [3]");
    expect(result.failureReason).toContain("unexpected anomalies at [9]");
  });

  it("returns no anomalies for zero-variance series", () => {
    expect(detectAnomalies([7, 7, 7, 7], "zscore")).toEqual([]);
  });

  it("is deterministic across repeated runs", () => {
    const series = [10, 11, 9, 10, 250, 11, 10];
    const a = detectAnomalies(series, "iqr");
    const b = detectAnomalies(series, "iqr");
    expect(a).toEqual(b);
  });
});

describe("B16-S2 forecast", () => {
  it("forecasts a perfectly linear series exactly with a range and confidence", () => {
    const out = computeForecast([10, 20, 30, 40, 50], 1);
    expect(out.forecastValue).toBeCloseTo(60, 6);
    expect(out.confidenceLevel).toBe(0.95);
    // Zero residuals → zero-width interval.
    expect(out.lowerBound).toBeCloseTo(60, 6);
    expect(out.upperBound).toBeCloseTo(60, 6);
  });

  it("passes evaluateForecast against an exact expected value", () => {
    const result = evaluateForecast({
      history: [10, 20, 30, 40, 50],
      periodsAhead: 1,
      expectedValue: 60,
      tolerance: 0,
    });
    expect(result.passed).toBe(true);
    expect(result.evidence.some((e) => e.metric === "forecast_range")).toBe(true);
  });

  it("always reports a range and confidence in evidence (acceptance gate)", () => {
    const result = evaluateForecast({
      history: [10, 12, 11, 13, 12, 14, 13, 15],
      periodsAhead: 2,
    });
    const rangeEv = result.evidence.find((e) => e.metric === "forecast_range");
    expect(rangeEv).toBeDefined();
    expect(String(rangeEv?.detail)).toContain("confidence");
  });

  it("produces an interval that brackets the point forecast for noisy data", () => {
    const out = computeForecast([10, 12, 11, 13, 12, 14, 13, 15], 1, 0.95);
    expect(out.lowerBound).toBeLessThanOrEqual(out.forecastValue);
    expect(out.upperBound).toBeGreaterThanOrEqual(out.forecastValue);
    expect(out.upperBound).toBeGreaterThan(out.lowerBound); // non-zero residuals
  });

  it("validates forecast falls within an expected range", () => {
    const result = evaluateForecast({
      history: [100, 110, 120, 130],
      periodsAhead: 1,
      expectedRange: { lower: 135, upper: 145 },
    });
    expect(result.passed).toBe(true);
  });

  it("fails with evidence when forecast is outside expected value tolerance", () => {
    const result = evaluateForecast({
      history: [10, 20, 30, 40, 50],
      periodsAhead: 1,
      expectedValue: 100,
      tolerance: 0.01,
    });
    expect(result.passed).toBe(false);
    expect(result.failureReason).toContain("outside tolerance");
  });

  it("fails closed for insufficient history or invalid horizon", () => {
    expect(
      evaluateForecast({ history: [10], periodsAhead: 1 }).passed,
    ).toBe(false);
    const result = evaluateForecast({ history: [10, 20], periodsAhead: 0 });
    expect(result.passed).toBe(false);
    expect(result.failureReason).toContain("periodsAhead");
  });

  it("higher confidence widens the interval", () => {
    const hist = [10, 12, 11, 13, 12, 14, 13, 15];
    const narrow = computeForecast(hist, 1, 0.8);
    const wide = computeForecast(hist, 1, 0.99);
    const narrowWidth = narrow.upperBound - narrow.lowerBound;
    const wideWidth = wide.upperBound - wide.lowerBound;
    expect(wideWidth).toBeGreaterThan(narrowWidth);
  });
});

describe("B16-S2 validateOutput", () => {
  it("matches numeric output within tolerance", () => {
    expect(validateOutput(150000, { value: 150000 }).passed).toBe(true);
    expect(validateOutput(151000, { value: 150000, tolerance: 0.01 }).passed).toBe(
      true,
    );
    expect(validateOutput(160000, { value: 150000, tolerance: 0.01 }).passed).toBe(
      false,
    );
  });

  it("uses strict equality for non-numeric output", () => {
    expect(validateOutput("growth", { value: "growth" }).passed).toBe(true);
    expect(validateOutput(true, { value: false }).passed).toBe(false);
  });

  it("carries evidence and a failure reason on mismatch", () => {
    const result = validateOutput(5, { value: 10 });
    expect(result.passed).toBe(false);
    expect(result.failureReason).toContain("expected 10, got 5");
    expect(result.evidence[0].metric).toBe("output_value");
  });
});

describe("B16-S2 buildHarnessReport", () => {
  it("aggregates mixed results with clear failure reporting", () => {
    const results = [
      evaluateSegmentation(retailRows, {
        groupByField: "category",
        measureField: "amount",
        aggregation: "sum",
        expectedSegments: { electronics: 600, clothing: 400, food: 75 },
      }),
      evaluateTrend({
        series: [
          { period: "1", value: 10 },
          { period: "2", value: 5 },
        ],
        expectedDirection: "increasing", // will fail (decreasing)
      }),
      validateOutput(1, { value: 1 }),
    ];
    const report = buildHarnessReport(results);
    expect(report.totalChecks).toBe(3);
    expect(report.passedChecks).toBe(2);
    expect(report.failedChecks).toBe(1);
    expect(report.allPassed).toBe(false);
    expect(report.failures.length).toBe(1);
    expect(report.failures[0].checkType).toBe("trend");
    expect(report.failures[0].reason).toContain("expected increasing");
  });

  it("reports allPassed when every check passes", () => {
    const report = buildHarnessReport([
      validateOutput(1, { value: 1 }),
      validateOutput("a", { value: "a" }),
    ]);
    expect(report.allPassed).toBe(true);
    expect(report.failures.length).toBe(0);
  });
});
