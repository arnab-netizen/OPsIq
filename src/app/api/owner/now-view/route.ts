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
import { resolveOwnerHome } from "@/services/owner-home/home.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const url = new URL(ctx.request!.url);
    const businessId = url.searchParams.get("businessId");
    // Opt-in only (controlled-beta cockpit business-scoping fix, D-cockpit) — see
    // GetOwnerNowViewOptions' doc comment in owner-now-view.service.ts. The Owner Cockpit and
    // /owner/priorities send this (both show governed work beside the canonical decision, so it
    // must belong to the same business); every other caller (/owner/process-intelligence,
    // /owner/now) omits it and keeps the workspace-wide processExecution/executionLifecycle payload.
    const restrictExecutionToAttributableBusiness = url.searchParams.get("restrictExecutionToBusiness") === "true";
    // Resolve the canonical decision FIRST: Now View enriches it (its headline names the main target).
    const { home, gate } = await resolveOwnerHome(ctx.verifiedWorkspaceId, businessId);
    // Never pair one business's Now View with another business's decision: when a business was
    // requested but the resolver selected a different one (e.g. an archived/fixture id in a
    // single-business workspace), there is no decision for the requested business.
    const mismatched = Boolean(businessId && home.selectedBusinessId !== businessId);
    const ownerDecision = mismatched ? null : home.currentOwnerDecision;
    // Now View reads ONE business's evidence: the requested one, else the business the canonical decision
    // was resolved for (never a workspace-wide aggregate of several businesses).
    const viewBusinessId = businessId ?? home.selectedBusinessId ?? null;
    const payload = await getOwnerNowView(ctx.verifiedWorkspaceId, viewBusinessId, undefined, ctx.verifiedActorId, {
      restrictExecutionToAttributableBusiness,
      ownerDecision,
      // The gate constraints that decision was resolved with (same business), never another business's.
      ownerGate: mismatched ? null : gate,
    });
    return { ...payload, ownerDecision };
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);
