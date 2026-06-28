/**
 * Jarvis 360 Slice 9 — owner control center surface.
 *
 * GET /api/owner/control-center?businessId=... — the single owner decision panel:
 *     data sufficiency + blocked items + SOP/training/equipment/process + attention.
 * Reuses the existing cross-domain Business Condition Profile (Slice 1 fields) for
 * data-sufficiency + next-best-action, then layers the Slice 0–8 control aggregates.
 * OWNER_VIEW, workspace-scoped, canonically enforced.
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getBusinessCondition } from "@/services/owner-condition/business-condition.service";
import { getOwnerControlCenter } from "@/services/owner-mode/owner-control-center.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const url = new URL(ctx.request!.url);
    const businessId = url.searchParams.get("businessId");
    const profile = await getBusinessCondition(ctx.verifiedWorkspaceId, businessId);
    const panel = await getOwnerControlCenter(ctx.verifiedWorkspaceId, {
      dataSufficiencyStatus: profile.dataSufficiencyStatus ?? "caution",
      lowConfidenceDomains: profile.lowConfidenceDomains ?? [],
      // Blocked counts are surfaced via audit events (owner.gate_promotion_blocked) and
      // proof/completion gates; their live aggregation is a follow-on. Default 0 here.
      blockedRecommendations: 0,
      proofBlocked: 0,
      financeBlocked: 0,
      ownerApprovalsRequired: 0,
      nextBestAction: profile.recommendedNextAction?.title ?? null,
    });
    return canonicalJson(panel, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);
