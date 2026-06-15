/**
 * B16-S2: Public Dataset Test Harness — Advanced Evaluation
 *
 * Builds on B16-S1 (deterministic calculation tests) with advanced,
 * deterministic evaluation checks over public-dataset rows/series:
 *   - segmentation checks  (group-by aggregation vs expected per-segment values)
 *   - trend checks         (least-squares slope/direction vs expected)
 *   - anomaly checks       (z-score / IQR outlier detection vs expected)
 *   - forecast checks      (linear projection WITH range + confidence)
 *   - output validation    (generic actual-vs-expected with tolerance)
 *   - failure reporting     (every result carries evidence + a clear reason)
 *
 * All functions are pure and deterministic: identical inputs always produce
 * identical outputs. No persistence, no I/O, no DB. This is LANE_A harness
 * logic; persistence of calculation history lives in B16-S1's service and is
 * intentionally untouched here.
 */

export type EvaluationCheckType =
  | "segmentation"
  | "trend"
  | "anomaly"
  | "forecast"
  | "output";

/** A single, human-readable piece of evidence backing an evaluation outcome. */
export interface EvaluationEvidence {
  metric: string;
  expected: number | string | boolean | null;
  actual: number | string | boolean | null;
  detail: string;
}

/** The result of one evaluation check. Always carries evidence. */
export interface EvaluationResult {
  checkType: EvaluationCheckType;
  passed: boolean;
  summary: string;
  evidence: EvaluationEvidence[];
  /** Present only when passed === false. Clear, evidence-backed reason. */
  failureReason?: string;
}

// ---------------------------------------------------------------------------
// Numeric helpers (pure, deterministic)
// ---------------------------------------------------------------------------

/**
 * Relative tolerance comparison. When `expected` is 0, falls back to an
 * absolute comparison against `tolerance` (relative tolerance is undefined at 0).
 */
function withinTolerance(
  actual: number,
  expected: number,
  tolerance: number,
): boolean {
  if (!Number.isFinite(actual) || !Number.isFinite(expected)) {
    return false;
  }
  if (expected === 0) {
    return Math.abs(actual) <= tolerance;
  }
  return Math.abs(actual - expected) / Math.abs(expected) <= tolerance;
}

