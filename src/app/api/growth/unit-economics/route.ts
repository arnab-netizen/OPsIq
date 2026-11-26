import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { UnitEconomicsEngine } from "@/services/growth/unit-economics-engine";
import { z } from "zod/v4";

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

const calculateLTVCACSchema = z.object({
  ltv: z.number().nonnegative(),
  cac: z.number().nonnegative(),
});

const calculateContributionSchema = z.object({
  revenuePerUnit: z.number().positive(),
  variableCostPerUnit: z.number().nonnegative(),
  fixedCostsPerMonth: z.number().nonnegative(),
  unitsSoldPerMonth: z.number().nonnegative(),
});

const calculateRetentionValueSchema = z.object({
  cac: z.number().nonnegative(),
  monthlyProfit: z.number(),
  monthlyChurnRate: z.number().min(0).max(1),
  retentionImprovementPercent: z.number().min(0).max(100),
});

const assessHealthSchema = z.object({
  ltv: z.number().nonnegative(),
  cac: z.number().nonnegative(),
  paybackMonths: z.number().nonnegative(),
  monthlyProfit: z.number(),
});

/**
 * POST /api/growth/unit-economics
 *
 * Dispatches to the appropriate UnitEconomicsEngine method based on the
 * presence of discriminating body fields.
 *
 * Discriminator priority:
 *   totalAcquisitionSpend  → calculateCAC
 *   avgMonthlyRevenue      → calculateLTV
 *   cac + monthlyProfit (no ltv) → calculateCACPayback
 *   ltv + cac              → calculateLTVCACRatio
 *   revenuePerUnit         → calculateContributionMetrics
 *   monthlyChurnRate       → calculateRetentionValue
 *   default                → assessUnitEconomicsHealth
 */
export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const workspaceId = ctx.verifiedWorkspaceId;
    const body = await ctx.request!.json();

    if (body.totalAcquisitionSpend !== undefined) {
      const v = calculateCACSchema.parse(body);
      return canonicalJson(
        UnitEconomicsEngine.calculateCAC(workspaceId, v.totalAcquisitionSpend, v.newCustomersAcquired),
        { status: 200 }
      );
    }

    if (body.avgMonthlyRevenue !== undefined) {
      const v = calculateLTVSchema.parse(body);
      return canonicalJson(
        UnitEconomicsEngine.calculateLTV(workspaceId, v.avgMonthlyRevenue, v.avgMonthlyChurn, v.grossMargin),
        { status: 200 }
      );
    }

    if (body.revenuePerUnit !== undefined) {
      const v = calculateContributionSchema.parse(body);
      return canonicalJson(
        UnitEconomicsEngine.calculateContributionMetrics(
          workspaceId, v.revenuePerUnit, v.variableCostPerUnit, v.fixedCostsPerMonth, v.unitsSoldPerMonth
        ),
        { status: 200 }
      );
    }

    if (body.monthlyChurnRate !== undefined) {
      const v = calculateRetentionValueSchema.parse(body);
      return canonicalJson(
        UnitEconomicsEngine.calculateRetentionValue(
          workspaceId, v.cac, v.monthlyProfit, v.monthlyChurnRate, v.retentionImprovementPercent
        ),
        { status: 200 }
      );
    }

    if (body.ltv !== undefined && body.cac !== undefined && body.paybackMonths === undefined) {
      const v = calculateLTVCACSchema.parse(body);
      return canonicalJson(
        UnitEconomicsEngine.calculateLTVCACRatio(workspaceId, v.ltv, v.cac),
        { status: 200 }
      );
    }

    if (body.cac !== undefined && body.monthlyProfit !== undefined && body.ltv === undefined) {
      const v = calculateCACPaybackSchema.parse(body);
      return canonicalJson(
        UnitEconomicsEngine.calculateCACPayback(workspaceId, v.cac, v.monthlyProfit),
        { status: 200 }
      );
    }

    const v = assessHealthSchema.parse(body);
    return canonicalJson(
      UnitEconomicsEngine.assessUnitEconomicsHealth(workspaceId, v.ltv, v.cac, v.paybackMonths, v.monthlyProfit),
      { status: 200 }
    );
  },
  {
    requireCapabilities: [CAPABILITIES.ENGAGEMENT_UPDATE],
    requireWorkspace: true,
  }
);
