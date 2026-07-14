import { z } from "zod/v4";
import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import { getKPIsForEngagement, createKPI } from "@/services/kpi";
import { assertEngagementAccess } from "@/lib/visibility";
import { db } from "@/lib/db";
import { NotFoundError } from "@/infra/errors";
import { parseRequestBody } from "@/lib/validation";
import { canonicalJson } from "@/lib/canonical-json-response";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";

const createKPISchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  target: z.number().optional(),
});

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const { engagementId } = params;

    const engagement = await db.engagement.findUnique({
      where: { id: engagementId },
      select: { workspaceId: true },
    });
    if (!engagement) {
      throw new NotFoundError("Engagement", engagementId);
    }

    await assertEngagementAccess(ctx.verifiedActorId, engagementId, engagement.workspaceId);

    const kpis = await getKPIsForEngagement(engagementId, engagement.workspaceId);
    return kpis;
  }
);

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const { engagementId } = params;

    const engagement = await db.engagement.findUnique({
      where: { id: engagementId },
      select: { workspaceId: true },
    });
    if (!engagement) {
      throw new NotFoundError("Engagement", engagementId);
    }

    await assertEngagementAccess(ctx.verifiedActorId, engagementId, engagement.workspaceId);

    const body = await parseRequestBody(ctx.request!, createKPISchema);
    const kpi = await createKPI(
      { engagementId, ...body },
      ctx,
      engagement.workspaceId
    );
    return canonicalJson(kpi, { status: 201 });
  }
);
