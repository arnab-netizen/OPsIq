/**
 * POST /api/owner/compliance/classify — Compliance Risk Classification (Module #15).
 *
 * Accepts a set of topic signals and returns a deterministic compliance boundary
 * classification WITHOUT giving definitive legal or tax advice:
 *
 * - "informational"              — no flags detected
 * - "caution"                    — review advisable (expiring soon, ad claim, data privacy)
 * - "professional_review_required" — tax, legal, or staff-sensitive topic
 * - "blocked_until_review"       — expired licence/permit/document
 *
 * Hard governance rules (enforced by the pure domain engine):
 * - Every response carries a not-a-professional-advice disclaimer
 * - professionalReviewRequired is true for "professional_review_required" or worse
 * - blocked is true only when classification is "blocked_until_review"
 * - Worst-case signal wins (e.g. expiryPassed overrides expiringSoon)
 * - No legal conclusions are drawn; reasons describe risk flags only
 *
 * Pure analysis — no persistence. workspaceId from canonical session context only.
 *
 * Auth: OWNER_VIEW capability, workspace-scoped, canonically enforced.
 * Body: validated via Zod (complianceClassifyRequestSchema).
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody } from "@/lib/validation";
import { complianceClassifyRequestSchema } from "@/domain/owner-mode/compliance-classify.validation";
import { classifyComplianceRisk } from "@/domain/owner-mode/compliance-boundary";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const {
      expiryPassed,
      expiringSoon,
      contractOrLegalRisk,
      taxImpact,
      staffSensitive,
      advertisingClaim,
      dataPrivacy,
      contextNote,
    } = await parseRequestBody(ctx.request!, complianceClassifyRequestSchema);

    const result = classifyComplianceRisk({
      expiryPassed,
      expiringSoon,
      contractOrLegalRisk,
      taxImpact,
      staffSensitive,
      advertisingClaim,
      dataPrivacy,
    });

    return {
      workspaceId: ctx.verifiedWorkspaceId,
      classification: result.classification,
      professionalReviewRequired: result.professionalReviewRequired,
      blocked: result.blocked,
      reasons: result.reasons,
      disclaimer: result.disclaimer,
      ...(contextNote !== undefined ? { contextNote } : {}),
    };
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true },
);
