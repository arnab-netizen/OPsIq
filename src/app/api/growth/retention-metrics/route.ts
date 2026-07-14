/**
 * POST /api/growth/retention-metrics — record a retention cohort (workspace-scoped, DB-backed).
 * GET  /api/growth/retention-metrics — list persisted cohorts for the workspace.
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { RetentionEngine } from "@/services/growth/retention-engine";
import { canonicalJson } from "@/lib/canonical-json-response";
import { parseRequestBody } from "@/lib/validation";
import { z } from "zod/v4";

const recordMetricsSchema = z.object({
  cohortMonth: z.string().regex(/^\d{4}-\d{2}$/, "Cohort month must be YYYY-MM format"),
  cohortSize: z.number().int().positive("Cohort size must be a positive integer").optional(),
  monthlyRetention: z.record(z.string(), z.number().min(0).max(1, "Retention rates must be 0–1")),
  avgMonthlyChurn: z.number().min(0).max(1, "Average monthly churn must be 0–1"),
});

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    return RetentionEngine.listCohorts(ctx.verifiedWorkspaceId);
  },
  { requireWorkspace: true, requireCapabilities: [CAPABILITIES.ENGAGEMENT_VIEW] }
);

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const body = await parseRequestBody(ctx.request!, recordMetricsSchema);

    const monthlyRetention: Record<number, number> = {};
    Object.entries(body.monthlyRetention).forEach(([key, value]) => {
      monthlyRetention[parseInt(key, 10)] = value;
    });

    const metrics = await RetentionEngine.recordMetrics(ctx.verifiedWorkspaceId, ctx.verifiedActorId, {
      cohortMonth: body.cohortMonth,
      cohortSize: body.cohortSize,
      monthlyRetention,
      avgMonthlyChurn: body.avgMonthlyChurn,
    });

    return canonicalJson(metrics, { status: 201 });
  },
  { requireWorkspace: true, requireCapabilities: [CAPABILITIES.ENGAGEMENT_UPDATE] }
);
