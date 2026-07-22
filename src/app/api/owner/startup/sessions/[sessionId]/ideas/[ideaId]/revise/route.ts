/**
 * POST /api/owner/startup/sessions/[sessionId]/ideas/[ideaId]/revise
 * Atomically creates a new idea version and supersedes the previous one.
 */
import { z } from "zod/v4";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { parseRequestBody } from "@/lib/validation";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { reviseIdea } from "@/services/owner-strategy/startup-session.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const postSchema = z.object({
  name: z.string().min(1).optional(),
  industry: z.string().min(1).optional(),
  originData: z.record(z.string(), z.unknown()).optional(),
});

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const body = await parseRequestBody(ctx.request!, postSchema);
    const newIdeaId = await reviseIdea(
      ctx.verifiedWorkspaceId,
      params.sessionId,
      params.ideaId,
      ctx.verifiedActorId,
      {
        name: body.name,
        industry: body.industry,
        originData: body.originData,
      }
    );
    return canonicalJson({ newIdeaId, previousIdeaId: params.ideaId }, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
