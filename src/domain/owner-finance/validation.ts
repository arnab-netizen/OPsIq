/**
 * Owner Finance (Module 2) — API input validation (Zod v4).
 *
 * Validates write-path payloads at the route boundary. Reuses the Module 1
 * action-status vocabulary and the Spine target directions. Missing data stays
 * missing (optional fields); negative monetary inputs are rejected (fail closed).
 */
import { businessCurrencySchema } from "@/domain/founder-recovery/currency";
import { z } from "zod/v4";
import { FINANCIAL_BUSINESS_MODELS } from "./types";
import { EVIDENCE_QUALITIES } from "./evidence-quality";
import { RECOVERY_ACTION_STATUSES } from "@/domain/founder-recovery/action-status";

/** Non-negative optional monetary/count metric. */
/** A sane upper bound (1e12): larger values only overflow downstream sums and are never a real business figure. */
const nonNeg = z.number().min(0, "Value cannot be negative").max(1e12, "That number is too large").optional();

/**
 * A reporting-period boundary: a calendar-valid `YYYY-MM-DD` date or a UTC ISO timestamp, within a sane year range.
 * Loose strings ("March 5", "1", "2026-02-30", offsets that shift the day, "+275760-09-13") are refused at the
 * boundary — `new Date()` would otherwise silently reinterpret them (or the database would reject them as a 500).
 */
const PERIOD_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?Z)?$/;
const MIN_PERIOD_YEAR = 2000;
const MAX_PERIOD_YEAR = 2100;

export function isValidPeriodDateString(value: string): boolean {
  const m = PERIOD_DATE_PATTERN.exec(value);
  if (!m) return false;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (year < MIN_PERIOD_YEAR || year > MAX_PERIOD_YEAR) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return false;
  return !Number.isNaN(new Date(value).getTime());
}

const periodDate = (label: string) =>
  z.string().min(1, `${label} is required`).refine(isValidPeriodDateString, { message: `${label} must be a valid date (YYYY-MM-DD)` });

type Amount = number | null | undefined;
const isNum = (x: Amount): x is number => typeof x === "number" && Number.isFinite(x);

export interface FinanceContradiction {
  path: string;
  message: string;
}

/**
 * Relationships between figures that cannot all be true (a part larger than its whole), checked ONLY when both sides are
 * known: an UNKNOWN side is never a contradiction and never zero. The reported `path` is the part that is too large, so the
 * owner is told which field to look at. Only relationships the cost/segment model defines as part-of-whole are checked. Used by create (this payload), amend (payload fields) and the amended snapshot's
 * merged values, so a correction cannot introduce a contradiction the original entry would have been refused for.
 */
export function findFinanceContradictions(v: Record<string, Amount>): FinanceContradiction[] {
  const out: FinanceContradiction[] = [];
  const atMost = (part: string, whole: string, partLabel: string, wholeLabel: string) => {
    const a = v[part];
    const b = v[whole];
    if (isNum(a) && isNum(b) && a > b) out.push({ path: part, message: `${partLabel} (${a}) cannot be more than ${wholeLabel} (${b})` });
  };
  const sumAtMost = (parts: string[], whole: string, partsLabel: string, wholeLabel: string) => {
    const vals = parts.map((p) => v[p]).filter(isNum);
    const b = v[whole];
    if (vals.length > 0 && isNum(b)) {
      const sum = vals.reduce((s, x) => s + x, 0);
      if (sum > b) out.push({ path: whole, message: `${wholeLabel} (${b}) is less than the ${partsLabel} you entered (${sum})` });
    }
  };
  atMost("repeatCustomerCount", "customerCount", "Repeat customers", "total customers");
  atMost("receivablesOverdue", "receivables", "Overdue receivables", "total receivables");
  atMost("payablesOverdue", "payables", "Overdue payables", "total payables");
  sumAtMost(["rent", "salaryPayroll", "utilities"], "fixedCosts", "rent, payroll and utilities", "Total fixed costs");
  // Deliberately NOT checked: cost of goods vs variableCosts. The cost model treats an explicit variableCosts as the total used for
  // profit and cost of goods as a separate gross-margin input, so one exceeding the other is not a part/whole contradiction.
  const segments = [v.b2cRevenue, v.b2bRevenue].filter(isNum);
  if (segments.length > 0 && isNum(v.revenue) && segments.reduce((s, x) => s + x, 0) > v.revenue) {
    out.push({ path: "revenue", message: `Revenue (${v.revenue}) is less than the consumer and business revenue you entered (${segments.reduce((s, x) => s + x, 0)})` });
  }
  return out;
}

const contradictionRefinement = (s: Record<string, unknown>, ctx: z.RefinementCtx) => {
  for (const c of findFinanceContradictions(s as Record<string, Amount>)) ctx.addIssue({ code: "custom", message: c.message, path: [c.path] });
};

