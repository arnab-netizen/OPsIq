/**
 * Owner Finance — QUICK ENTRY (the minimum-effort first financial picture).
 *
 * Pure parsing/payload/assessment for the four numbers an owner can give OpsIQ to unlock a first read:
 * revenue, fixed costs, variable/direct costs and cash available. No I/O, no UI.
 *
 * Semantics (tested, identical to Finance's own data-confidence rules):
 *   - blank = UNKNOWN (omitted from the payload — never sent as 0);
 *   - "0" = a KNOWN zero (sent as 0 and counted as present evidence);
 *   - anything that is not a plain non-negative number is an inline error, never coerced;
 *   - estimates are accepted as-is — no note, no evidence reference, no "this is an estimate" flag is
 *     required, and nothing is inferred (no total→fixed/variable split, no currency guess).
 * Whether the numbers suffice for a first read is NOT decided here: it is asked of the canonical
 * `evaluateFirstReadSufficiency`, the same rule onboarding, My Business and Start Here consume.
 */
import type { EvidenceQuality } from "./evidence-quality";
import {
  evaluateFirstReadSufficiency,
  type FirstReadSufficiency,
} from "@/domain/owner-finance/first-read-sufficiency";

/**
 * The ONE owner-facing meaning of the Finance `cashOnHand` field: PHYSICAL cash the business holds
 * outside the bank (till, safe, petty cash). Bank money is a separate fact (`bankBalance`, a Cashflow
 * snapshot value the Finance diagnosis adds to `cashOnHand` as total liquid funds), so telling an owner
 * to put "cash and bank" here would double-count once a real bank balance is also recorded. Every
 * surface that asks for `cashOnHand` (quick start, Money's full form, Guided setup) reads this.
 */
export const CASH_IN_HAND_COPY = {
  label: "Cash in hand",
  hint: "Physical cash the business holds outside the bank (till, safe). Don't include money in the bank: that is a separate figure. If there is none, enter 0 — OpsIQ won't read that as having no money, only as no cash on hand.",
} as const;

/** The separate bank figure (written to Cashflow, never to the Finance snapshot). */
export const BANK_BALANCE_COPY = {
  label: "Money in the bank",
  hint: "Bank balance right now, across all accounts. Optional. If you already track this in Cashflow for this month, enter it only there or only here — never both, or it is counted twice.",
} as const;

export const QUICK_ENTRY_FIELDS = [
  { name: "revenue", label: "Revenue", hint: "Roughly how much you sold in the period." },
  { name: "fixedCosts", label: "Fixed costs", hint: "Costs that stay about the same each month, like rent and wages." },
  { name: "variableCosts", label: "Variable / direct costs", hint: "Costs that rise and fall with sales, like materials or delivery." },
  { name: "cashOnHand", label: CASH_IN_HAND_COPY.label, hint: CASH_IN_HAND_COPY.hint },
] as const;

export type QuickEntryFieldName = (typeof QUICK_ENTRY_FIELDS)[number]["name"];
export type QuickEntryDraft = Partial<Record<QuickEntryFieldName, string>>;

export type QuickAmount =
  | { kind: "blank" }
  | { kind: "value"; value: number }
  | { kind: "invalid"; message: string };

const PLAIN_NUMBER = /^\d+(\.\d+)?$/;
/** Matches the server-side ceiling on any money figure (validation.ts). */
const MAX_QUICK_AMOUNT = 1e12;

