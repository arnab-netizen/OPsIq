/**
 * Owner Cashflow (Module 5) — API input validation (Zod v4).
 *
 * Validates write-path payloads at the route boundary. Reuses the Module 1
 * action-status vocabulary and the Spine target directions. Missing data stays
 * missing (optional fields); negative monetary inputs are rejected (fail closed).
 */
import { businessCurrencySchema } from "@/domain/founder-recovery/currency";
import { z } from "zod/v4";
import { OVERDRAFT_BANK_BALANCE_SENTENCE } from "./overdraft-copy";
import { CASHFLOW_BUSINESS_MODELS } from "./types";
import { RECOVERY_ACTION_STATUSES } from "@/domain/founder-recovery/action-status";

/** A sane upper bound (1e12), the same as Finance: larger values only overflow downstream sums and are never a real figure. */
export const MAX_CASHFLOW_AMOUNT = 1e12;

/** Non-negative, finite, bounded monetary amount (NaN / Infinity are rejected by z.number()). */
const amount = z.number().min(0, "Value cannot be negative").max(MAX_CASHFLOW_AMOUNT, "That number is too large");

/** A bank balance is non-negative; a negative one is an overdraft, which belongs under money owed (debt), not here. */
const bankAmount = z
  .number()
  .min(0, `A bank balance can't be negative. ${OVERDRAFT_BANK_BALANCE_SENTENCE}`)
  .max(MAX_CASHFLOW_AMOUNT, "That number is too large");
const bankBalanceAmount = bankAmount.optional();

/** Non-negative optional monetary metric. */
const nonNeg = amount.optional();

export const cashflowSnapshotCreateSchema = z
  .object({
    periodStart: z.string().min(1, "Reporting period start is required"),
    periodEnd: z.string().min(1, "Reporting period end is required"),
    currency: businessCurrencySchema,
    businessModel: z.enum(CASHFLOW_BUSINESS_MODELS).optional(),
    industryTemplate: z.string().max(100).optional(),

    cashInHand: nonNeg,
    bankBalance: bankBalanceAmount,
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

/**
 * POST /amend body for amending the two cash figures of a recorded Cashflow snapshot. Strict: an unknown key (a period, a
 * currency) is refused, so an edit can never move the entry's period or change its currency. `expectedUpdatedAt` is the
 * freshness proof (the `updatedAt` the owner saw) and is INDEPENDENT of `confirmReplace` (the owner's explicit consent to
 * replace a recorded value): neither implies the other. `null` clears a figure.
 */
export const cashflowSnapshotAmendSchema = z
  .strictObject({
    expectedUpdatedAt: z
      .string()
      .min(1, "expectedUpdatedAt is required")
      .refine((v) => !Number.isNaN(new Date(v).getTime()), { message: "expectedUpdatedAt must be a valid timestamp" }),
    confirmReplace: z.boolean().optional(),
    bankBalance: bankAmount.nullable().optional(),
    cashInHand: amount.nullable().optional(),
  })
  .refine((b) => b.bankBalance !== undefined || b.cashInHand !== undefined, {
    message: "Provide a bank balance or cash in hand to change",
    path: ["bankBalance"],
  });
export type CashflowSnapshotAmendInput = z.infer<typeof cashflowSnapshotAmendSchema>;

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
