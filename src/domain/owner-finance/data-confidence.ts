/**
 * Owner Finance (Module 2) — data confidence + currency validation.
 *
 * Deterministic and honest: confidence drops as inputs go missing, and missing
 * critical inputs are listed explicitly. Nothing is invented. Pure (no I/O).
 */
import { clampScore } from "@/domain/owner-spine/contracts";
import type { FinancialSnapshotInput } from "./types";

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
 * Critical inputs: without these, a financial diagnosis is largely guesswork.
 * "Has cost info" is satisfied by any direct cost component.
 */
export function missingCriticalFinanceInputs(input: FinancialSnapshotInput): string[] {
  const missing: string[] = [];
  if (!present(input.revenue)) missing.push("revenue");
  const hasCost =
    present(input.costOfGoodsOrServices) ||
    present(input.fixedCosts) ||
    present(input.variableCosts) ||
    present(input.rent) ||
    present(input.salaryPayroll) ||
    present(input.utilities);
  if (!hasCost) missing.push("costs");
  if (!present(input.cashOnHand)) missing.push("cashOnHand");
  return missing;
}

const IMPORTANT_FIELDS: (keyof FinancialSnapshotInput)[] = [
  "costOfGoodsOrServices",
  "fixedCosts",
  "salaryPayroll",
  "loanEmiDebtPayments",
  "receivables",
  "payables",
  "ownerWithdrawals",
  "orderCount",
  "customerCount",
  "discountAmount",
  "refundAmount",
];

export type MissingInputPriority = "CRITICAL" | "IMPORTANT";

export interface MissingInput {
  field: string;
  priority: MissingInputPriority;
}

export interface DataConfidenceResult {
  dataConfidenceScore: number; // 0..100
  missingCritical: string[];
  isStale: boolean;
}

const CRITICAL_FIELDS = new Set(["revenue", "costs", "cashOnHand"]);

/**
 * Classify a missing finance input field by priority tier.
 * CRITICAL: diagnosis is unreliable without it.
 * IMPORTANT: diagnosis is less accurate without it.
 */
export function missingInputPriority(field: string): MissingInputPriority {
  return CRITICAL_FIELDS.has(field) ? "CRITICAL" : "IMPORTANT";
}

/**
 * Compute both CRITICAL and IMPORTANT missing inputs from a snapshot row.
 * Operates on raw snapshot DB fields (camelCase Prisma names).
 */
export function computeMissingInputsWithPriority(snapshot: Record<string, unknown>): MissingInput[] {
  const result: MissingInput[] = [];

  function miss(v: unknown): boolean {
    return v === null || v === undefined || (typeof v === "number" && !Number.isFinite(v));
  }

  // Critical fields
  if (miss(snapshot.revenue)) result.push({ field: "revenue", priority: "CRITICAL" });
  const hasCost = !miss(snapshot.costOfGoods) || !miss(snapshot.fixedCosts) ||
    !miss(snapshot.variableCosts) || !miss(snapshot.rent) ||
    !miss(snapshot.payroll) || !miss(snapshot.utilities);
  if (!hasCost) result.push({ field: "costs", priority: "CRITICAL" });
  if (miss(snapshot.cashOnHand)) result.push({ field: "cashOnHand", priority: "CRITICAL" });

  // Important fields
  const importantChecks: [string, string][] = [
    ["costOfGoods", "costOfGoods"],
    ["fixedCosts", "fixedCosts"],
    ["payroll", "payroll"],
    ["debtPayments", "debtPayments"],
    ["receivables", "receivables"],
    ["payables", "payables"],
    ["ownerWithdrawals", "ownerWithdrawals"],
    ["orderCount", "orderCount"],
    ["customerCount", "customerCount"],
    ["discountAmount", "discountAmount"],
    ["refundReworkCost", "refundReworkCost"],
  ];
  for (const [snapshotKey, label] of importantChecks) {
    if (miss(snapshot[snapshotKey])) result.push({ field: label, priority: "IMPORTANT" });
  }

  return result;
}

/** Whether the reporting period ended more than `staleDays` before `now`. */
export function isStaleSnapshot(periodEnd: string, now: Date, staleDays: number): boolean {
  const end = new Date(periodEnd).getTime();
  if (Number.isNaN(end)) return true; // unparseable date treated as stale (fail-closed)
  const ageDays = (now.getTime() - end) / (1000 * 60 * 60 * 24);
  return ageDays > staleDays;
}

/**
 * Confidence starts at 100 and is reduced by: 30 per missing critical input,
 * 5 per missing important field, 10 if currency is invalid, and 15 if the
 * snapshot is stale. Clamped to [0, 100].
 */
export function calculateDataConfidence(
  input: FinancialSnapshotInput,
  opts: { now?: Date; staleDays?: number } = {}
): DataConfidenceResult {
  const missingCritical = missingCriticalFinanceInputs(input);
  let score = 100;
  score -= missingCritical.length * 30;

  for (const f of IMPORTANT_FIELDS) {
    if (!present(input[f] as number | undefined)) score -= 5;
  }

  if (!isValidCurrency(input.currency)) score -= 10;

  const staleDays = opts.staleDays ?? 45;
  const stale = opts.now ? isStaleSnapshot(input.periodEnd, opts.now, staleDays) : false;
  if (stale) score -= 15;

  return { dataConfidenceScore: clampScore(score), missingCritical, isStale: stale };
}
