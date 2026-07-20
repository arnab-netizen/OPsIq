/**
 * POST /api/owner/startup/sessions/[sessionId]/research — build research plan.
 * GET  /api/owner/startup/sessions/[sessionId]/research — get research plan + minimized tasks.
 */
import { z } from "zod/v4";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { parseRequestBody } from "@/lib/validation";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import {
  buildAndPersistResearchPlan,
  getOwnerResearchTasks,
  executeAutoResearch,
} from "@/services/owner-strategy/startup-session.service";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const plan = await db.startupResearchPlan.findUnique({
      where: { sessionId: params.sessionId },
      include: { acquisitions: { orderBy: { createdAt: "desc" } } },
    });
    const ownerTasks = await getOwnerResearchTasks(ctx.verifiedWorkspaceId, params.sessionId);
    return canonicalJson({ plan, ownerTasks }, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);

const postSchema = z.object({
  ideaName: z.string().min(1),
  industry: z.string().min(1),
});

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const body = await parseRequestBody(ctx.request!, postSchema);
    const planId = await buildAndPersistResearchPlan(
      ctx.verifiedWorkspaceId,
      params.sessionId,
      ctx.verifiedActorId,
      body.ideaName,
      body.industry
    );
    // Execute auto-acquirable domains immediately after plan creation
    const autoResults = await executeAutoResearch(
      ctx.verifiedWorkspaceId,
      params.sessionId,
      ctx.verifiedActorId
    );
    return canonicalJson({ planId, autoAcquisitions: autoResults }, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
