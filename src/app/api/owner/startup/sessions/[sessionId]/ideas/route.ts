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

const addIdeaSchema = z.object({
  name: z.string().min(1).max(200),
  industry: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  targetCustomer: z.string().max(500).optional(),
  valuePropSummary: z.string().max(1000).optional(),
  revenueModel: z.string().max(500).optional(),
});

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const body = await parseRequestBody(ctx.request!, addIdeaSchema);
    const ideaId = await addIdea(ctx.verifiedWorkspaceId, params.sessionId, ctx.verifiedActorId, body);
    return canonicalJson({ ideaId }, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const ideas = await db.startupIdeaRecord.findMany({
      where: { startupSessionId: params.sessionId, workspaceId: ctx.verifiedWorkspaceId },
      orderBy: { createdAt: "asc" },
    });
    return canonicalJson({ ideas }, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);
