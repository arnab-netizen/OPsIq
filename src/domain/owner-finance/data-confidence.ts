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

export const IMPORTANT_FIELDS: (keyof FinancialSnapshotInput)[] = [
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

/**
 * Confidence tier — human-readable label derived from the numeric score.
 * HIGH (85–100): strong evidence, diagnosis reliable.
 * MEDIUM (60–84): usable evidence, minor gaps.
 * LOW (30–59): significant gaps; diagnosis directional only.
 * BLOCKED (<30): insufficient evidence; diagnosis should not be acted upon.
 */
export type ConfidenceTier = "HIGH" | "MEDIUM" | "LOW" | "BLOCKED";

export function confidenceTierFromScore(score: number): ConfidenceTier {
  if (score >= 85) return "HIGH";
  if (score >= 60) return "MEDIUM";
  if (score >= 30) return "LOW";
  return "BLOCKED";
}

/**
 * Freshness tier — age classification for the snapshot period end.
 * FRESH   < 30 days: reliable for current diagnosis.
 * AGING  30–45 days: near the staleness threshold.
 * STALE  45–90 days: stale; diagnosis may not reflect current conditions.
 * CRITICAL > 90 days: very stale; do not base decisions on this data.
 */
export type FreshnessTier = "FRESH" | "AGING" | "STALE" | "CRITICAL";

export function freshnessTierFromAge(ageDays: number): FreshnessTier {
  if (ageDays < 30) return "FRESH";
  if (ageDays < 45) return "AGING";
  if (ageDays < 90) return "STALE";
  return "CRITICAL";
}

export interface DataConfidenceResult {
  dataConfidenceScore: number;  // 0..100
  confidenceTier: ConfidenceTier;
  missingCritical: string[];
  isStale: boolean;
  ageDays: number | null;       // days since periodEnd; null if date unparseable
  freshnessTier: FreshnessTier | null; // null if date unparseable
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
 * Human-readable display labels for Prisma DB column names used in
 * computeMissingInputsWithPriority. These are the camelCase Prisma model
 * field names mapped to owner-friendly display strings.
 */
const DB_FIELD_DISPLAY_LABELS: Record<string, string> = {
  revenue: "Revenue",
  costs: "Costs (any cost component)",
  cashOnHand: "Cash on Hand",
  costOfGoods: "Cost of Goods Sold",
  fixedCosts: "Fixed Costs",
  payroll: "Payroll / Salary",
  debtPayments: "Loan / EMI / Debt Payments",
  receivables: "Receivables",
  payables: "Payables",
  ownerWithdrawals: "Owner Withdrawals",
  orderCount: "Order Count",
  customerCount: "Customer Count",
  discountAmount: "Discount Amount",
  refundReworkCost: "Refund / Rework Cost",
};

export function displayLabelForField(dbFieldName: string): string {
  return DB_FIELD_DISPLAY_LABELS[dbFieldName] ?? dbFieldName;
}

/**
 * Compute both CRITICAL and IMPORTANT missing inputs from a snapshot row.
 * Operates on raw snapshot DB fields (camelCase Prisma names).
 * Returns human-friendly display labels, not raw DB column names.
 */
export function computeMissingInputsWithPriority(snapshot: Record<string, unknown>): MissingInput[] {
  const result: MissingInput[] = [];

  function miss(v: unknown): boolean {
    return v === null || v === undefined || (typeof v === "number" && !Number.isFinite(v));
  }

  // Critical fields
  if (miss(snapshot.revenue)) result.push({ field: displayLabelForField("revenue"), priority: "CRITICAL" });
  const hasCost = !miss(snapshot.costOfGoods) || !miss(snapshot.fixedCosts) ||
    !miss(snapshot.variableCosts) || !miss(snapshot.rent) ||
    !miss(snapshot.payroll) || !miss(snapshot.utilities);
  if (!hasCost) result.push({ field: displayLabelForField("costs"), priority: "CRITICAL" });
  if (miss(snapshot.cashOnHand)) result.push({ field: displayLabelForField("cashOnHand"), priority: "CRITICAL" });

  // Important fields — [DB column name, display label]
  const importantChecks: [string, string][] = [
    ["costOfGoods", displayLabelForField("costOfGoods")],
    ["fixedCosts", displayLabelForField("fixedCosts")],
    ["payroll", displayLabelForField("payroll")],
    ["debtPayments", displayLabelForField("debtPayments")],
    ["receivables", displayLabelForField("receivables")],
    ["payables", displayLabelForField("payables")],
    ["ownerWithdrawals", displayLabelForField("ownerWithdrawals")],
    ["orderCount", displayLabelForField("orderCount")],
    ["customerCount", displayLabelForField("customerCount")],
    ["discountAmount", displayLabelForField("discountAmount")],
    ["refundReworkCost", displayLabelForField("refundReworkCost")],
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
 *
 * Returns confidence score, tier, staleness, age in days, and freshness tier.
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
  const now = opts.now ?? new Date();
  const endMs = new Date(input.periodEnd).getTime();
  const ageDays = Number.isNaN(endMs) ? null : (now.getTime() - endMs) / (1000 * 60 * 60 * 24);
  const stale = ageDays === null ? true : ageDays > staleDays;
  if (stale) score -= 15;

  const finalScore = clampScore(score);
  return {
    dataConfidenceScore: finalScore,
    confidenceTier: confidenceTierFromScore(finalScore),
    missingCritical,
    isStale: stale,
    ageDays,
    freshnessTier: ageDays === null ? null : freshnessTierFromAge(ageDays),
  };
}
