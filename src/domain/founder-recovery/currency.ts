/**
 * The ONE supported business-currency set (pure). Every path that stores or accepts a business/snapshot currency —
 * the generic New Business form, first-run, metric snapshots — validates against it server-side; the UI dropdowns
 * are built from it so the two can never drift. Codes are ISO 4217 alphabetic codes.
 *
 * Input is normalised (trim + upper-case) before the membership test, so " inr " is accepted as "INR"; anything
 * not in the set (free text, digits, wrong length, an unsupported ISO code) is rejected, never persisted.
 */
import { z } from "zod/v4";

export const SUPPORTED_BUSINESS_CURRENCIES = [
  "GBP", "USD", "EUR", "INR", "AUD", "CAD", "NZD", "SGD", "AED", "ZAR", "MYR", "IDR", "PHP", "NGN", "KES", "CHF", "JPY",
] as const;
export type SupportedBusinessCurrency = (typeof SUPPORTED_BUSINESS_CURRENCIES)[number];

export const CURRENCY_INVALID_MESSAGE = "Choose a supported currency code, for example INR, USD or GBP";

/** The canonical code for a supported currency, else null. */
export function normalizeBusinessCurrency(value: unknown): SupportedBusinessCurrency | null {
  if (typeof value !== "string") return null;
  const code = value.trim().toUpperCase();
  return (SUPPORTED_BUSINESS_CURRENCIES as readonly string[]).includes(code) ? (code as SupportedBusinessCurrency) : null;
}

/** Zod field: normalises, then requires a supported code. Output type is the canonical code. */
export const businessCurrencySchema = z
  .string({ message: "Currency is required" })
  .transform((v) => v.trim().toUpperCase())
  .refine((v) => v.length > 0, "Currency is required")
  .refine((v) => v.length === 0 || (SUPPORTED_BUSINESS_CURRENCIES as readonly string[]).includes(v), CURRENCY_INVALID_MESSAGE)
  .transform((v) => v as SupportedBusinessCurrency);
