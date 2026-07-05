/**
 * GET /api/owner/proof-risk/queue?businessId=... — the Owner Adjudication Queue.
 *
 * Reshapes the proof-risk blocks the Owner Now View already computes (reused-hash findings, the top
 * anti-gaming signal, the top credibility concern, the active timing-evidence signals, and existing
 * adjudications) into a concise, owner-facing queue. All logic is server-side (getOwnerNowView +
 * buildAdjudicationQueue); the UI only renders and submits through the canonical adjudicate route.
 * OWNER_VIEW, workspace-scoped, canonically enforced.
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getOwnerNowView } from "@/services/owner-guidance/owner-now-view.service";
import { buildAdjudicationQueue, ADJUDICATION_OUTCOME_OPTIONS } from "@/domain/owner-mode/adjudication-queue";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const url = new URL(ctx.request!.url);
    const businessId = url.searchParams.get("businessId");
    const view = await getOwnerNowView(ctx.verifiedWorkspaceId, businessId);
    const { items, summary } = buildAdjudicationQueue({
      reusedProofFindings: view.reusedProofFindings,
      topGamingSignal: view.topGamingSignal,
      topCredibilityConcern: view.topCredibilityConcern,
      timingEvidence: view.timingEvidence,
      proofRiskAdjudications: view.proofRiskAdjudications,
    });
    return { items, summary, outcomeOptions: ADJUDICATION_OUTCOME_OPTIONS, adjudicationSummary: view.proofRiskAdjudicationSummary };
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);
