/**
 * Owner Mode — Compliance Risk Classification request validation (Zod).
 * Validates topic signals for classifyComplianceRisk (pure domain boundary check).
 * workspaceId is NEVER taken from the body — the route overwrites it from
 * ctx.verifiedWorkspaceId so tenants cannot cross-read.
 */
import { z } from "zod/v4";

export const complianceClassifyRequestSchema = z.strictObject({
  /**
   * A licence, permit, or document whose expiry date has already passed.
   * Forces blocked_until_review.
   */
  expiryPassed: z.boolean().optional(),

  /**
   * A licence, permit, or document that expires within the warning window
   * (typically 30 days). Surfaces as caution.
   */
  expiringSoon: z.boolean().optional(),

  /**
   * A contract or legal-dispute risk. Surfaces as professional_review_required.
   */
  contractOrLegalRisk: z.boolean().optional(),

  /**
   * A tax-sensitive decision (e.g. cash-basis vs accrual, deductibility).
   * Surfaces as professional_review_required.
   */
  taxImpact: z.boolean().optional(),

  /**
   * A hiring, firing, or disciplinary action. Labour-obligation review needed.
   * Surfaces as professional_review_required.
   */
  staffSensitive: z.boolean().optional(),

  /**
   * An advertising or marketing claim that requires substantiation.
   * Surfaces as caution.
   */
  advertisingClaim: z.boolean().optional(),

  /**
   * Customer-data or privacy risk (collection, storage, processing).
   * Surfaces as caution.
   */
  dataPrivacy: z.boolean().optional(),

  /**
   * Free-text context note to include in the response for owner visibility.
   * Does NOT affect the classification algorithm.
   */
  contextNote: z.string().max(500).optional(),
});

export type ComplianceClassifyRequest = z.infer<typeof complianceClassifyRequestSchema>;
