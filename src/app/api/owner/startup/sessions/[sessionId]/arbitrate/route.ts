/**
 * GET /api/owner/startup/sessions/[sessionId]/arbitrate — idea arbitration result.
 * POST /api/owner/startup/sessions/[sessionId]/arbitrate — run arbitration engine.
 *
 * GET returns the latest GoalArbitrationRecord for this session.
 * POST runs arbitrateStartupIdeas() via the service, persists result, returns recommendation.
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { db } from "@/lib/db";
import { NotFoundError } from "@/infra/errors";
import { runIdeaArbitration } from "@/services/owner-strategy/startup-session.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const session = await db.ownerStartupSession.findFirst({
      where: { id: params.sessionId, workspaceId: ctx.verifiedWorkspaceId },
      select: { id: true },
    });
    if (!session) throw new NotFoundError("OwnerStartupSession", params.sessionId);

    // Return the latest arbitration record for this session's ideas
    const record = await db.goalArbitrationRecord.findFirst({
      where: { workspaceId: ctx.verifiedWorkspaceId },
      orderBy: { arbitratedAt: "desc" },
    });

    if (!record) {
      // Fallback: simple sort by accepted for backward compat
      const ideas = await db.startupIdeaRecord.findMany({
        where: { sessionId: params.sessionId, workspaceId: ctx.verifiedWorkspaceId },
        orderBy: { accepted: "desc" },
        select: { id: true, name: true, accepted: true, screeningStatus: true },
      });
      type IdeaRow = { id: string; name: string; accepted: boolean; screeningStatus: string };
      const accepted = (ideas as IdeaRow[]).filter((i) => i.accepted);
      const recommended = accepted[0] ?? (ideas as IdeaRow[])[0] ?? null;
      const alternatives = (ideas as IdeaRow[]).filter((i) => i.id !== recommended?.id);
      return canonicalJson({
        recommended,
        closestAlternative: alternatives[0] ?? null,
        rejected: (ideas as IdeaRow[]).filter((i) => !i.accepted).map((i) => ({ id: i.id, name: i.name })),
        totalIdeas: ideas.length,
        arbitrationRecordId: null,
      }, { status: 200 });
    }

    const result = record.arbitrationResult as { recommendedIdeaId: string | null; recommendedIdeaName: string | null; closestAlternativeId: string | null; closestAlternativeName: string | null; rejectedIds: string[] };
    return canonicalJson({
      recommended: result.recommendedIdeaId ? { id: result.recommendedIdeaId, name: result.recommendedIdeaName } : null,
      closestAlternative: result.closestAlternativeId ? { id: result.closestAlternativeId, name: result.closestAlternativeName } : null,
      rejected: result.rejectedIds?.map((id: string) => ({ id })) ?? [],
      arbitrationRecordId: record.id,
      arbitrationResult: result,
    }, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const session = await db.ownerStartupSession.findFirst({
      where: { id: params.sessionId, workspaceId: ctx.verifiedWorkspaceId },
      select: { id: true },
    });
    if (!session) throw new NotFoundError("OwnerStartupSession", params.sessionId);

    const result = await runIdeaArbitration(
      ctx.verifiedWorkspaceId,
      params.sessionId,
      ctx.verifiedActorId
    );

    return canonicalJson(result, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
