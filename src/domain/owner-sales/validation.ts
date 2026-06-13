/**
 * Owner Sales (Module 3) — API input validation (Zod v4).
 *
 * Validates write-path payloads at the route boundary. Reuses the Module 1
 * action-status vocabulary and the Spine target directions. Missing data stays
 * missing (optional fields); negative inputs are rejected (fail closed).
 */
import { z } from "zod/v4";
import { SALES_BUSINESS_MODELS } from "./types";
import { RECOVERY_ACTION_STATUSES } from "@/domain/founder-recovery/action-status";

/** Non-negative optional metric/count. */
const nonNeg = z.number().min(0, "Value cannot be negative").optional();

export const salesSnapshotCreateSchema = z
  .object({
    periodStart: z.string().min(1, "Reporting period start is required"),
    periodEnd: z.string().min(1, "Reporting period end is required"),
    currency: z.string().min(1, "Currency is required").max(8),
    businessModel: z.enum(SALES_BUSINESS_MODELS).optional(),
    industryTemplate: z.string().max(100).optional(),

    leads: nonNeg,
    qualifiedLeads: nonNeg,
    orders: nonNeg,
    revenue: nonNeg,
    averageOrderValue: nonNeg,
    newCustomers: nonNeg,
    repeatCustomers: nonNeg,
    lostCustomers: nonNeg,
    b2bProspects: nonNeg,
    b2bPipelineValue: nonNeg,
    b2bRevenue: nonNeg,
    b2cRevenue: nonNeg,
    complaints: nonNeg,
    discountAmount: nonNeg,
    refundAmount: nonNeg,
    staffCount: nonNeg,
    notes: z.string().max(2000).optional(),
  })
  .refine((s) => new Date(s.periodEnd).getTime() >= new Date(s.periodStart).getTime(), {
    message: "periodEnd must be on or after periodStart",
    path: ["periodEnd"],
  })
  .refine(
    (s) =>
      !Number.isNaN(new Date(s.periodStart).getTime()) &&
      !Number.isNaN(new Date(s.periodEnd).getTime()),
    { message: "Reporting period must be valid dates", path: ["periodStart"] }
  );
export type SalesSnapshotCreateInput = z.infer<typeof salesSnapshotCreateSchema>;

export const runSalesDiagnosisSchema = z.object({
  snapshotId: z.string().uuid(),
});
export type RunSalesDiagnosisInput = z.infer<typeof runSalesDiagnosisSchema>;

export const salesActionUpdateSchema = z.object({
  status: z.enum(RECOVERY_ACTION_STATUSES).optional(),
  assignedTo: z.string().uuid().nullable().optional(),
  completionNotes: z.string().max(2000).optional(),
  completionEvidence: z.array(z.string()).optional(),
});
export type SalesActionUpdateInput = z.infer<typeof salesActionUpdateSchema>;

export const salesVerifySchema = z.object({
  beforeValue: z.number().nullable(),
  afterValue: z.number().nullable(),
  targetDirection: z.enum(["up", "down"]),
  targetValue: z.number().nullable().optional(),
  evidence: z.array(z.string()).optional(),
  disputed: z.boolean().optional(),
});
export type SalesVerifyInput = z.infer<typeof salesVerifySchema>;