/** Blank → unknown; "0" → known zero; a plain non-negative number → value; anything else → inline error. */
export function parseQuickAmount(raw: string | null | undefined): QuickAmount {
  const text = (raw ?? "").trim();
  if (text === "") return { kind: "blank" };
  if (text.startsWith("-")) return { kind: "invalid", message: "This can't be negative. Enter 0 if there was none." };
  // Phones autofill "£1,500" / "$ 1 500": a leading currency symbol and REAL thousands grouping are not part of the
  // number. Anything else with a comma or space ("1,5", "1.500,50", "15 00") is ambiguous (it may be a European
  // decimal) and is refused rather than guessed — a silently mis-read amount is worse than a retry.
  const unsigned = text.replace(/^[$£€₹¥]\s*/, "");
  // "0,500" is 500 in a thousands-grouping reading and 0.5 in a comma-decimal one; a real thousands group never starts with
  // zero, so a leading-zero first group is refused rather than guessed (the sibling "0.500" is unambiguous: 0.5).
  if (/^0\d*,/.test(unsigned)) return { kind: "invalid", message: "Enter the number without commas, like 500 or 0.5." };
  const grouped =
    /^\d{1,3}(,\d{3})+(\.\d+)?$/.test(unsigned) || // 1,500,000
    /^\d{1,2}(,\d{2})*,\d{3}(\.\d+)?$/.test(unsigned) || // 15,00,000 (Indian grouping)
    /^\d{1,3}( \d{3})+(\.\d+)?$/.test(unsigned); // 1 500 000
  if (/[,\s]/.test(unsigned) && !grouped) return { kind: "invalid", message: "Enter a number, like 150000." };
  // "1.500" / "12.345": a lone dot followed by exactly three digits after 1-3 leading digits is a decimal in one
  // locale and a thousands separator in another, and the browser locale is deliberately not guessed. Refuse it and
  // ask for the plain number ("1500" or "1.5"). "0.500", "1.50", "1500.00" and "1234.567" cannot be read two ways.
  if (/^[1-9]\d{0,2}\.\d{3}$/.test(unsigned)) {
    return { kind: "invalid", message: "Enter the number without a dot as a thousands separator, like 1500." };
  }
  const normalised = grouped ? unsigned.replace(/[,\s]/g, "") : unsigned;
  if (!PLAIN_NUMBER.test(normalised)) return { kind: "invalid", message: "Enter a number, like 150000." };
  const value = Number(normalised);
  if (Number.isFinite(value) && value > MAX_QUICK_AMOUNT) return { kind: "invalid", message: "That number is too large. Enter a smaller amount." };
  if (!Number.isFinite(value)) return { kind: "invalid", message: "Enter a number, like 150000." };
  return { kind: "value", value };
}

export interface QuickEntryAssessment {
  /** Per-field inline errors (only fields with invalid text). */
  errors: Partial<Record<QuickEntryFieldName, string>>;
  /** Known numeric values only — blank fields are absent, known zeros are present. */
  values: Partial<Record<QuickEntryFieldName, number>>;
  /** True when no field was given a value (blank everywhere). */
  nothingEntered: boolean;
  /** Canonical sufficiency of exactly what was entered (null while any field is invalid). */
  sufficiency: FirstReadSufficiency | null;
}

export function assessQuickEntry(draft: QuickEntryDraft): QuickEntryAssessment {
  const errors: QuickEntryAssessment["errors"] = {};
  const values: QuickEntryAssessment["values"] = {};
  for (const field of QUICK_ENTRY_FIELDS) {
    const parsed = parseQuickAmount(draft[field.name]);
    if (parsed.kind === "invalid") errors[field.name] = parsed.message;
    else if (parsed.kind === "value") values[field.name] = parsed.value;
  }
  const hasErrors = Object.keys(errors).length > 0;
  return {
    errors,
    values,
    nothingEntered: Object.keys(values).length === 0 && !hasErrors,
    sufficiency: hasErrors ? null : evaluateFirstReadSufficiency(values),
  };
}

export interface QuickSnapshotPayload {
  periodStart: string;
  periodEnd: string;
  currency: string;
  revenue?: number;
  fixedCosts?: number;
  variableCosts?: number;
  cashOnHand?: number;
  /** Provenance of the numbers; omitted when the owner did not say (stored as unspecified, never as actual). */
  evidenceQuality?: EvidenceQuality;
}

/**
 * The body for the existing governed `POST …/snapshots`. Currency is the selected business's own — a
 * missing one is refused here rather than silently replaced (no contradictory business/snapshot
 * currency). Only known values are included.
 */
export function buildQuickSnapshotPayload(args: {
  values: QuickEntryAssessment["values"];
  period: { start: string; end: string };
  currency: string | null | undefined;
  evidenceQuality?: EvidenceQuality | null;
}): { ok: true; payload: QuickSnapshotPayload } | { ok: false; reason: "currency_missing" | "nothing_entered" } {
  const currency = (args.currency ?? "").trim();
  if (!currency) return { ok: false, reason: "currency_missing" };
  if (Object.keys(args.values).length === 0) return { ok: false, reason: "nothing_entered" };
  const payload: QuickSnapshotPayload = { periodStart: args.period.start, periodEnd: args.period.end, currency };
  if (args.evidenceQuality) payload.evidenceQuality = args.evidenceQuality;
  for (const field of QUICK_ENTRY_FIELDS) {
    const v = args.values[field.name];
    if (v !== undefined) payload[field.name] = v;
  }
  return { ok: true, payload };
}
