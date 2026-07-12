import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { UnitEconomicsEngine } from "@/services/growth/unit-economics-engine";
import { z } from "zod/v4";
import { classifyOperatorError } from "@/lib/operator-error-governance";

const calculateCACSchema = z.object({
  totalAcquisitionSpend: z.number().nonnegative("Spend must be non-negative"),
  newCustomersAcquired: z.number().positive("Customer count must be positive"),
});

const calculateLTVSchema = z.object({
  avgMonthlyRevenue: z.number().positive("Monthly revenue must be positive"),
  avgMonthlyChurn: z.number().min(0).max(1, "Churn must be 0-1"),
  grossMargin: z.number().min(0).max(1, "Margin must be 0-1"),
});

const calculateCACPaybackSchema = z.object({
  cac: z.number().nonnegative("CAC must be non-negative"),
  monthlyProfit: z.number().nonnegative("Monthly profit must be non-negative"),
});

const assessHealthSchema = z.object({
  ltv: z.number().nonnegative(),
  cac: z.number().nonnegative(),
  paybackMonths: z.number().nonnegative(),
  monthlyProfit: z.number(),
});

/**
 * POST /api/growth/unit-economics/cac
 *
 * Calculate customer acquisition cost (workspace-scoped)
 * Wire: UnitEconomicsEngine.calculateCAC()
 */
export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const workspaceId = ctx.verifiedWorkspaceId;

    try {
      const body = await ctx.request?.json() || {};
      const request = ctx.request!;

      // Route to appropriate handler based on path segment or body structure
      const pathSegments = request.nextUrl.pathname.split("/");
      const action = pathSegments[pathSegments.length - 1];

      if (action === "cac" || body.totalAcquisitionSpend !== undefined) {
        const validated = calculateCACSchema.parse(body);
        const result = UnitEconomicsEngine.calculateCAC(
          workspaceId,
          validated.totalAcquisitionSpend,
          validated.newCustomersAcquired
        );
        return canonicalJson(result, { status: 201 });
      } else if (action === "ltv" || body.avgMonthlyRevenue !== undefined) {
        const validated = calculateLTVSchema.parse(body);
        const result = UnitEconomicsEngine.calculateLTV(
          workspaceId,
          validated.avgMonthlyRevenue,
          validated.avgMonthlyChurn,
          validated.grossMargin
        );
        return canonicalJson(result, { status: 201 });
      } else if (action === "payback" || body.cac !== undefined) {
        const validated = calculateCACPaybackSchema.parse(body);
        const result = UnitEconomicsEngine.calculateCACPayback(
          workspaceId,
          validated.cac,
          validated.monthlyProfit
        );
        return canonicalJson(result, { status: 201 });
      } else {
        const validated = assessHealthSchema.parse(body);
        const result = UnitEconomicsEngine.assessUnitEconomicsHealth(
          workspaceId,
          validated.ltv,
          validated.cac,
          validated.paybackMonths,
          validated.monthlyProfit
        );
        return canonicalJson(result, { status: 201 });
      }
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
 * POST /api/growth/unit-economics/ratio
 *
 * Calculate LTV:CAC ratio
 * Wire: UnitEconomicsEngine.calculateLTVCACRatio()
 */
export async function calculateLTVCACRatioHandler(
  workspaceId: string,
  ltv: number,
  cac: number
): Promise<any> {
  if (!workspaceId) {
    return { error: "Workspace ID required" };
  }

  return UnitEconomicsEngine.calculateLTVCACRatio(workspaceId, ltv, cac);
}

/**
 * POST /api/growth/unit-economics/contribution
 *
 * Calculate contribution metrics
 * Wire: UnitEconomicsEngine.calculateContributionMetrics()
 */
export async function calculateContributionHandler(
  workspaceId: string,
  revenuePerUnit: number,
  variableCostPerUnit: number,
  fixedCostsPerMonth: number,
  unitsSoldPerMonth: number
): Promise<any> {
  if (!workspaceId) {
    return { error: "Workspace ID required" };
  }

  return UnitEconomicsEngine.calculateContributionMetrics(
    workspaceId,
    revenuePerUnit,
    variableCostPerUnit,
    fixedCostsPerMonth,
    unitsSoldPerMonth
  );
}

/**
 * POST /api/growth/unit-economics/retention-value
 *
 * Calculate retention value impact
 * Wire: UnitEconomicsEngine.calculateRetentionValue()
 */
export async function calculateRetentionValueHandler(
  workspaceId: string,
  cac: number,
  monthlyProfit: number,
  monthlyChurnRate: number,
  retentionImprovementPercent: number
): Promise<any> {
  if (!workspaceId) {
    return { error: "Workspace ID required" };
  }

  return UnitEconomicsEngine.calculateRetentionValue(
    workspaceId,
    cac,
    monthlyProfit,
    monthlyChurnRate,
    retentionImprovementPercent
  );
}
