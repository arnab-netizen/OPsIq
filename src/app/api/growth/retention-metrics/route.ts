import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { RetentionEngine } from "@/services/growth/retention-engine";
import { ValidationError } from "@/infra/errors";
import { z } from "zod/v4";
import { isProductionRuntime, demoOnlyBlockedResponse } from "@/lib/demo-write-guard";

const recordMetricsSchema = z.object({
  cohortMonth: z.string().regex(/^\d{4}-\d{2}$/, "Cohort month must be YYYY-MM format"),
  cohortSize: z.number().positive("Cohort size must be positive"),
  monthlyRetention: z.record(z.string(), z.number().min(0).max(1, "Retention rates must be 0-1")),
  avgMonthlyChurn: z.number().min(0).max(1, "Average monthly churn must be 0-1"),
});

/**
 * POST /api/growth/retention-metrics
 *
 * Record retention metrics for a cohort (workspace-scoped).
 *
 * DEMO-ONLY / NON-PERSISTENT: RetentionEngine stores metrics/churn in in-memory
 * Maps (lost on restart, not multi-instance safe, no audit event). This route is
 * therefore blocked in production (503 NOT_PERSISTED_DEMO_ONLY) until durable,
 * tenant-scoped, audited persistence is added.
 * Wire: RetentionEngine.recordMetrics()
 */
export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const workspaceId = ctx.verifiedWorkspaceId;

    // Fail closed in production: this write is backed only by in-memory Maps.
    if (isProductionRuntime()) {
      return demoOnlyBlockedResponse("retention-metrics");
    }

    const body = ctx.request ? await ctx.request.json() : {};
    const validated = recordMetricsSchema.parse(body);

    // Convert monthlyRetention keys from string to number for service call
    const monthlyRetention: Record<number, number> = {};
    Object.entries(validated.monthlyRetention).forEach(([key, value]) => {
      monthlyRetention[parseInt(key, 10)] = value;
    });

    const result = RetentionEngine.recordMetrics(workspaceId, {
      cohortMonth: validated.cohortMonth,
      cohortSize: validated.cohortSize,
      monthlyRetention,
      avgMonthlyChurn: validated.avgMonthlyChurn,
    });

    if (result.error) {
      throw new ValidationError(result.error);
    }

    return result.metrics;
  },
  { requireWorkspace: true, requireCapabilities: [CAPABILITIES.ENGAGEMENT_UPDATE] }
);

/**
 * Assess churn risk for retention metrics
 * Wire: RetentionEngine.assessChurnRisk()
 */
export async function assessChurnRiskHandler(
  workspaceId: string,
  metrics: any
): Promise<any> {
  if (!workspaceId) {
    return { error: "Workspace ID required" };
  }

  return RetentionEngine.assessChurnRisk(workspaceId, metrics);
}

/**
 * Forecast churn for upcoming periods
 * Wire: RetentionEngine.forecastChurn()
 */
export async function forecastChurnHandler(
  workspaceId: string,
  monthlyRetention: Record<number, number>,
  trendDays?: number
): Promise<any> {
  if (!workspaceId) {
    return { error: "Workspace ID required" };
  }

  return RetentionEngine.forecastChurn(workspaceId, monthlyRetention, trendDays);
}
