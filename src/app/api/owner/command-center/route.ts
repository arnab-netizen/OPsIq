/**
 * GET /api/owner/command-center?businessId=... — aggregated owner Business
 *     Condition Profile (cross-domain rollup) plus the ONE canonical owner decision
 *     (`currentOwnerDecision`, resolved by the owner-home service — the same answer Home,
 *     Cockpit and Priorities show). OWNER_VIEW, workspace-scoped, canonically enforced.
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getBusinessCondition } from "@/services/owner-condition/business-condition.service";
import { getOwnerHome } from "@/services/owner-home/home.service";

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
    // ONE review cadence on the page: the one the canonical decision was resolved with (Home counts
    // every stale domain and only diagnosed evidence), never a second Finance-only computation.
    const cadence = home.reassessment ?? null;
    const lastDiagnosedMs = condition.lastDiagnosedAt ? Date.parse(condition.lastDiagnosedAt) : null;
    return {
      ...condition,
      ...(cadence && home.selectedBusinessId === condition.selectedBusinessId
        ? {
            reassessmentCadenceDays: cadence.days,
            reassessmentReason: cadence.reason,
            nextReassessmentDue: lastDiagnosedMs !== null ? new Date(lastDiagnosedMs + cadence.days * 86_400_000).toISOString() : condition.nextReassessmentDue,
          }
        : {}),
      // Shown beside this condition profile only when both describe the SAME business.
      currentOwnerDecision: home.selectedBusinessId === condition.selectedBusinessId ? home.currentOwnerDecision : null,
    };
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);
