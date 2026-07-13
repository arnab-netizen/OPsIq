import { classifyOperatorError } from "@/lib/operator-error-governance";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { AcquisitionEngine } from "@/services/growth/acquisition-engine";
import { AcquisitionChannel } from "@/domain/growth/growth-engines";
import { z } from "zod/v4";

const recordMetricsSchema = z.object({
  channel: z.nativeEnum(AcquisitionChannel),
  month: z.string().regex(/^\d{4}-\d{2}$/, "Month must be YYYY-MM format"),
  leads: z.number().nonnegative("Leads must be non-negative"),
  qualifiedLeads: z.number().nonnegative("Qualified leads must be non-negative").optional(),
  conversions: z.number().nonnegative("Conversions must be non-negative"),
  costPerLead: z.number().nonnegative("Cost per lead must be non-negative"),
  costPerAcquisition: z.number().nonnegative("Cost per acquisition must be non-negative"),
  targetCPA: z.number().nonnegative("Target CPA must be non-negative"),
});

const analyzeConversionSchema = z.object({
  channel: z.nativeEnum(AcquisitionChannel),
  month: z.string(),
  leads: z.number().positive(),
  qualifiedLeads: z.number().nonnegative().optional(),
  conversions: z.number().nonnegative(),
  costPerLead: z.number().nonnegative(),
  costPerAcquisition: z.number().nonnegative(),
  targetCPA: z.number().nonnegative(),
});

/**
 * POST /api/growth/acquisition-metrics
 *
 * Record acquisition metrics for a channel (workspace-scoped)
 * Wire: AcquisitionEngine.recordMetrics()
 */
export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const workspaceId = ctx.verifiedWorkspaceId;

    try {
      const body = await ctx.request?.json() || {};
      const validated = recordMetricsSchema.parse(body);

      const result = AcquisitionEngine.recordMetrics(workspaceId, validated);

      if (result.error) {
        return canonicalJson({ error: result.error }, { status: 400 });
      }

      return canonicalJson(result.metrics, { status: 201 });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return canonicalJson(
          { error: "Validation error", details: error.issues },
          { status: 400 }
        );
      }
      if (error instanceof Error) {
        return canonicalJson({ error: classifyOperatorError(error, { context: "load" }).operatorMessage }, { status: 400 });
      }
      return canonicalJson({ error: "Internal server error" }, { status: 500 });
    }
  },
  {
    requireCapabilities: [CAPABILITIES.ENGAGEMENT_UPDATE],
    requireWorkspace: true,
  }
);

/**
 * POST /api/growth/acquisition-metrics/analyze-conversion
 *
 * Analyze conversion rates for acquisition metrics
 * Wire: AcquisitionEngine.analyzeConversion()
 */
export async function analyzeConversionHandler(
  workspaceId: string,
  metrics: any
): Promise<any> {
  if (!workspaceId) {
    return { error: "Workspace ID required" };
  }

  return AcquisitionEngine.analyzeConversion(workspaceId, metrics);
}

/**
 * POST /api/growth/acquisition-metrics/roi
 *
 * Calculate ROI for acquisition channel
 * Wire: AcquisitionEngine.calculateROI()
 */
export async function calculateROIHandler(
  workspaceId: string,
  metrics: any,
  ltv: number
): Promise<any> {
  if (!workspaceId) {
    return { error: "Workspace ID required" };
  }

  return AcquisitionEngine.calculateROI(workspaceId, metrics, ltv);
}
