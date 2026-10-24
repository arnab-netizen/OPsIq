/**
 * Owner Cashflow (Module 5) — data confidence + currency validation.
 *
 * Deterministic and honest: confidence drops as inputs go missing, and missing
 * critical inputs are listed explicitly. Nothing is invented. Pure (no I/O).
 */
import { clampScore } from "@/domain/owner-spine/contracts";
import { cashflowCashPositionMissingComponents } from "@/domain/owner-finance/liquidity";
import type { CashflowSnapshotInput } from "./types";

/** A finite, present number (missing/NaN/Infinity → not present). */
function present(x: number | undefined | null): boolean {
  return x !== undefined && x !== null && Number.isFinite(x);
}

/**
 * Currency is valid when it is a 3–8 character alphabetic code (e.g. "INR",
 * "USD"). Empty/numeric/over-long values are invalid (fail closed).
 */
export function isValidCurrency(currency: string | undefined | null): boolean {
  if (typeof currency !== "string") return false;
  return /^[A-Za-z]{3,8}$/.test(currency.trim());
}

/**
 * Critical inputs: without these, a cashflow diagnosis is largely guesswork.
 * The cash position is complete only when BOTH cash in hand and the bank balance are known (a known 0 is known);
 * each unknown component is listed by its own field name so the owner knows exactly what to enter. "Has
 * obligations" is satisfied by any near-term due; collections drives runway/collection metrics.
 */
export function missingCriticalCashflowInputs(input: CashflowSnapshotInput): string[] {
  const missing: string[] = [];
  missing.push(...cashflowCashPositionMissingComponents(input));
  const hasObligations =
    present(input.upcomingEmi) ||
    present(input.rentDue) ||
    present(input.salaryDue) ||
    present(input.vendorDue) ||
    present(input.taxDue) ||
    present(input.ownerWithdrawal);
  if (!hasObligations) missing.push("nearTermObligations");
  if (!present(input.dailyCollections)) missing.push("dailyCollections");
  return missing;
}

const CASH_POSITION_FIELDS: ReadonlySet<string> = new Set(["cashInHand", "bankBalance"]);

/**
 * How many critical REQUIREMENTS the missing list represents: the cash position is one requirement however many of
 * its two components are unknown (so one gap is never double-penalised).
 */
export function criticalRequirementCount(missing: readonly string[]): number {
  const cash = missing.some((k) => CASH_POSITION_FIELDS.has(k)) ? 1 : 0;
  return cash + missing.filter((k) => !CASH_POSITION_FIELDS.has(k)).length;
}

/** Owner-facing name of a missing cash-position component. */
export const CASH_POSITION_FIELD_LABEL: Readonly<Record<string, string>> = { cashInHand: "cash in hand", bankBalance: "bank balance" };

const IMPORTANT_FIELDS: (keyof CashflowSnapshotInput)[] = [
  "receivables",
  "receivablesOverdue",
  "payables",
  "payablesOverdue",
  "upcomingEmi",
  "rentDue",
  "salaryDue",
  "vendorDue",
  "taxDue",
  "ownerWithdrawal",
];

export interface DataConfidenceResult {
  dataConfidenceScore: number; // 0..100
  missingCritical: string[];
  isStale: boolean;
}

/** Whether the reporting period ended more than `staleDays` before `now`. */
export function isStaleSnapshot(periodEnd: string, now: Date, staleDays: number): boolean {
  const end = new Date(periodEnd).getTime();
  if (Number.isNaN(end)) return false;
  const ageDays = (now.getTime() - end) / (1000 * 60 * 60 * 24);
  return ageDays > staleDays;
}

/**
 * Confidence starts at 100 and is reduced by: 30 per missing critical input,
 * 5 per missing important field, 10 if currency is invalid, and 15 if the
 * snapshot is stale. Clamped to [0, 100].
 */
export function calculateDataConfidence(
  input: CashflowSnapshotInput,
  opts: { now?: Date; staleDays?: number } = {}
): DataConfidenceResult {
  const missingCritical = missingCriticalCashflowInputs(input);
  let score = 100;
  score -= criticalRequirementCount(missingCritical) * 30;

  for (const f of IMPORTANT_FIELDS) {
    if (!present(input[f] as number | undefined)) score -= 5;
  }

  if (!isValidCurrency(input.currency)) score -= 10;

  const staleDays = opts.staleDays ?? 30;
  const stale = opts.now ? isStaleSnapshot(input.periodEnd, opts.now, staleDays) : false;
  if (stale) score -= 15;

  return { dataConfidenceScore: clampScore(score), missingCritical, isStale: stale };
}
