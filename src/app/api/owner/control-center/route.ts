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
import type { OwnerDecisionTarget } from "@/domain/owner-spine/owner-decision";
import { getOwnerControlCenter } from "@/services/owner-mode/owner-control-center.service";
import { getOwnerBlockMetrics } from "@/services/owner-mode/owner-block-metrics.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const url = new URL(ctx.request!.url);
    const businessId = url.searchParams.get("businessId");
    const [condition, home] = await Promise.all([
      getBusinessCondition(ctx.verifiedWorkspaceId, businessId),
      getOwnerHome(ctx.verifiedWorkspaceId, businessId),
    ]);
    // Live block counts derived from the audit log (gate/do-not-repeat/completion blocks). Finance
    // blocks constrain THIS business's advice only when they are this business's blocks.
    const blocks = await getOwnerBlockMetrics(ctx.verifiedWorkspaceId, undefined, {
      businessId: home.selectedBusinessId,
      unscopedAttributable: home.businesses.length === 1,
    });
    const { profile } = condition;
    // The canonical decision is used beside this condition profile only when both describe the SAME business.
    const decision = home.selectedBusinessId === condition.selectedBusinessId ? home.currentOwnerDecision : null;
    const asTarget = (t: Pick<OwnerDecisionTarget, "title" | "priorityClass" | "source" | "findingCode">) => ({
      title: t.title, priorityClass: t.priorityClass, source: t.source, findingCode: t.findingCode,
    });
    const panel = await getOwnerControlCenter(ctx.verifiedWorkspaceId, {
      dataSufficiencyStatus: profile?.dataSufficiencyStatus ?? "caution",
      lowConfidenceDomains: profile?.lowConfidenceDomains ?? [],
      blockedRecommendations: blocks.blockedRecommendations,
      proofBlocked: blocks.proofBlocked,
      financeBlocked: blocks.financeBlocked,
      ownerApprovalsRequired: 0,
      approvalsAvoided: blocks.approvalsAvoided,
      nextBestAction: decision?.primaryTarget?.title ?? null,
      mainTarget: decision?.primaryTarget ? asTarget(decision.primaryTarget) : null,
      supportingSteps: (decision?.supportingSteps ?? []).map(asTarget),
    });
    return canonicalJson(panel, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);
