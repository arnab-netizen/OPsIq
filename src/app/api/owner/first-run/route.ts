/**
 * GET /api/owner/first-run — the one first-run routing contract (OWNER_VIEW): which step the owner is on,
 * where to go, the business name typed once at signup, and the business if it exists. Derived from persisted
 * facts only (src/domain/owner-first-run/first-run-router.ts); no onboarding-complete flag exists.
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { getFirstRunContext, recordProductEventOnce } from "@/services/owner-first-run/first-run.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const context = await getFirstRunContext(ctx.verifiedWorkspaceId);
    if (context.state === "NEEDS_BUSINESS") {
      await recordProductEventOnce({
        name: "first_run_started",
        eventName: AUDIT_EVENTS.PRODUCT_FIRST_RUN_STARTED,
        workspaceId: ctx.verifiedWorkspaceId,
        actorId: ctx.verifiedActorId,
      });
    }
    return context;
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true },
);
