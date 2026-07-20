/**
 * GET /api/owner/startup/sessions/[sessionId]/explanation — system explanation for session.
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const [explanation, ideas, decisions] = await Promise.all([
      db.explainabilityRecord.findFirst({
        where: { entityId: params.sessionId, workspaceId: ctx.verifiedWorkspaceId },
        orderBy: { createdAt: "desc" },
      }),
      db.startupIdeaRecord.findMany({
        where: { startupSessionId: params.sessionId, workspaceId: ctx.verifiedWorkspaceId },
        include: { readinessAssessments: { orderBy: { assessedAt: "desc" }, take: 1 } },
      }),
      db.startupOwnerDecision.findMany({
        where: { sessionId: params.sessionId, workspaceId: ctx.verifiedWorkspaceId },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
    ]);
    return canonicalJson({ explanation, ideas, ownerDecisions: decisions }, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);
