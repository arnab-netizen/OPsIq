/**
 * Owner Strategy & Scenario Planning (Module 8) — deterministic thresholds.
 *
 * Generic defaults that work for any owner-operated business, with optional
 * per-industry-TEMPLATE overrides. Templates are generic business CATEGORIES
 * (e.g. "laundry_local_service"), never a specific named business. Unknown
 * templates fall back to the generic defaults.
 */
import type { StrategyRiskLevel } from "./types";

export interface StrategyThresholds {
  // Annual ROI on the investment (%)
  strongRoiPct: number;
  lowRoiPct: number;
  criticalRoiPct: number;
  // Payback period (months)
  longPaybackMonths: number;
  criticalPaybackMonths: number;
  // Affordability (cashAvailable / investment)
  minAffordabilityRatio: number;
  criticalAffordabilityRatio: number;
  // Cash left after the investment, as a share of the investment, below which the option
  // "uses (nearly) all the cash" and a reserve becomes a condition of going ahead.
  lowReserveRatio: number;
  // Data freshness
  staleSnapshotDays: number;
}

// Provenance: INTERNAL_HEURISTIC (generic defaults); template overrides below are INDUSTRY_TEMPLATE with no recorded
// source for the exact numbers — see docs/opsiq/architecture/OWNER_THRESHOLD_PROVENANCE.md. Values are unchanged.
export const GENERIC_STRATEGY_THRESHOLDS: StrategyThresholds = {
  strongRoiPct: 100,
  lowRoiPct: 20,
  criticalRoiPct: 0,
  longPaybackMonths: 18,
  criticalPaybackMonths: 36,
  minAffordabilityRatio: 1.0,
  criticalAffordabilityRatio: 0.5,
  lowReserveRatio: 0.1,
  staleSnapshotDays: 60,
};

/**
 * Per-industry-template overrides (generic categories). Local same-day service
 * businesses run thin on cash, so the payback bar is tighter and a stronger ROI
 * is expected before a capital commitment is "strong".
 */
export const INDUSTRY_STRATEGY_THRESHOLDS: Record<string, Partial<StrategyThresholds>> = {
  laundry_local_service: {
    longPaybackMonths: 12,
    criticalPaybackMonths: 24,
    strongRoiPct: 120,
  },
  generic_local_service: {
    longPaybackMonths: 15,
  },
  retail_service_hybrid: {
    criticalPaybackMonths: 30,
  },
};

/** Resolve thresholds for an industry template, falling back to generic defaults. */
export function resolveStrategyThresholds(industryTemplate?: string): StrategyThresholds {
  const overrides = industryTemplate ? INDUSTRY_STRATEGY_THRESHOLDS[industryTemplate] : undefined;
  return { ...GENERIC_STRATEGY_THRESHOLDS, ...(overrides ?? {}) };
}

/** Downside/upside spread applied to the revenue change by qualitative risk level. */
export const RISK_LEVEL_SPREAD: Record<StrategyRiskLevel, number> = {
  low: 0.2,
  medium: 0.4,
  high: 0.6,
};

/** Baseline option-risk contribution by qualitative risk level. */
export const RISK_LEVEL_BASE_SCORE: Record<StrategyRiskLevel, number> = {
  low: 20,
  medium: 45,
  high: 70,
};
