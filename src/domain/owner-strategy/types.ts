/**
 * Owner Strategy & Scenario Planning (Module 8) — shared types for the
 * deterministic scenario engine.
 *
 * Pure types only: no DB, no I/O, no LLM. A snapshot here is ONE strategic option
 * (add staff, buy equipment, raise price, open a branch, cut costs, target B2B…)
 * described by its scenario inputs. Every input is optional at the type level; the
 * engine treats missing/invalid numbers as `null` (missing) and never invents a
 * value. `null` on a derived output means "not computable from the provided data".
 * Strategy is a decision-support domain: it scores how good and how safe an option
 * is, so the spine can surface the best safe move.
 */

export const STRATEGY_BUSINESS_MODELS = ["service", "inventory", "hybrid"] as const;
export type StrategyBusinessModel = (typeof STRATEGY_BUSINESS_MODELS)[number];

/** Owner-supplied qualitative execution risk of the option. */
export const STRATEGY_RISK_LEVELS = ["low", "medium", "high"] as const;
export type StrategyRiskLevel = (typeof STRATEGY_RISK_LEVELS)[number];

/** Option attractiveness, strongest-go to avoid. */
export const STRATEGY_STATES = ["STRONG_GO", "GO", "MARGINAL", "RISKY", "AVOID"] as const;
export type StrategyState = (typeof STRATEGY_STATES)[number];

/** Decision-class hierarchy for a scenario. */
export const STRATEGY_TIERS = ["avoid", "caution", "consider", "pursue"] as const;
export type StrategyTier = (typeof STRATEGY_TIERS)[number];

/** Raw scenario inputs entered by the owner for ONE strategic option. */
export interface StrategySnapshotInput {
  periodStart: string; // ISO date — when the option was assessed
  periodEnd: string; // ISO date
  currency: string;
  businessModel?: StrategyBusinessModel;
  industryTemplate?: string;

  optionName?: string; // label only (e.g. "Open second branch"); not used in math

  currentRevenue?: number; // current monthly revenue (baseline)
  expectedRevenueChange?: number; // monthly revenue delta if pursued (can be negative)
  costChange?: number; // monthly cost delta if pursued (positive = more cost, negative = savings)
  investmentRequired?: number; // upfront one-time cash needed
  timeToImpactMonths?: number; // collected but NOT yet used by any metric/rule (known limitation)
  riskLevel?: StrategyRiskLevel;
  cashAvailable?: number;
  capacityImpactPct?: number; // how much spare capacity it consumes (informational)
  staffImpact?: number; // net staff added (informational)

  notes?: string;
}

/**
 * Full-precision scenario economics — the ONLY values business rules (verdict, findings,
 * composite scores) may compare against thresholds. `null` = not computable. Monthly amounts are
 * per month in the snapshot currency; ROI is an annual %; payback is in months; affordability is
 * cash ÷ investment. Invariant: worstMonthlyProfitDelta ≤ baseMonthlyProfitDelta ≤
 * bestMonthlyProfitDelta whenever all three are computable.
 */
export interface StrategyRawMetrics {
  baseMonthlyProfitDelta: number | null;
  bestMonthlyProfitDelta: number | null;
  worstMonthlyProfitDelta: number | null;
  roiAnnualPct: number | null;
  paybackMonths: number | null;
  affordabilityRatio: number | null;
}

/**
 * Deterministic derived scenario economics. Money/period outputs are
 * `number | null` (`null` = not computable). Composite scores are always
 * `0..100`; their trustworthiness is carried by `dataConfidenceScore`.
 */
export interface StrategyDerivedMetrics {
  currency: string;
  currencyValid: boolean;

  // Display values (raw values rounded for presentation: money/ROI/payback to 1 dp,
  // affordability to 2 dp). Never compare these against a threshold — use `raw`.
  baseMonthlyProfitDelta: number | null; // monthly: expectedRevenueChange - costChange
  bestMonthlyProfitDelta: number | null; // monthly: higher of the two revenue-spread outcomes
  worstMonthlyProfitDelta: number | null; // monthly: lower of the two revenue-spread outcomes
  roiAnnualPct: number | null; // (base*12 / investment) * 100; null when no investment
  paybackMonths: number | null; // investment / base; 0 when no investment; null when it never pays back
  cashRequirement: number | null; // investment required
  affordabilityRatio: number | null; // cashAvailable / investment
  breakEvenRevenueDelta: number | null; // monthly revenue rise needed to cover the cost change
  raw: StrategyRawMetrics; // full-precision decision values (see StrategyRawMetrics)

  strategyHealthScore: number; // 0..100 (attractiveness = safe upside)
  strategyRiskScore: number; // 0..100 (financial/execution risk of the option)
  strategyOpportunityScore: number; // 0..100 (upside magnitude)
  dataConfidenceScore: number; // 0..100

  strategyState: StrategyState;
  strategyTier: StrategyTier;

  missingRequiredInputs: string[];
}
