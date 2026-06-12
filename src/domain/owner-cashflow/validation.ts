/**
 * Owner Cashflow (Module 5) — API input validation (Zod v4).
 *
 * Validates write-path payloads at the route boundary. Reuses the Module 1
 * action-status vocabulary and the Spine target directions. Missing data stays
 * missing (optional fields); negative monetary inputs are rejected (fail closed).
 */
import { z } from "zod/v4";
import { CASHFLOW_BUSINESS_MODELS } from "./types";
import { RECOVERY_ACTION_STATUSES } from "@/domain/founder-recovery/action-status";

/** Non-negative optional monetary metric. */
const nonNeg = z.number().min(0, "Value cannot be negative").optional();

export const cashflowSnapshotCreateSchema = z
  .object({
    periodStart: z.string().min(1, "Reporting period start is required"),
    periodEnd: z.string().min(1, "Reporting period end is required"),
    currency: z.string().min(1, "Currency is required").max(8),
    businessModel: z.enum(CASHFLOW_BUSINESS_MODELS).optional(),
    industryTemplate: z.string().max(100).optional(),

    cashInHand: nonNeg,
    bankBalance: nonNeg,
    dailyCollections: nonNeg,
    receivables: nonNeg,
    receivablesOverdue: nonNeg,
    payables: nonNeg,
    payablesOverdue: nonNeg,
    upcomingEmi: nonNeg,
    rentDue: nonNeg,
    salaryDue: nonNeg,
    vendorDue: nonNeg,
    taxDue: nonNeg,
    ownerWithdrawal: nonNeg,
    notes: z.string().max(2000).optional(),
  })
  .refine(
    (s) => new Date(s.periodEnd).getTime() >= new Date(s.periodStart).getTime(),
    { message: "periodEnd must be on or after periodStart", path: ["periodEnd"] }
  )
  .refine(
    (s) =>
      !Number.isNaN(new Date(s.periodStart).getTime()) &&
      !Number.isNaN(new Date(s.periodEnd).getTime()),
    { message: "Reporting period must be valid dates", path: ["periodStart"] }
  );
export type CashflowSnapshotCreateInput = z.infer<typeof cashflowSnapshotCreateSchema>;

export const runCashflowDiagnosisSchema = z.object({
  snapshotId: z.string().uuid(),
});
export type RunCashflowDiagnosisInput = z.infer<typeof runCashflowDiagnosisSchema>;

export const cashflowActionUpdateSchema = z.object({
  status: z.enum(RECOVERY_ACTION_STATUSES).optional(),
  assignedTo: z.string().uuid().nullable().optional(),
  completionNotes: z.string().max(2000).optional(),
  completionEvidence: z.array(z.string()).optional(),
});
export type CashflowActionUpdateInput = z.infer<typeof cashflowActionUpdateSchema>;

export const cashflowVerifySchema = z.object({
  beforeValue: z.number().nullable(),
  afterValue: z.number().nullable(),
  targetDirection: z.enum(["up", "down"]),
  targetValue: z.number().nullable().optional(),
  evidence: z.array(z.string()).optional(),
  disputed: z.boolean().optional(),
});
export type CashflowVerifyInput = z.infer<typeof cashflowVerifySchema>;
