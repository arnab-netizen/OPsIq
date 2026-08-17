/**
 * GET /api/owner/scheduler-status — P0-08 scheduler health (owner-visible).
 *
 * Reports this workspace's ScheduledTask counts (pending/running/dead-letter),
 * last successful task completion, next scheduled execution, and recent
 * dead-letters with their error text — so an owner can tell automation has
 * stopped without reading Vercel logs. Pure read, workspace-scoped.
 *
 * Auth: OWNER_VIEW capability, workspace-scoped, canonically enforced.
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getSchedulerStatusForWorkspace } from "@/services/scheduler/scheduler-status.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const status = await getSchedulerStatusForWorkspace(ctx.verifiedWorkspaceId);
    return {
      workspaceId: ctx.verifiedWorkspaceId,
      ...status,
      cronCadence: "Runs once daily at 03:00 UTC (vercel.json); catch-up by design — a missed tick delays work, never drops it.",
    };
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true },
);
