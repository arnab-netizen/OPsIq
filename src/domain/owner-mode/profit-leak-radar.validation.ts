/**
 * Profit-Leak Radar — Zod schema for POST /api/owner/profit-leak body.
 * All fields optional except evaluatedAt (ISO timestamp required for audit trail).
 * workspaceId is NEVER taken from the body — route overwrites it from the canonical
 * session context (ctx.verifiedWorkspaceId) before calling the pure engine.
 */
import { z } from "zod/v4";

const constraintType = z.enum([
  "DEMAND", "CAPACITY", "CASH", "STAFF", "OWNER", "MANAGER", "QUALITY",
  "DELIVERY", "PRICING", "CUSTOMER_RETENTION", "B2B_ACCOUNT", "EQUIPMENT",
  "COMPLIANCE_OR_LOCAL_VERIFICATION", "STARTUP_VALIDATION", "DATA_INSUFFICIENT",
]);

export const profitLeakSignalsBodySchema = z.strictObject({
  /** ISO timestamp for the evaluation window. Required for honest audit trail. */
  evaluatedAt: z.string().min(1),
  currency: z.string().optional(),
  revenue: z.number().nullable().optional(),
  discountAmount: z.number().nullable().optional(),
  discountLeak: z.boolean().optional(),
  discountMeasured: z.boolean().optional(),
  marginPct: z.number().nullable().optional(),
  marginSafe: z.boolean().nullable().optional(),
  lowMarginB2BAccount: z.boolean().optional(),
  b2bRevenue: z.number().nullable().optional(),
  newCustomers: z.number().nullable().optional(),
  repeatCustomers: z.number().nullable().optional(),
  complaintsCount: z.number().int().min(0).optional(),
  reworkCount: z.number().int().min(0).optional(),
  overdueProofCount: z.number().int().min(0).optional(),
  weakProofCount: z.number().int().min(0).optional(),
  staffProductivity: z.number().nullable().optional(),
  deliveryDelaySignal: z.boolean().optional(),
  capacityUtilizationPct: z.number().min(0).max(100).optional(),
  ownerBottleneckItems: z.number().int().min(0).optional(),
  ownerReviewsRequired: z.number().int().min(0).optional(),
  ownerDecisionsRequired: z.number().int().min(0).optional(),
  cashRiskGrowth: z.boolean().optional(),
  disputeReworkCount: z.number().int().min(0).optional(),
  disputeComplaintCount: z.number().int().min(0).optional(),
  disputeWeakProofCount: z.number().int().min(0).optional(),
  disputeReworkImpactAmount: z.number().nullable().optional(),
  disputeComplaintImpactAmount: z.number().nullable().optional(),
  deliveryComplaintCount: z.number().int().min(0).optional(),
  deliveryComplaintImpactAmount: z.number().nullable().optional(),
  pricingComplaintCount: z.number().int().min(0).optional(),
  pricingComplaintImpactAmount: z.number().nullable().optional(),
  currentConstraint: constraintType.nullable().optional(),
  missingCriticalData: z.array(z.string()).optional(),
});

export type ProfitLeakSignalsBody = z.infer<typeof profitLeakSignalsBodySchema>;
