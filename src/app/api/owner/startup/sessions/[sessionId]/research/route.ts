/**
 * POST /api/owner/startup/sessions/[sessionId]/research — build research plan.
 * GET  — retrieve research plan and completeness report.
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import {
  buildResearchPlanForSession,
  buildResearchCompletenessReportForSession,
  getMinimizedOwnerResearchTasks,
} from "@/services/owner-strategy/startup-research.service";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const planId = await buildResearchPlanForSession(ctx.verifiedWorkspaceId, params.sessionId, ctx.verifiedActorId);
    return canonicalJson({ planId }, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const [plan, completenessReport, ownerTasks] = await Promise.all([
      db.startupResearchPlan.findFirst({
        where: { startupSessionId: params.sessionId, workspaceId: ctx.verifiedWorkspaceId },
        orderBy: { createdAt: "desc" },
        include: { acquisitions: true },
      }),
      buildResearchCompletenessReportForSession(ctx.verifiedWorkspaceId, params.sessionId),
      getMinimizedOwnerResearchTasks(ctx.verifiedWorkspaceId, params.sessionId),
    ]);
    return canonicalJson({ plan, completenessReport, ownerTasks }, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);
