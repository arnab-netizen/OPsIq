/**
 * GET /api/owner/startup/sessions/[sessionId]/ideas/[ideaId]/execution-plan
 * Returns the StartupExecutionPlan for an approved idea's initiative.
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { db } from "@/lib/db";
import { NotFoundError } from "@/infra/errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const plan = await db.startupExecutionPlan.findFirst({
      where: { ideaId: params.ideaId, workspaceId: ctx.verifiedWorkspaceId, sessionId: params.sessionId },
      orderBy: { planVersion: "desc" },
    });
    if (!plan) throw new NotFoundError("StartupExecutionPlan", params.ideaId);
    return canonicalJson(plan, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);
