/**
 * GET /api/owner/startup/sessions/[sessionId]/ideas/[ideaId] — idea detail.
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
    const idea = await db.startupIdeaRecord.findFirst({
      where: {
        id: params.ideaId,
        sessionId: params.sessionId,
        workspaceId: ctx.verifiedWorkspaceId,
      },
      include: {
        hypotheses: { orderBy: { priorityScore: "desc" } },
        evidenceRecords: { orderBy: { createdAt: "desc" } },
        validationPlan: true,
        businessModelVersions: { orderBy: { versionNumber: "desc" }, take: 1 },
        readinessAssessments: { orderBy: { assessedAt: "desc" }, take: 1 },
        systemRecommendations: { orderBy: { createdAt: "desc" }, take: 1 },
        ownerDecisions: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });
    if (!idea) throw new NotFoundError("StartupIdeaRecord", params.ideaId);
    // BigInt fields (e.g. expectedCostCents, spendingLimitCents) cannot be
    // serialised by JSON.stringify without a replacer. Convert to strings here.
    const serialisable = JSON.parse(JSON.stringify(idea, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
    return canonicalJson({ idea: serialisable }, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);
