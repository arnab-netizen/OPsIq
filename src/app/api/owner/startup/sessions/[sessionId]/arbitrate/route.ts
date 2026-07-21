/**
 * GET /api/owner/startup/sessions/[sessionId]/arbitrate — idea arbitration result.
 *
 * Returns the ranked arbitration result for all ideas in the session.
 * When only one idea exists, closestAlternative is null (no alternative to rank).
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

    const ideas = await db.startupIdeaRecord.findMany({
      where: { sessionId: params.sessionId, workspaceId: ctx.verifiedWorkspaceId },
      orderBy: { accepted: "desc" },
      select: {
        id: true,
        name: true,
        accepted: true,
        screeningStatus: true,
      },
    });

    type IdeaRow = { id: string; name: string; accepted: boolean; screeningStatus: string };

    const accepted = (ideas as IdeaRow[]).filter((i) => i.accepted);
    const notAccepted = (ideas as IdeaRow[]).filter((i) => !i.accepted);

    // Primary recommendation: first accepted idea (or first idea if none accepted yet)
    const recommended = accepted[0] ?? (ideas as IdeaRow[])[0] ?? null;

    // closestAlternative: the next-best candidate that was not selected
    // When only one idea exists this is null
    const alternatives = (ideas as IdeaRow[]).filter((i) => i.id !== recommended?.id);
    const closestAlternative = alternatives[0] ?? null;

    return canonicalJson(
      {
        recommended,
        closestAlternative,
        rejected: notAccepted.map((i) => ({ id: i.id, name: i.name })),
        totalIdeas: ideas.length,
      },
      { status: 200 }
    );
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);
