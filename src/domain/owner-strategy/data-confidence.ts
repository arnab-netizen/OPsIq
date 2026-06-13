/**
 * Owner Strategy & Scenario Planning (Module 8) — data confidence + currency
 * validation.
 *
 * Deterministic and honest: confidence drops as inputs go missing, and missing
 * critical inputs are listed explicitly. Nothing is invented. Pure (no I/O).
 */
import { clampScore } from "@/domain/owner-spine/contracts";
import { STRATEGY_RISK_LEVELS, type StrategySnapshotInput } from "./types";

/** A finite, present number (missing/NaN/Infinity → not present). */
function present(x: number | undefined | null): boolean {
  return x !== undefined && x !== null && Number.isFinite(x);
}

/** A valid qualitative risk level. */
function riskLevelPresent(x: string | undefined | null): boolean {
  return typeof x === "string" && (STRATEGY_RISK_LEVELS as readonly string[]).includes(x);
}

/**
 * Currency is valid when it is a 3–8 character alphabetic code (e.g. "INR",
 * "USD"). Empty/numeric/over-long values are invalid (fail closed).
 */
export function isValidCurrency(currency: string | undefined | null): boolean {
  if (typeof currency !== "string") return false;
  return /^[A-Za-z]{3,8}$/.test(currency.trim());
}

/**
 * Critical inputs: without these, a scenario diagnosis is largely guesswork.
 * Revenue change + cost change anchor the profit delta; investment anchors
 * ROI/payback/affordability.
 */
export function missingCriticalStrategyInputs(input: StrategySnapshotInput): string[] {
  const missing: string[] = [];
  if (!present(input.expectedRevenueChange)) missing.push("expectedRevenueChange");
  if (!present(input.costChange)) missing.push("costChange");
  if (!present(input.investmentRequired)) missing.push("investmentRequired");
  return missing;
}

const IMPORTANT_NUMERIC_FIELDS: (keyof StrategySnapshotInput)[] = [
  "currentRevenue",
  "timeToImpactMonths",
  "cashAvailable",
  "capacityImpactPct",
  "staffImpact",
];

export interface DataConfidenceResult {
  dataConfidenceScore: number; // 0..100
  missingCritical: string[];
  isStale: boolean;
}

/** Whether the assessment period ended more than `staleDays` before `now`. */
export function isStaleSnapshot(periodEnd: string, now: Date, staleDays: number): boolean {
  const end = new Date(periodEnd).getTime();
  if (Number.isNaN(end)) return false;
  const ageDays = (now.getTime() - end) / (1000 * 60 * 60 * 24);
  return ageDays > staleDays;
}

/**
 * Confidence starts at 100 and is reduced by: 30 per missing critical input,
 * 5 per missing important numeric field, 5 if the qualitative risk level is
 * missing, 10 if currency is invalid, and 15 if the snapshot is stale. Clamped to
 * [0, 100].
 */
export function calculateDataConfidence(
  input: StrategySnapshotInput,
  opts: { now?: Date; staleDays?: number } = {}
): DataConfidenceResult {
  const missingCritical = missingCriticalStrategyInputs(input);
  let score = 100;
  score -= missingCritical.length * 30;

  for (const f of IMPORTANT_NUMERIC_FIELDS) {
    if (!present(input[f] as number | undefined)) score -= 5;
  }
  if (!riskLevelPresent(input.riskLevel)) score -= 5;

  if (!isValidCurrency(input.currency)) score -= 10;

  const staleDays = opts.staleDays ?? 60;
  const stale = opts.now ? isStaleSnapshot(input.periodEnd, opts.now, staleDays) : false;
  if (stale) score -= 15;

  return { dataConfidenceScore: clampScore(score), missingCritical, isStale: stale };
}
