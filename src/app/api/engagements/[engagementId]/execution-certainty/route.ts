import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { calculateExecutionCertainty } from "@/services/execution-certainty";
import { assertEngagementAccess } from "@/lib/visibility";
import { parseOrThrow, uuidSchema } from "@/lib/validation";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withCanonicalEnforcement(async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
  const { engagementId } = params;
  parseOrThrow(uuidSchema, engagementId);

  await assertEngagementAccess(ctx.verifiedActorId, engagementId, ctx.verifiedWorkspaceId);

  // Fetch engagement with health status (scoped by workspace)
  const engagement = await db.engagement.findUnique({
    where: { id: engagementId, workspaceId: ctx.verifiedWorkspaceId },
  });

  if (!engagement) {
    return Response.json(
      { error: "Engagement not found" },
      { status: 404 }
    );
  }

  // Fetch all required data in parallel (all scoped by workspace)
  const [findings, recommendations, actions, condition] = await Promise.all([
    db.finding.findMany({
      where: { engagementId, workspaceId: ctx.verifiedWorkspaceId },
    }),
    db.recommendation.findMany({
      where: { engagementId, workspaceId: ctx.verifiedWorkspaceId },
    }),
    db.action.findMany({
      where: { engagementId, workspaceId: ctx.verifiedWorkspaceId },
    }),
    db.businessConditionProfile.findFirst({
      where: { engagementId, isCurrent: true, workspaceId: ctx.verifiedWorkspaceId },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // Map data to execution-certainty format
  const findingsForCertainty = findings.map((f: typeof findings[0]) => ({
    id: f.id,
    severity: (f.severity as "critical" | "high" | "medium" | "low") || "low",
    resolved: f.status === "resolved" || f.status === "closed",
    verified: f.verified ?? false,
  }));

  const recommendationsForCertainty = recommendations.map((r: typeof recommendations[0]) => ({
    id: r.id,
    priority: (r.priority as "critical" | "high" | "medium" | "low") || "medium",
    status: (r.status as "blocked" | "in_progress" | "completed") || "in_progress",
  }));

  const actionsForCertainty = actions.map((a: typeof actions[0]) => ({
    id: a.id,
    priority: (a.priority as "critical" | "high" | "medium" | "low") || "medium",
    status: (a.status as "blocked" | "pending" | "in_progress" | "completed" | "verified") || "pending",
  }));

  // Map health status
  const healthStatus = (engagement.healthStatus as "critical" | "at_risk" | "stable" | "healthy") || "stable";
  const kpiTrend = condition
    ? (condition.businessStatus === "deteriorating" ? "deteriorating" : "improving")
    : "flat";

  // Calculate execution certainty
  const result = calculateExecutionCertainty(
    engagementId,
    findingsForCertainty,
    recommendationsForCertainty,
    actionsForCertainty,
    [], // evidence not yet integrated
    {
      overallStatus: healthStatus,
      kpiTrend: kpiTrend as "deteriorating" | "flat" | "improving",
    }
  );

  return Response.json({
    score: result.score,
    level: result.level,
    blockers: result.blockers,
    risks: result.risks,
    reasons: result.reasons,
  });
}, {
  requireCapabilities: [CAPABILITIES.ENGAGEMENT_VIEW],
  requireWorkspace: true,
});
