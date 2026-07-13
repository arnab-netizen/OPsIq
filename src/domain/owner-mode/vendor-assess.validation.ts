/**
 * Owner Mode — Vendor / Procurement Risk Assessment request validation (Zod).
 * Validates risk signals for assessVendorRisk (pure domain boundary check).
 * workspaceId is NEVER taken from the body — the route overwrites it from
 * ctx.verifiedWorkspaceId so tenants cannot cross-read.
 */
import { z } from "zod/v4";

export const vendorAssessRequestSchema = z.strictObject({
  /**
   * Name or identifier of the vendor being assessed (display-only, no DB lookup).
   */
  vendorName: z.string().min(1).max(200),

  /**
   * Percentage of total external spend attributed to this vendor (0–100).
   * >50% triggers high-concentration risk.
   */
  spendSharePct: z.number().min(0).max(100).optional(),

  /**
   * Whether this vendor is the sole source for a critical input/service.
   * Forces high_concentration_risk at minimum.
   */
  soleSupplier: z.boolean().optional(),

  /**
   * Whether this vendor's contract has already expired.
   * Forces blocked_pending_renewal.
   */
  contractExpired: z.boolean().optional(),

  /**
   * Whether this vendor's contract is expiring within the warning window (≤30 days).
   * Surfaces as review_advised.
   */
  contractExpiringSoon: z.boolean().optional(),

  /**
   * Whether the vendor's bank details are unverified (payment risk).
   * Forces blocked_pending_verification.
   */
  bankUnverified: z.boolean().optional(),

  /**
   * Whether a payment is overdue from this vendor (credit risk / delivery risk).
   * Surfaces as review_advised.
   */
  paymentOverdue: z.boolean().optional(),

  /**
   * Whether there are quality or delivery failures on recent orders.
   * Escalates to review_advised or high_concentration_risk when combined.
   */
  performanceFailures: z.boolean().optional(),

  /**
   * Free-text context note for owner visibility. Does NOT affect classification.
   */
  contextNote: z.string().max(500).optional(),
});

export type VendorAssessRequest = z.infer<typeof vendorAssessRequestSchema>;