function mean(values: number[]): number {
  if (values.length === 0) return NaN;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

/** Population standard deviation (divides by N). Deterministic. */
function populationStdDev(values: number[]): number {
  if (values.length === 0) return NaN;
  const m = mean(values);
  let acc = 0;
  for (const v of values) acc += (v - m) * (v - m);
  return Math.sqrt(acc / values.length);
}

/**
 * Quantile via linear interpolation between closest ranks (type-7, the
 * common default). Input must be sorted ascending.
 */
function quantileSorted(sortedAsc: number[], q: number): number {
  const n = sortedAsc.length;
  if (n === 0) return NaN;
  if (n === 1) return sortedAsc[0];
  const pos = (n - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sortedAsc[lo];
  const frac = pos - lo;
  return sortedAsc[lo] * (1 - frac) + sortedAsc[hi] * frac;
}

/** Ordinary least-squares fit over x = 0..n-1. Returns slope + intercept. */
function linearRegression(ys: number[]): { slope: number; intercept: number } {
  const n = ys.length;
  if (n === 0) return { slope: 0, intercept: 0 };
  if (n === 1) return { slope: 0, intercept: ys[0] };
  const sumX = ((n - 1) * n) / 2;
  const sumX2 = ((n - 1) * n * (2 * n - 1)) / 6;
  let sumY = 0;
  let sumXY = 0;
  for (let i = 0; i < n; i++) {
    sumY += ys[i];
    sumXY += i * ys[i];
  }
  const denom = n * sumX2 - sumX * sumX;
  const slope = denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

/** Two-sided z-multiplier for common confidence levels. */
function zMultiplier(confidenceLevel: number): number {
  // Nearest standard level; deterministic mapping.
  if (confidenceLevel >= 0.99) return 2.576;
  if (confidenceLevel >= 0.98) return 2.326;
  if (confidenceLevel >= 0.95) return 1.96;
  if (confidenceLevel >= 0.9) return 1.645;
  if (confidenceLevel >= 0.8) return 1.2816;
  return 1.0;
}

// ---------------------------------------------------------------------------
// Segmentation
// ---------------------------------------------------------------------------

export type AggregationMethod = "sum" | "avg" | "count" | "min" | "max";

export interface SegmentationCheck {
  groupByField: string;
  /** Required for every aggregation except "count". */
  measureField?: string;
  aggregation: AggregationMethod;
  /** Expected aggregated value per segment key. */
  expectedSegments: Record<string, number>;
  /** Relative tolerance for numeric comparison (default 0 = exact). */
  tolerance?: number;
}

function aggregate(values: number[], method: AggregationMethod): number {
  if (method === "count") return values.length;
  if (values.length === 0) return NaN;
  if (method === "sum") return values.reduce((a, b) => a + b, 0);
  if (method === "avg") return values.reduce((a, b) => a + b, 0) / values.length;
  if (method === "min") return Math.min(...values);
  if (method === "max") return Math.max(...values);
  return NaN;
}

/**
 * Evaluate group-by segmentation of dataset rows against expected per-segment
 * aggregated values. Fails (with evidence) when an expected segment is missing
 * or out of tolerance, or when a measure value is non-numeric.
 */
export function evaluateSegmentation(
  rows: Record<string, unknown>[],
  check: SegmentationCheck,
): EvaluationResult {
  const tolerance = check.tolerance ?? 0;
  const evidence: EvaluationEvidence[] = [];

  if (check.aggregation !== "count" && !check.measureField) {
    return {
      checkType: "segmentation",
      passed: false,
      summary: "Segmentation misconfigured",
      evidence,
      failureReason: `measureField is required for aggregation "${check.aggregation}"`,
    };
  }

  // Group measure values by segment key.
  const groups = new Map<string, number[]>();
  let invalidMeasureDetail: string | null = null;

  for (const row of rows) {
    const key = String(row[check.groupByField]);
    if (!groups.has(key)) groups.set(key, []);
    if (check.aggregation === "count") {
      groups.get(key)!.push(1);
      continue;
    }
    const raw = row[check.measureField as string];
    const num = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(num)) {
      invalidMeasureDetail =
        `segment "${key}" has non-numeric ${check.measureField}="${String(raw)}"`;
      continue;
    }
    groups.get(key)!.push(num);
  }

  let failed = false;
  const failures: string[] = [];

  for (const [segKey, expectedValue] of Object.entries(check.expectedSegments)) {
    if (!groups.has(segKey)) {
      failed = true;
      failures.push(`missing segment "${segKey}"`);
      evidence.push({
        metric: `segment:${segKey}`,
        expected: expectedValue,
        actual: null,
        detail: `expected segment "${segKey}" not present in data`,
      });
      continue;
    }
    const actualValue = aggregate(groups.get(segKey)!, check.aggregation);
    const ok = withinTolerance(actualValue, expectedValue, tolerance);
    evidence.push({
      metric: `segment:${segKey}`,
      expected: expectedValue,
      actual: Number.isFinite(actualValue) ? actualValue : null,
      detail: `${check.aggregation}(${check.measureField ?? "rows"}) for "${segKey}" = ${
        Number.isFinite(actualValue) ? actualValue : "NaN"
      } (tolerance ${tolerance})`,
    });
    if (!ok) {
      failed = true;
      failures.push(
        `segment "${segKey}" expected ${expectedValue}, got ${
          Number.isFinite(actualValue) ? actualValue : "NaN"
        }`,
      );
    }
  }

  if (invalidMeasureDetail) {
    failed = true;
    failures.push(invalidMeasureDetail);
    evidence.push({
      metric: "measure_validity",
      expected: "numeric",
      actual: "non-numeric",
      detail: invalidMeasureDetail,
    });
  }

  return {
    checkType: "segmentation",
    passed: !failed,
    summary: `Segmentation by "${check.groupByField}" (${check.aggregation}): ${
      Object.keys(check.expectedSegments).length
    } expected segment(s)`,
    evidence,
    failureReason: failed ? failures.join("; ") : undefined,
  };
}

// ---------------------------------------------------------------------------
// Trend
// ---------------------------------------------------------------------------

export type TrendDirection = "increasing" | "decreasing" | "flat";

export interface TrendPoint {
  period: string;
  value: number;
}

export interface TrendCheck {
  /** Time-ordered series (caller provides chronological order). */
  series: TrendPoint[];
  expectedDirection: TrendDirection;
  /** |slope| <= flatThreshold => "flat". Default 1e-9. */
  flatThreshold?: number;
  /** Optional: also assert the slope magnitude. */
  expectedSlope?: number;
  slopeTolerance?: number;
}

export function classifyTrend(
  slope: number,
  flatThreshold: number,
): TrendDirection {
  if (Math.abs(slope) <= flatThreshold) return "flat";
  return slope > 0 ? "increasing" : "decreasing";
}

/**
 * Evaluate the trend direction (and optionally slope) of a time series via
 * ordinary least-squares regression against the expected direction.
 */
export function evaluateTrend(check: TrendCheck): EvaluationResult {
  const flatThreshold = check.flatThreshold ?? 1e-9;
  const evidence: EvaluationEvidence[] = [];

  if (check.series.length < 2) {
    return {
      checkType: "trend",
      passed: false,
      summary: "Trend requires at least 2 points",
      evidence,
      failureReason: `series has ${check.series.length} point(s); need >= 2`,
    };
  }

  const ys = check.series.map((p) => p.value);
  const { slope } = linearRegression(ys);
  const actualDirection = classifyTrend(slope, flatThreshold);

  const failures: string[] = [];
  let failed = false;

  evidence.push({
    metric: "direction",
    expected: check.expectedDirection,
    actual: actualDirection,
    detail: `least-squares slope = ${slope} (flatThreshold ${flatThreshold})`,
  });

  if (actualDirection !== check.expectedDirection) {
    failed = true;
    failures.push(
      `expected ${check.expectedDirection} trend, observed ${actualDirection} (slope ${slope})`,
    );
  }

  if (check.expectedSlope !== undefined) {
    const slopeTol = check.slopeTolerance ?? 0;
    const ok = withinTolerance(slope, check.expectedSlope, slopeTol);
    evidence.push({
      metric: "slope",
      expected: check.expectedSlope,
      actual: slope,
      detail: `slope tolerance ${slopeTol}`,
    });
    if (!ok) {
      failed = true;
      failures.push(
        `expected slope ${check.expectedSlope}, observed ${slope}`,
      );
    }
  }

  return {
    checkType: "trend",
    passed: !failed,
    summary: `Trend over ${check.series.length} points: ${actualDirection}`,
    evidence,
    failureReason: failed ? failures.join("; ") : undefined,
  };
}

// ---------------------------------------------------------------------------
// Anomaly
// ---------------------------------------------------------------------------

export type AnomalyMethod = "zscore" | "iqr";

export interface AnomalyCheck {
  series: number[];
  method: AnomalyMethod;
  /** zscore: |z| threshold (default 3). iqr: multiplier (default 1.5). */
  threshold?: number;
  /** Indices (into `series`) expected to be flagged as anomalies. */
  expectedAnomalyIndices: number[];
}

/** Detect anomaly indices deterministically. Exposed for reuse/testing. */
export function detectAnomalies(
  series: number[],
  method: AnomalyMethod,
  threshold?: number,
): number[] {
  if (series.length === 0) return [];
  const anomalies: number[] = [];

  if (method === "zscore") {
    const t = threshold ?? 3;
    const m = mean(series);
    const sd = populationStdDev(series);
    if (sd === 0 || !Number.isFinite(sd)) return [];
    for (let i = 0; i < series.length; i++) {
      const z = Math.abs((series[i] - m) / sd);
      if (z > t) anomalies.push(i);
    }
    return anomalies;
  }

  // IQR
  const mult = threshold ?? 1.5;
  const sorted = [...series].sort((a, b) => a - b);
  const q1 = quantileSorted(sorted, 0.25);
  const q3 = quantileSorted(sorted, 0.75);
  const iqr = q3 - q1;
  const lower = q1 - mult * iqr;
  const upper = q3 + mult * iqr;
  for (let i = 0; i < series.length; i++) {
    if (series[i] < lower || series[i] > upper) anomalies.push(i);
  }
  return anomalies;
}

/**
 * Evaluate anomaly detection against the expected set of anomalous indices.
 * Passes only when the detected set exactly matches the expected set.
 */
export function evaluateAnomaly(check: AnomalyCheck): EvaluationResult {
  const detected = detectAnomalies(check.series, check.method, check.threshold);
  const detectedSet = new Set(detected);
  const expectedSet = new Set(check.expectedAnomalyIndices);

  const missed = [...expectedSet].filter((i) => !detectedSet.has(i));
  const unexpected = [...detectedSet].filter((i) => !expectedSet.has(i));
  const passed = missed.length === 0 && unexpected.length === 0;

  const evidence: EvaluationEvidence[] = [
    {
      metric: "detected_indices",
      expected: JSON.stringify([...expectedSet].sort((a, b) => a - b)),
      actual: JSON.stringify(detected),
      detail: `method=${check.method}, threshold=${
        check.threshold ?? (check.method === "zscore" ? 3 : 1.5)
      }`,
    },
  ];

  const failures: string[] = [];
  if (missed.length > 0) failures.push(`missed anomalies at [${missed.join(", ")}]`);
  if (unexpected.length > 0)
    failures.push(`flagged unexpected anomalies at [${unexpected.join(", ")}]`);

  return {
    checkType: "anomaly",
    passed,
    summary: `Anomaly (${check.method}): detected ${detected.length}, expected ${expectedSet.size}`,
    evidence,
    failureReason: passed ? undefined : failures.join("; "),
  };
}

// ---------------------------------------------------------------------------
// Forecast
// ---------------------------------------------------------------------------

export interface ForecastOutput {
  forecastValue: number;
  lowerBound: number;
  upperBound: number;
  confidenceLevel: number;
  slope: number;
  intercept: number;
}

export interface ForecastCheck {
  /** Historical, time-ordered values. */
  history: number[];
  /** How many periods beyond the last point to forecast (>= 1). */
  periodsAhead: number;
  /** Confidence level for the prediction interval (default 0.95). */
  confidenceLevel?: number;
  /** Optional: assert the forecast point against an expected value. */
  expectedValue?: number;
  /** Relative tolerance for expectedValue (default 0). */
  tolerance?: number;
  /** Optional: assert the forecast point falls within an expected range. */
  expectedRange?: { lower: number; upper: number };
}

/**
 * Linear-projection forecast WITH a prediction interval (range) and the
 * confidence level used. Deterministic.
 */
export function computeForecast(
  history: number[],
  periodsAhead: number,
  confidenceLevel: number = 0.95,
): ForecastOutput {
  const n = history.length;
  const { slope, intercept } = linearRegression(history);
  const x0 = n - 1 + periodsAhead;
  const forecastValue = intercept + slope * x0;

  // Prediction-interval standard error (approx): s * sqrt(1 + 1/n + (x0-xbar)^2/Sxx)
  let se = 0;
  if (n > 2) {
    const xbar = (n - 1) / 2;
    let ssr = 0;
    let sxx = 0;
    for (let i = 0; i < n; i++) {
      const fitted = intercept + slope * i;
      ssr += (history[i] - fitted) * (history[i] - fitted);
      sxx += (i - xbar) * (i - xbar);
    }
    const s = Math.sqrt(ssr / (n - 2));
    const leverage = sxx === 0 ? 0 : (x0 - xbar) * (x0 - xbar) / sxx;
    se = s * Math.sqrt(1 + 1 / n + leverage);
  }

  const z = zMultiplier(confidenceLevel);
  const margin = z * se;

  return {
    forecastValue,
    lowerBound: forecastValue - margin,
    upperBound: forecastValue + margin,
    confidenceLevel,
    slope,
    intercept,
  };
}

/**
 * Evaluate a forecast. The output always includes a range and confidence
 * level (B16 acceptance gate). When `expectedValue` or `expectedRange` is
 * provided, the forecast point is validated against it with evidence.
 */
export function evaluateForecast(check: ForecastCheck): EvaluationResult {
  const confidenceLevel = check.confidenceLevel ?? 0.95;
  const evidence: EvaluationEvidence[] = [];

  if (check.history.length < 2) {
    return {
      checkType: "forecast",
      passed: false,
      summary: "Forecast requires at least 2 historical points",
      evidence,
      failureReason: `history has ${check.history.length} point(s); need >= 2`,
    };
  }
  if (check.periodsAhead < 1) {
    return {
      checkType: "forecast",
      passed: false,
      summary: "Forecast periodsAhead must be >= 1",
      evidence,
      failureReason: `periodsAhead = ${check.periodsAhead}`,
    };
  }

  const out = computeForecast(
    check.history,
    check.periodsAhead,
    confidenceLevel,
  );

  evidence.push({
    metric: "forecast_value",
    expected: check.expectedValue ?? null,
    actual: out.forecastValue,
    detail: `range [${out.lowerBound}, ${out.upperBound}] @ ${confidenceLevel} confidence (slope ${out.slope})`,
  });
  evidence.push({
    metric: "forecast_range",
    expected: check.expectedRange
      ? `[${check.expectedRange.lower}, ${check.expectedRange.upper}]`
      : null,
    actual: `[${out.lowerBound}, ${out.upperBound}]`,
    detail: `confidence ${confidenceLevel}`,
  });

  const failures: string[] = [];
  let failed = false;

  if (check.expectedValue !== undefined) {
    const tol = check.tolerance ?? 0;
    if (!withinTolerance(out.forecastValue, check.expectedValue, tol)) {
      failed = true;
      failures.push(
        `forecast ${out.forecastValue} outside tolerance ${tol} of expected ${check.expectedValue}`,
      );
    }
  }

  if (check.expectedRange) {
    if (
      out.forecastValue < check.expectedRange.lower ||
      out.forecastValue > check.expectedRange.upper
    ) {
      failed = true;
      failures.push(
        `forecast ${out.forecastValue} not within expected range [${check.expectedRange.lower}, ${check.expectedRange.upper}]`,
      );
    }
  }

  return {
    checkType: "forecast",
    passed: !failed,
    summary: `Forecast ${check.periodsAhead} period(s) ahead = ${out.forecastValue}`,
    evidence,
    failureReason: failed ? failures.join("; ") : undefined,
  };
}

// ---------------------------------------------------------------------------
// Generic output validation
// ---------------------------------------------------------------------------

export interface OutputExpectation {
  value: number | string | boolean;
  /** Relative tolerance for numeric comparison (default 0). */
  tolerance?: number;
}

/**
 * Validate a calculated output value against an expected value. Numeric values
 * use relative tolerance; non-numeric values use strict equality.
 */
export function validateOutput(
  actual: number | string | boolean,
  expected: OutputExpectation,
): EvaluationResult {
  let passed: boolean;
  if (typeof expected.value === "number" && typeof actual === "number") {
    passed = withinTolerance(actual, expected.value, expected.tolerance ?? 0);
  } else {
    passed = actual === expected.value;
  }

  return {
    checkType: "output",
    passed,
    summary: `Output validation: ${passed ? "match" : "mismatch"}`,
    evidence: [
      {
        metric: "output_value",
        expected: expected.value,
        actual,
        detail:
          typeof expected.value === "number"
            ? `tolerance ${expected.tolerance ?? 0}`
            : "strict equality",
      },
    ],
    failureReason: passed
      ? undefined
      : `expected ${String(expected.value)}, got ${String(actual)}`,
  };
}

// ---------------------------------------------------------------------------
// Harness report aggregation
// ---------------------------------------------------------------------------

export interface HarnessReport {
  totalChecks: number;
  passedChecks: number;
  failedChecks: number;
  allPassed: boolean;
  results: EvaluationResult[];
  /** Flat list of failure reasons with their check type, for quick triage. */
  failures: { checkType: EvaluationCheckType; reason: string }[];
}

/**
 * Aggregate multiple evaluation results into a single harness report with
 * clear, evidence-backed failure reporting.
 */
export function buildHarnessReport(
  results: EvaluationResult[],
): HarnessReport {
  const passedChecks = results.filter((r) => r.passed).length;
  const failedChecks = results.length - passedChecks;
  const failures = results
    .filter((r) => !r.passed)
    .map((r) => ({
      checkType: r.checkType,
      reason: r.failureReason ?? "unspecified failure",
    }));

  return {
    totalChecks: results.length,
    passedChecks,
    failedChecks,
    allPassed: failedChecks === 0,
    results,
    failures,
  };
}
