/**
 * Owner Mode — Reactivation Campaign Assessment request validation (Zod).
 * Validates dormant-customer metrics for churn-risk scoring and work-package
 * generation. workspaceId is NEVER taken from the body — the route overwrites
 * it from ctx.verifiedWorkspaceId so tenants cannot cross-read.
 */
import { z } from "zod/v4";

export const reactivationAssessRequestSchema = z.strictObject({
  /**
   * Number of customers who have not returned within the dormancy window.
   * Must be >= 0. Zero means no known dormant customers.
   */
  dormantCustomerCount: z.number().int().min(0),

  /**
   * Total active customer base at the start of the measurement period.
   * Must be >= 1 so the churn rate calculation is valid.
   */
  cohortSize: z.number().int().min(1),

  /**
   * Observed average monthly churn rate as a fraction 0–1 (e.g. 0.08 = 8%).
   * When omitted the route derives it from dormantCustomerCount / cohortSize.
   */
  avgMonthlyChurnRate: z.number().min(0).max(1).optional(),

  /**
   * Average monthly revenue per customer in the owner's currency.
   * When supplied, the route includes an LTV impact estimate.
   */
  avgMonthlyRevenuePerCustomer: z.number().min(0).optional(),

  /**
   * Optional business name used to personalise the win-back scripts
   * embedded in the generated work package artifacts.
   */
  businessName: z.string().max(200).optional(),

  /**
   * Situational context that influences the urgency gate.
   */
  context: z.strictObject({
    /** True when a cash or profit risk is already active for this workspace. */
    cashPressureActive: z.boolean(),
  }).optional(),

  /**
   * ISO-8601 evaluation timestamp used to anchor the assessment.
   * Defaults to the server's current time when omitted.
   */
  evaluatedAt: z.string().min(1).optional(),
});

export type ReactivationAssessRequest = z.infer<typeof reactivationAssessRequestSchema>;
