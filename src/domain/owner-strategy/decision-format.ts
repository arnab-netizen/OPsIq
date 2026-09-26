/**
 * Owner Strategy — owner-facing number formatting for decision copy. Pure (Intl only).
 *
 * Money uses the currency's own locale grouping (INR → en-IN: ₹1,50,000). Amounts of 100 or
 * more are shown in whole units ("about ₹18,000"); smaller non-zero amounts keep 2 decimals so
 * a real shortfall or gain never displays as "₹0". Invalid currency codes fall back to
 * "CODE 1,234" instead of throwing.
 */

const CURRENCY_LOCALE: Record<string, string> = { INR: "en-IN" };

function localeFor(currency: string): string {
  return CURRENCY_LOCALE[currency.toUpperCase()] ?? "en-US";
}

/** Format a non-negative magnitude; callers phrase the sign ("loses", "short"). */
export function formatStrategyMoney(amount: number, currency: string): string {
  const abs = Math.abs(amount);
  if (abs > 0 && abs < 0.005) return `less than ${formatWithDigits(0.01, currency, 2)}`;
  const fractionDigits = abs >= 100 || Number.isInteger(abs) ? 0 : 2;
  return formatWithDigits(abs, currency, fractionDigits);
}

function formatWithDigits(abs: number, currency: string, fractionDigits: number): string {
  const code = (currency ?? "").trim().toUpperCase();
  try {
    return new Intl.NumberFormat(localeFor(code), {
      style: "currency",
      currency: code,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(abs);
  } catch {
    const n = abs.toLocaleString("en-US", {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });
    return code ? `${code} ${n}` : n;
  }
}

/**
 * Months as given ("8.3 months", "1 month", "under a month"). The caller passes a value that is
 * already rounded for display and consistent with the rule it explains (ruleConsistentValue), so
 * no further rounding happens here that could move it across a threshold.
 */
export function formatStrategyMonths(months: number): string {
  if (months < 1) return "under a month";
  const text = String(Number(months.toPrecision(8)));
  return `${text} ${months === 1 ? "month" : "months"}`;
}
