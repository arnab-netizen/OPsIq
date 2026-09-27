/**
 * Jarvis 360 Slice 9 — owner control center surface.
 *
 * GET /api/owner/control-center?businessId=... — the single owner decision panel:
 *     data sufficiency + blocked items + SOP/training/equipment/process + attention.
 * Reuses the existing cross-domain Business Condition Profile (Slice 1 fields) for
 * data-sufficiency and the canonical owner decision (owner-home service) for the next-best
 * action, then layers the Slice 0–8 control aggregates.
 * OWNER_VIEW, workspace-scoped, canonically enforced.
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getBusinessCondition } from "@/services/owner-condition/business-condition.service";
import { getOwnerHome } from "@/services/owner-home/home.service";
import { getOwnerControlCenter } from "@/services/owner-mode/owner-control-center.service";
import { getOwnerBlockMetrics } from "@/services/owner-mode/owner-block-metrics.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const url = new URL(ctx.request!.url);
    const businessId = url.searchParams.get("businessId");
    const [{ profile }, home, blocks] = await Promise.all([
      getBusinessCondition(ctx.verifiedWorkspaceId, businessId),
      getOwnerHome(ctx.verifiedWorkspaceId, businessId),
      // Live block counts derived from the audit log (gate/do-not-repeat/completion blocks).
      getOwnerBlockMetrics(ctx.verifiedWorkspaceId),
    ]);
    const panel = await getOwnerControlCenter(ctx.verifiedWorkspaceId, {
      dataSufficiencyStatus: profile?.dataSufficiencyStatus ?? "caution",
      lowConfidenceDomains: profile?.lowConfidenceDomains ?? [],
      blockedRecommendations: blocks.blockedRecommendations,
      proofBlocked: blocks.proofBlocked,
      financeBlocked: blocks.financeBlocked,
      ownerApprovalsRequired: 0,
      approvalsAvoided: blocks.approvalsAvoided,
      nextBestAction: home.currentOwnerDecision?.primaryTarget?.title ?? null,
      mainTarget: home.currentOwnerDecision?.primaryTarget
        ? {
            title: home.currentOwnerDecision.primaryTarget.title,
            priorityClass: home.currentOwnerDecision.primaryTarget.priorityClass,
            source: home.currentOwnerDecision.primaryTarget.source,
            domain: home.currentOwnerDecision.primaryTarget.domain,
          }
        : null,
    });
    return canonicalJson(panel, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);
