/**
 * GET /api/owner/startup/sessions/[sessionId]/candidates
 * List all idea generation batches and their candidate decisions for a session.
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
    const session = await db.ownerStartupSession.findFirst({
      where: { id: params.sessionId, workspaceId: ctx.verifiedWorkspaceId },
      select: { id: true },
    });
    if (!session) throw new NotFoundError("OwnerStartupSession", params.sessionId);

    const batches = await db.startupIdeaGenerationBatch.findMany({
      where: { sessionId: params.sessionId, workspaceId: ctx.verifiedWorkspaceId },
      orderBy: { createdAt: "desc" },
      include: { candidates: { orderBy: { conceptIndex: "asc" } } },
    });

    return canonicalJson({ batches }, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);