export const financialSnapshotCreateSchema = z
  .object({
    periodStart: periodDate("Reporting period start"),
    periodEnd: periodDate("Reporting period end"),
    currency: businessCurrencySchema,
    businessModel: z.enum(FINANCIAL_BUSINESS_MODELS).optional(),
    industryTemplate: z.string().max(100).optional(),
    /** Provenance of the numbers: from records, a good estimate, or a rough guess. Omitted = unspecified. */
    evidenceQuality: z.enum(EVIDENCE_QUALITIES).optional(),

    revenue: nonNeg,
    b2cRevenue: nonNeg,
    b2bRevenue: nonNeg,
    costOfGoodsOrServices: nonNeg,
    fixedCosts: nonNeg,
    variableCosts: nonNeg,
    rent: nonNeg,
    salaryPayroll: nonNeg,
    utilities: nonNeg,
    deliveryFulfilmentCost: nonNeg,
    marketingSpend: nonNeg,
    discountAmount: nonNeg,
    refundAmount: nonNeg,
    reworkCost: nonNeg,
    complaintCost: nonNeg,
    loanEmiDebtPayments: nonNeg,
    totalDebtOutstanding: nonNeg,
    cashOnHand: nonNeg,
    receivables: nonNeg,
    receivablesOverdue: nonNeg,
    payables: nonNeg,
    payablesOverdue: nonNeg,
    ownerWithdrawals: nonNeg,
    inventoryStockCashLock: nonNeg,
    orderCount: nonNeg,
    customerCount: nonNeg,
    repeatCustomerCount: nonNeg,
    notes: z.string().max(2000).optional(),
  })
  .refine(
    (s) => new Date(s.periodEnd).getTime() >= new Date(s.periodStart).getTime(),
    { message: "periodEnd must be on or after periodStart", path: ["periodEnd"] }
  )
  .refine(
    (s) => !Number.isNaN(new Date(s.periodStart).getTime()) && !Number.isNaN(new Date(s.periodEnd).getTime()),
    { message: "Reporting period must be valid dates", path: ["periodStart"] }
  )
  .superRefine(contradictionRefinement);
export type FinancialSnapshotCreateInput = z.infer<typeof financialSnapshotCreateSchema>;

/**
 * An amended figure: a non-negative number SETS it; `null` returns it to UNKNOWN (the owner no longer vouches for the
 * number); omitted leaves it as recorded. Unknown and zero are different states — 0 is only ever an explicit 0.
 */
const amendAmount = nonNeg.nullable();

const AMENDABLE_FINANCIAL_FIELDS = [
  "revenue", "b2cRevenue", "b2bRevenue", "costOfGoodsOrServices", "fixedCosts",
  "variableCosts", "rent", "salaryPayroll", "utilities", "deliveryFulfilmentCost",
  "marketingSpend", "discountAmount", "refundAmount", "loanEmiDebtPayments",
  "totalDebtOutstanding", "cashOnHand", "receivables", "receivablesOverdue",
  "payables", "payablesOverdue", "ownerWithdrawals", "inventoryStockCashLock",
  "orderCount", "customerCount", "repeatCustomerCount", "notes", "evidenceQuality",
] as const;

export const financialSnapshotAmendSchema = z
  .object({
    amendmentReason: z.string().min(1, "Amendment reason is required").max(2000),
    revenue: amendAmount,
    b2cRevenue: amendAmount,
    b2bRevenue: amendAmount,
    costOfGoodsOrServices: amendAmount,
    fixedCosts: amendAmount,
    variableCosts: amendAmount,
    rent: amendAmount,
    salaryPayroll: amendAmount,
    utilities: amendAmount,
    deliveryFulfilmentCost: amendAmount,
    marketingSpend: amendAmount,
    discountAmount: amendAmount,
    refundAmount: amendAmount,
    loanEmiDebtPayments: amendAmount,
    totalDebtOutstanding: amendAmount,
    cashOnHand: amendAmount,
    receivables: amendAmount,
    receivablesOverdue: amendAmount,
    payables: amendAmount,
    payablesOverdue: amendAmount,
    ownerWithdrawals: amendAmount,
    inventoryStockCashLock: amendAmount,
    orderCount: amendAmount,
    customerCount: amendAmount,
    repeatCustomerCount: amendAmount,
    notes: z.string().max(2000).optional(),
    evidenceQuality: z.enum(EVIDENCE_QUALITIES).optional(),
  })
  .refine(
    (s) => AMENDABLE_FINANCIAL_FIELDS.some((f) => s[f] !== undefined), // null (return to UNKNOWN) counts as provided
    { message: "At least one field must be provided for an amendment" }
  )
  .superRefine(contradictionRefinement); // fields in THIS payload; the service re-checks the merged snapshot
export type FinancialSnapshotAmendInput = z.infer<typeof financialSnapshotAmendSchema>;

export const runFinanceDiagnosisSchema = z.object({
  snapshotId: z.string().uuid(),
});
export type RunFinanceDiagnosisInput = z.infer<typeof runFinanceDiagnosisSchema>;

export const financeActionUpdateSchema = z.object({
  status: z.enum(RECOVERY_ACTION_STATUSES).optional(),
  assignedTo: z.string().uuid().nullable().optional(),
  completionNotes: z.string().max(2000).optional(),
  completionEvidence: z.array(z.string()).optional(),
});
export type FinanceActionUpdateInput = z.infer<typeof financeActionUpdateSchema>;

export const financeVerifySchema = z.object({
  beforeValue: z.number().nullable(),
  afterValue: z.number().nullable(),
  targetDirection: z.enum(["up", "down"]),
  targetValue: z.number().nullable().optional(),
  evidence: z.array(z.string()).optional(),
  disputed: z.boolean().optional(),
});
export type FinanceVerifyInput = z.infer<typeof financeVerifySchema>;
