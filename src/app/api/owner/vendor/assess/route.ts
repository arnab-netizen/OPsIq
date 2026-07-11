/**
 * POST /api/owner/vendor/assess — Vendor / Procurement Risk Assessment (Module #14).
 *
 * Accepts vendor risk signals and returns a deterministic procurement risk
 * classification WITHOUT providing legal or procurement advice:
 *
 * - "informational"             — no significant risk flags
 * - "review_advised"            — overdue payment, expiring contract, or performance failures
 * - "high_concentration_risk"   — sole-source dependency or ≥50% spend share
 * - "blocked_pending_review"    — expired contract or unverified bank details
 *
 * Hard governance rules (enforced by the pure domain engine):
 * - ownerNotificationRequired is true for review_advised or worse
 * - blockedFromNewOrders is true only for blocked_pending_review
 * - Worst-case signal wins (e.g. contractExpired overrides contractExpiringSoon)
 * - Every response carries a not-a-professional-advice disclaimer
 * - No persistence, no DB writes, no vendor record created
 *
 * Pure analysis — no persistence. workspaceId from canonical session context only.
 *
 * Auth: OWNER_VIEW capability, workspace-scoped, canonically enforced.
 * Body: validated via Zod (vendorAssessRequestSchema).
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody } from "@/lib/validation";
import { vendorAssessRequestSchema } from "@/domain/owner-mode/vendor-assess.validation";
import { assessVendorRisk } from "@/domain/owner-mode/vendor-risk-boundary";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const {
      vendorName,
      spendSharePct,
      soleSupplier,
      contractExpired,
      contractExpiringSoon,
      bankUnverified,
      paymentOverdue,
      performanceFailures,
      contextNote,
    } = await parseRequestBody(ctx.request!, vendorAssessRequestSchema);

    const result = assessVendorRisk({
      vendorName,
      spendSharePct,
      soleSupplier,
      contractExpired,
      contractExpiringSoon,
      bankUnverified,
      paymentOverdue,
      performanceFailures,
    });

    return {
      workspaceId: ctx.verifiedWorkspaceId,
      vendorName,
      classification: result.classification,
      ownerNotificationRequired: result.ownerNotificationRequired,
      blockedFromNewOrders: result.blockedFromNewOrders,
      reasons: result.reasons,
      recommendedActions: result.recommendedActions,
      disclaimer: result.disclaimer,
      ...(contextNote !== undefined ? { contextNote } : {}),
    };
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true },
);
