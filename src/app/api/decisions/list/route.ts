import { db } from "@/lib/db";
import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const workspaceId = ctx.verifiedWorkspaceId;
    const userId = ctx.verifiedActorId;

    // Get filter from query params
    const status = ctx.request?.nextUrl.searchParams.get("status");
    const limit = Math.min(parseInt(ctx.request?.nextUrl.searchParams.get("limit") || "100"), 1000);
    const offset = Math.max(parseInt(ctx.request?.nextUrl.searchParams.get("offset") || "0"), 0);

    // Build filter
    const where: any = {
      workspaceId,
    };

    if (status && ["pending", "blocked", "approved", "done", "failed"].includes(status)) {
      where.status = status;
    }

    // Fetch decisions
    const decisionsRaw = await db.operatorItem.findMany({
      where,
      select: {
        id: true,
        problem: true,
        action: true,
        impactExpected: true,
        confidence: true,
        status: true,
        blockStage: true,
        blockReason: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: limit,
      skip: offset,
    });

    const total = await db.operatorItem.count({ where });

    return {
      decisions: decisionsRaw.map((d: typeof decisionsRaw[0]) => ({
        id: d.id,
        title: d.problem,
        status: d.status,
        impact: d.impactExpected,
        confidence: d.confidence,
        blockStage: d.blockStage,
        blockReason: d.blockReason,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
      })),
      total,
      limit,
      offset,
    };
  },
  { requireCapabilities: [CAPABILITIES.DECISION_VIEW], requireWorkspace: true }
);
