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

/**
 * Format a non-negative magnitude; callers phrase the sign ("loses", "short"). `fractionDigits`
 * forces a precision (so amounts compared in one sentence are shown alike); by default amounts of
 * 100 or more are whole units and smaller non-whole amounts keep 2 decimals. Currencies without
 * minor units (e.g. JPY) never show decimals.
 */
export function formatStrategyMoney(amount: number, currency: string, fractionDigits?: number): string {
  const abs = Math.abs(amount);
  const maxDigits = currencyMinorDigits(currency);
  if (maxDigits > 0 && abs > 0 && abs < 0.005) return `less than ${formatWithDigits(0.01, currency, 2)}`;
  const digits = fractionDigits ?? (abs >= 100 || Number.isInteger(abs) ? 0 : 2);
  return formatWithDigits(abs, currency, Math.min(digits, maxDigits));
}

/** "about ₹18,000", or "less than ₹0.01" for a sub-paisa amount (never "about less than"). */
export function aboutStrategyMoney(amount: number, currency: string, fractionDigits?: number): string {
  const text = formatStrategyMoney(amount, currency, fractionDigits);
  return text.startsWith("less than") ? text : `about ${text}`;
}

/** Minor-unit digits of a currency (2 for INR/USD, 0 for JPY); 2 when the code is not valid. */
function currencyMinorDigits(currency: string): number {
  const code = (currency ?? "").trim().toUpperCase();
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: code }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
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
 * Months as given ("8 months", "18.0001 months", "1 month"). The caller passes a value that is
 * already rounded for display and consistent with the rule it explains (ruleConsistentValue), so
 * no further rounding happens here that could move it across a threshold.
 */
export function formatStrategyMonths(months: number): string {
  const text = String(Number(months.toPrecision(8)));
  return `${text} ${months === 1 ? "month" : "months"}`;
}

/** "in about 8 months", or "in less than a month". */
export function inAboutStrategyMonths(months: number): string {
  return months < 1 ? "in less than a month" : `in about ${formatStrategyMonths(months)}`;
}
