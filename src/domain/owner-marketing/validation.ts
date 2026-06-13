/**
 * Owner Marketing & Growth (Module 6) — API input validation (Zod v4).
 *
 * Validates write-path payloads at the route boundary. Reuses the Module 1
 * action-status vocabulary and the Spine target directions. Missing data stays
 * missing (optional fields); negative inputs are rejected (fail closed).
 */
import { z } from "zod/v4";
import { MARKETING_BUSINESS_MODELS } from "./types";
import { RECOVERY_ACTION_STATUSES } from "@/domain/founder-recovery/action-status";

/** Non-negative optional metric/count. */
const nonNeg = z.number().min(0, "Value cannot be negative").optional();

export const marketingSnapshotCreateSchema = z
  .object({
    periodStart: z.string().min(1, "Reporting period start is required"),
    periodEnd: z.string().min(1, "Reporting period end is required"),
    currency: z.string().min(1, "Currency is required").max(8),
    businessModel: z.enum(MARKETING_BUSINESS_MODELS).optional(),
    industryTemplate: z.string().max(100).optional(),

    marketingSpend: nonNeg,
    revenue: nonNeg,
    leads: nonNeg,
    inquiries: nonNeg,
    orders: nonNeg,
    newCustomers: nonNeg,
    paidLeads: nonNeg,
    organicLeads: nonNeg,
    campaignsRun: nonNeg,
    campaignsWithFollowup: nonNeg,
    contentPosted: nonNeg,
    couponsRedeemed: nonNeg,
    referrals: nonNeg,
    walkIns: nonNeg,
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
export type MarketingSnapshotCreateInput = z.infer<typeof marketingSnapshotCreateSchema>;

export const runMarketingDiagnosisSchema = z.object({
  snapshotId: z.string().uuid(),
});
export type RunMarketingDiagnosisInput = z.infer<typeof runMarketingDiagnosisSchema>;

export const marketingActionUpdateSchema = z.object({
  status: z.enum(RECOVERY_ACTION_STATUSES).optional(),
  assignedTo: z.string().uuid().nullable().optional(),
  completionNotes: z.string().max(2000).optional(),
  completionEvidence: z.array(z.string()).optional(),
});
export type MarketingActionUpdateInput = z.infer<typeof marketingActionUpdateSchema>;

export const marketingVerifySchema = z.object({
  beforeValue: z.number().nullable(),
  afterValue: z.number().nullable(),
  targetDirection: z.enum(["up", "down"]),
  targetValue: z.number().nullable().optional(),
  evidence: z.array(z.string()).optional(),
  disputed: z.boolean().optional(),
});
export type MarketingVerifyInput = z.infer<typeof marketingVerifySchema>;
