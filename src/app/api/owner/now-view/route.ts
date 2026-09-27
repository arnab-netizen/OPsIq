/**
 * GET /api/owner/now-view?businessId=... — Real-Time 360° Owner Now View (Module 41).
 *     Returns Now View's operating context (actions to avoid, what changed in the operating data,
 *     missing data, beginner explanation, step-by-step guidance, confidence cap, execution state)
 *     together with the ONE canonical owner decision (`ownerDecision`) that Now View enriches.
 *     OWNER_VIEW, workspace-scoped, canonically enforced.
 *
 * The overall owner target is resolved once by the owner-home service (Spine arbiter) — the same
 * answer Home, Priorities and the Command Center render. This route never elects its own "#1"
 * (the former Finance-first and domain-priority bridges are retired: their information is part of
 * the canonical candidate pipeline).
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getOwnerNowView } from "@/services/owner-guidance/owner-now-view.service";
import { getOwnerHome } from "@/services/owner-home/home.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const url = new URL(ctx.request!.url);
    const businessId = url.searchParams.get("businessId");
    // Opt-in only (controlled-beta cockpit business-scoping fix, D-cockpit) — see
    // GetOwnerNowViewOptions' doc comment in owner-now-view.service.ts. Only the Owner Cockpit page
    // sends this; every other caller of this same route (/owner/priorities, /owner/process-intelligence,
    // /owner/now) omits it and keeps today's exact, already-documented workspace-wide payload for
    // processExecution/executionLifecycle.
    const restrictExecutionToAttributableBusiness = url.searchParams.get("restrictExecutionToBusiness") === "true";
    // Resolve the canonical decision FIRST: Now View enriches it and persists its memory with the
    // snapshot it writes (so "what changed" compares against this exact decision next time).
    const home = await getOwnerHome(ctx.verifiedWorkspaceId, businessId);
    const ownerDecision = home.currentOwnerDecision;
    const payload = await getOwnerNowView(ctx.verifiedWorkspaceId, businessId, undefined, ctx.verifiedActorId, {
      restrictExecutionToAttributableBusiness,
      ownerDecision,
    });
    return { ...payload, ownerDecision };
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);
