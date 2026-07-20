/**
 * POST /api/owner/startup/sessions/[sessionId]/ideas — add idea.
 * GET  /api/owner/startup/sessions/[sessionId]/ideas — list ideas.
 */
import { z } from "zod/v4";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { parseRequestBody } from "@/lib/validation";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { addIdea } from "@/services/owner-strategy/startup-session.service";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const ideas = await db.startupIdeaRecord.findMany({
      where: { sessionId: params.sessionId, workspaceId: ctx.verifiedWorkspaceId },
      orderBy: { createdAt: "desc" },
    });
    return canonicalJson({ ideas }, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);

const postSchema = z.object({
  name: z.string().min(1).max(200),
  industry: z.string().min(1).max(200),
  originType: z.enum(["OWNER_ENTERED", "AI_GENERATED", "RESEARCH_DISCOVERED"]).optional(),
  originData: z.record(z.string(), z.unknown()).optional(),
});

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const body = await parseRequestBody(ctx.request!, postSchema);
    const ideaId = await addIdea(
      ctx.verifiedWorkspaceId,
      params.sessionId,
      ctx.verifiedActorId,
      body
    );
    return canonicalJson({ ideaId }, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
