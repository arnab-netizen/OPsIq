"use client";

/** Controlled currency choice built from the one supported set (domain/founder-recovery/currency.ts). Presentation only. */
import { Select } from "@/ui/primitives";
import { SUPPORTED_BUSINESS_CURRENCIES } from "@/domain/founder-recovery/currency";

const OPTIONS = SUPPORTED_BUSINESS_CURRENCIES.map((c) => ({ value: c, label: c }));

export function CurrencySelect({ name = "currency", label = "Currency", defaultValue = "INR" }: { name?: string; label?: string; defaultValue?: string }) {
  return <Select name={name} label={label} required defaultValue={defaultValue} options={OPTIONS} />;
}
