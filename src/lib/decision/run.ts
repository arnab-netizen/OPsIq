import { normalizeMoney } from "@/lib/finance/normalize";

export interface NormalizedDecisionInput {
  revenue: number;
  cost: number;
  revenueChange: number;
  costChange: number;
  currency?: string;
  baseCurrency?: string;
  fxRates?: Record<string, number>;
  confidence: number;
}

export interface NormalizedDecisionMetrics {
  baselineRevenue: number;
  baselineCost: number;
  revenueChange: number;
  costChange: number;
  confidence: number;
  originalCurrency: string;
  baseCurrency: string;
}

/**
 * Normalize financial inputs before decision engine processing.
 * Converts all revenue/cost values to base currency (INR) using FX rates.
 * All downstream calculations use baseAmount (normalized values).
 *
 * Rules:
 * - Input currency defaults to 'INR'
 * - Base currency is always 'INR'
 * - FX rates required for non-INR currencies
 * - All raw revenue/cost values are normalized before use
 * - No raw values are used in downstream calculations
 */
export function normalizeDecisionInput(
  input: NormalizedDecisionInput,
  fxRates: Record<string, number> = {}
): NormalizedDecisionMetrics {
  // FAIL-CLOSED: Require all decision inputs explicitly
  if (!Number.isFinite(input.confidence)) {
    throw new Error("Missing required field: confidence must be a number");
  }

  if (!Number.isFinite(input.revenueChange)) {
    throw new Error("Missing required field: revenueChange must be a number");
  }

  if (!Number.isFinite(input.costChange)) {
    throw new Error("Missing required field: costChange must be a number");
  }

  const currency = input.currency || "INR";
  const baseCurrency = input.baseCurrency || "INR";

  // Ensure base currency is INR
  if (baseCurrency !== "INR") {
    throw new Error("Base currency must be INR");
  }

  // FAIL-CLOSED: Require FX rates for non-base currencies
  if (currency !== "INR" && (!fxRates || !fxRates[currency])) {
    throw new Error(
      `Missing FX rate for currency ${currency}. Provide fxRates: { "${currency}": rate }`
    );
  }

  // Normalize revenue (baseline)
  const normalizedRevenue = normalizeMoney({
    amount: input.revenue,
    currency,
    baseCurrency,
    fxRates,
  });

  // Normalize cost (baseline)
  const normalizedCost = normalizeMoney({
    amount: input.cost,
    currency,
    baseCurrency,
    fxRates,
  });

  // Normalize revenue change (user-provided, must not be defaulted)
  const normalizedRevenueChange = normalizeMoney({
    amount: input.revenueChange,
    currency,
    baseCurrency,
    fxRates,
  });

  // Normalize cost change (user-provided, must not be defaulted)
  const normalizedCostChange = normalizeMoney({
    amount: input.costChange,
    currency,
    baseCurrency,
    fxRates,
  });

  return {
    baselineRevenue: normalizedRevenue.baseAmount,
    baselineCost: normalizedCost.baseAmount,
    revenueChange: normalizedRevenueChange.baseAmount,
    costChange: normalizedCostChange.baseAmount,
    confidence: input.confidence,
    originalCurrency: currency,
    baseCurrency,
  };
}

/**
 * Validate normalized metrics before use in decision engine.
 * Ensures all values are in base currency and valid.
 */
export function validateNormalizedMetrics(
  metrics: NormalizedDecisionMetrics
): void {
  if (!Number.isFinite(metrics.baselineRevenue) || metrics.baselineRevenue < 0) {
    throw new Error("Invalid normalized revenue: must be non-negative number");
  }

  if (!Number.isFinite(metrics.baselineCost) || metrics.baselineCost < 0) {
    throw new Error("Invalid normalized cost: must be non-negative number");
  }

  if (!Number.isFinite(metrics.revenueChange)) {
    throw new Error("Invalid revenue change: must be a finite number");
  }

  if (!Number.isFinite(metrics.costChange)) {
    throw new Error("Invalid cost change: must be a finite number");
  }

  if (metrics.baseCurrency !== "INR") {
    throw new Error("Base currency must be INR");
  }

  const impact = metrics.revenueChange - metrics.costChange;
  if (impact <= 0) {
    throw new Error("NON_POSITIVE_IMPACT_BLOCKED");
  }
}
