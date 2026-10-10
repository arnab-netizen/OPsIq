/**
 * Owner Finance (Module 2) — API input validation (Zod v4).
 *
 * Validates write-path payloads at the route boundary. Reuses the Module 1
 * action-status vocabulary and the Spine target directions. Missing data stays
 * missing (optional fields); negative monetary inputs are rejected (fail closed).
 */
import { z } from "zod/v4";
import { FINANCIAL_BUSINESS_MODELS } from "./types";
import { EVIDENCE_QUALITIES } from "./evidence-quality";
import { RECOVERY_ACTION_STATUSES } from "@/domain/founder-recovery/action-status";

/** Non-negative optional monetary/count metric. */
const nonNeg = z.number().min(0, "Value cannot be negative").optional();

export const financialSnapshotCreateSchema = z
  .object({
    periodStart: z.string().min(1, "Reporting period start is required"),
    periodEnd: z.string().min(1, "Reporting period end is required"),
    currency: z.string().min(1, "Currency is required").max(8),
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
  );
export type FinancialSnapshotCreateInput = z.infer<typeof financialSnapshotCreateSchema>;

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
    evidenceQuality: z.enum(EVIDENCE_QUALITIES).optional(),
  })
  .refine(
    (s) => AMENDABLE_FINANCIAL_FIELDS.some((f) => s[f] !== undefined),
    { message: "At least one field must be provided for an amendment" }
  );
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
