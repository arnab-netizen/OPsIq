/**
 * GET /api/owner/now-view?businessId=... — Real-Time 360° Owner Now View (Module 41).
 *     Returns the top 3 owner actions, actions to avoid, what changed since last
 *     check, missing data, beginner explanation, step-by-step guidance, confidence
 *     cap, and rollback triggers. OWNER_VIEW, workspace-scoped, canonically enforced.
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getOwnerNowView } from "@/services/owner-guidance/owner-now-view.service";
import { getCockpitFinancePriority } from "@/services/owner-guidance/cockpit-finance-priority.service";

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
    const payload = await getOwnerNowView(ctx.verifiedWorkspaceId, businessId, undefined, ctx.verifiedActorId, {
      restrictExecutionToAttributableBusiness,
    });
    // F3: additive, best-effort — a failure here must never break the rest of the cockpit payload.
    const financeTopPriority = await getCockpitFinancePriority(ctx.verifiedWorkspaceId, businessId).catch(() => null);
    return { ...payload, financeTopPriority };
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);
