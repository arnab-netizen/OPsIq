/**
 * POST /api/owner/startup/sessions/[sessionId]/ideas/[ideaId]/hypotheses — generate.
 * GET  — list hypotheses for idea.
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { generateAndPersistHypotheses } from "@/services/owner-strategy/startup-session.service";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const hypothesisIds = await generateAndPersistHypotheses(ctx.verifiedWorkspaceId, params.sessionId, params.ideaId, ctx.verifiedActorId);
    return canonicalJson({ hypothesisIds }, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const hypotheses = await db.startupHypothesis.findMany({
      where: { ideaId: params.ideaId, workspaceId: ctx.verifiedWorkspaceId },
      orderBy: { priorityScore: "desc" },
    });
    return canonicalJson({ hypotheses }, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);
