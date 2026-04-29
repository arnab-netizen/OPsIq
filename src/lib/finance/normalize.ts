/**
 * Financial Normalization Engine v2
 *
 * Converts multi-currency amounts to a base currency using deterministic FX rates.
 * Throws on missing rates (fail-closed). No defaults or assumptions.
 */

export type NormalizedMoney = {
  amount: number;
  currency: string;
  baseAmount: number;
  fxRate: number;
};

export function normalizeMoney(input: {
  amount: number;
  currency: string;
  baseCurrency: string;
  fxRates: Record<string, number>;
}): NormalizedMoney {
  // Fail-closed: require FX rate for the currency
  if (!input.fxRates[input.currency]) {
    throw new Error(`FX rate missing for currency: ${input.currency}`);
  }

  if (!input.fxRates[input.baseCurrency]) {
    throw new Error(`FX rate missing for base currency: ${input.baseCurrency}`);
  }

  // Get rates
  const sourceFxRate = input.fxRates[input.currency];
  const baseFxRate = input.fxRates[input.baseCurrency];

  // Convert to base currency
  // Logic: amount in source currency → base amount in base currency
  // baseAmount = amount / (sourceFxRate / baseFxRate)
  // which simplifies to: baseAmount = (amount * baseFxRate) / sourceFxRate
  const baseAmount = (input.amount * baseFxRate) / sourceFxRate;

  // Round to 4 decimal places for precision
  const roundedBaseAmount = Math.round(baseAmount * 10000) / 10000;
  const roundedFxRate = Math.round(sourceFxRate * 10000) / 10000;

  return {
    amount: input.amount,
    currency: input.currency,
    baseAmount: roundedBaseAmount,
    fxRate: roundedFxRate,
  };
}

/**
 * Normalize multiple money amounts to base currency.
 * Returns array of normalized amounts in same order.
 * Throws if any FX rate is missing.
 */
export function normalizeMoneyBatch(
  inputs: Array<{
    amount: number;
    currency: string;
    baseCurrency: string;
    fxRates: Record<string, number>;
  }>
): NormalizedMoney[] {
  return inputs.map((input) => normalizeMoney(input));
}

/**
 * Calculate total in base currency from multiple amounts.
 * All amounts must be convertible to same base currency.
 * Throws if any FX rate is missing.
 */
export function sumNormalizedMoney(
  amounts: Array<{
    amount: number;
    currency: string;
  }>,
  baseCurrency: string,
  fxRates: Record<string, number>
): NormalizedMoney {
  if (amounts.length === 0) {
    return {
      amount: 0,
      currency: baseCurrency,
      baseAmount: 0,
      fxRate: 1,
    };
  }

  let totalBaseAmount = 0;

  for (const amt of amounts) {
    const normalized = normalizeMoney({
      amount: amt.amount,
      currency: amt.currency,
      baseCurrency,
      fxRates,
    });
    totalBaseAmount += normalized.baseAmount;
  }

  // Round to 4 decimal places
  const roundedTotal = Math.round(totalBaseAmount * 10000) / 10000;

  return {
    amount: roundedTotal,
    currency: baseCurrency,
    baseAmount: roundedTotal,
    fxRate: 1, // Base currency has FX rate of 1
  };
}
