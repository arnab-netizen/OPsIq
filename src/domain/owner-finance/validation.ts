/**
 * Owner Finance (Module 2) — API input validation (Zod v4).
 *
 * Validates write-path payloads at the route boundary. Reuses the Module 1
 * action-status vocabulary and the Spine target directions. Missing data stays
 * missing (optional fields); negative monetary inputs are rejected (fail closed).
 */
import { z } from "zod/v4";
import { FINANCIAL_BUSINESS_MODELS } from "./types";
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
