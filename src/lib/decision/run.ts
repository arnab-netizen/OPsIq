import { normalizeMoney } from "@/lib/finance/normalize";

export interface NormalizedDecisionInput {
  revenue: number;
  cost: number;
  currency?: string;
  baseCurrency?: string;
  fxRates?: Record<string, number>;
  confidence: number;
  risk?: number;
}

export interface NormalizedDecisionMetrics {
  baselineRevenue: number;
  baselineCost: number;
  revenueChange: number;
  costChange: number;
  confidence: number;
  risk?: number;
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
  const currency = input.currency || "INR";
  const baseCurrency = input.baseCurrency || "INR";

  // Ensure base currency is INR
  if (baseCurrency !== "INR") {
    throw new Error("Base currency must be INR");
  }

  // Normalize revenue
  const normalizedRevenue = normalizeMoney({
    amount: input.revenue,
    currency,
    baseCurrency,
    fxRates,
  });

  // Normalize cost
  const normalizedCost = normalizeMoney({
    amount: input.cost,
    currency,
    baseCurrency,
    fxRates,
  });

  // Calculate deltas (assuming 10% revenue change, 5% cost change)
  // These are also normalized to base currency
  const revenueChange = normalizedRevenue.baseAmount * 0.1;
  const costChange = normalizedCost.baseAmount * 0.05;

  return {
    baselineRevenue: normalizedRevenue.baseAmount,
    baselineCost: normalizedCost.baseAmount,
    revenueChange,
    costChange,
    confidence: input.confidence,
    risk: input.risk,
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
