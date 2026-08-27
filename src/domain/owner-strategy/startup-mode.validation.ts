/**
 * Owner Strategy — Startup Mode request validation (Zod). Validates the
 * owner-supplied startup intake + candidate ideas for the runtime validation
 * endpoint. All fields optional so missing data stays honest (never invented).
 */
import { z } from "zod";

const lmh = z.enum(["low", "medium", "high"]);
const qual = z.enum(["none", "weak", "moderate", "strong"]);
const revFreq = z.enum(["one_off", "occasional", "recurring", "subscription"]);
const expPath = z.enum(["none", "local", "multi_unit", "asset_light_scalable", "product", "marketplace"]);

const wealthPathInputSchema = z
  .object({
    grossMarginPct: z.number().nullable().optional(),
    netMarginPct: z.number().nullable().optional(),
    monthlyRevenue: z.number().nullable().optional(),
    cashRunwayMonths: z.number().nullable().optional(),
    timeToCashMonths: z.number().nullable().optional(),
    revenueFrequency: revFreq.nullable().optional(),
    repeatCustomerPct: z.number().nullable().optional(),
    customerAcquisitionDifficulty: lmh.nullable().optional(),
    demandValidated: z.boolean().nullable().optional(),
    ownerIsPrimaryOperator: z.boolean().nullable().optional(),
    staffCanRunWithoutOwner: z.boolean().nullable().optional(),
    ownerHoursPerWeek: z.number().nullable().optional(),
    differentiation: qual.nullable().optional(),
    pricingPower: qual.nullable().optional(),
    competitiveMoat: qual.nullable().optional(),
    expansionPath: expPath.nullable().optional(),
    capitalIntensity: lmh.nullable().optional(),
    workingCapitalPressure: lmh.nullable().optional(),
    downsideRisk: lmh.nullable().optional(),
    regulatoryBurden: lmh.nullable().optional(),
    trendDeclining: z.boolean().nullable().optional(),
  })
  .strict();

export const startupIntakeSchema = z
  .object({
    location: z.string().max(200).nullable().optional(),
    capitalAvailable: z.number().nullable().optional(),
    monthlySurvivalNeed: z.number().nullable().optional(),
    hoursPerWeekAvailable: z.number().nullable().optional(),
    skills: z.array(z.string().max(120)).max(50).nullable().optional(),
    existingAssets: z.array(z.string().max(120)).max(50).nullable().optional(),
    riskTolerance: lmh.nullable().optional(),
    targetMonthlyIncome: z.number().nullable().optional(),
    preferredIndustries: z.array(z.string().max(120)).max(50).nullable().optional(),
    canSell: z.boolean().nullable().optional(),
    canOperateDaily: z.boolean().nullable().optional(),
    fastCashVsScale: z.enum(["fast_cash", "long_term_scale"]).nullable().optional(),
  })
  .strict();

export const startupIdeaSchema = z
  .object({
    name: z.string().min(1).max(200),
    industry: z.string().min(1).max(200),
    structural: wealthPathInputSchema,
    estimatedStartupCost: z.number().nullable().optional(),
    estimatedMonthlyRevenue: z.number().nullable().optional(),
    estimatedMonthlyCost: z.number().nullable().optional(),
    timeToFirstRevenueMonths: z.number().nullable().optional(),
    jurisdictionKnown: z.boolean().nullable().optional(),
  })
  .strict();

export const startupValidateRequestSchema = z.object({
  intake: startupIntakeSchema,
  ideas: z.array(startupIdeaSchema).min(1).max(20),
});

export type StartupValidateRequest = z.infer<typeof startupValidateRequestSchema>;

/**
 * Owner-supplied screening profile (BusinessFitProfile), used by the SCREEN
 * action (POST .../analysis/route.ts). NOT the same concept as PATCH
 * .../profile/route.ts's `profileData` — that endpoint versions a separate,
 * intentionally free-form owner context bag (e.g. wealthGoalAnnualCents,
 * availableWeeklyHours) with no fixed shape; do not reuse this schema there.
 * riskTolerance is uppercase here (distinct from startupIntakeSchema's
 * lowercase riskTolerance above) to match the domain's existing
 * BusinessFitProfile convention; callers deriving this from intake must
 * case-convert explicitly.
 */
export const startupScreeningProfileSchema = z
  .object({
    capitalAvailableCents: z.number().nullable().optional(),
    ownerHoursPerWeek: z.number().nullable().optional(),
    riskTolerance: z.enum(["LOW", "MEDIUM", "HIGH"]).nullable().optional(),
    location: z.string().nullable().optional(),
    cashRunwayMonthsAvailable: z.number().nullable().optional(),
    minimumMonthlyIncomeNeededCents: z.number().nullable().optional(),
    priorIndustryExperience: z.boolean().nullable().optional(),
    regulatoryExperience: z.boolean().nullable().optional(),
    existingNetworkStrength: z.number().nullable().optional(),
  })
  .strict();

/**
 * Close a StartupInitiative's funded outcome (F-STARTUP-OUTCOME-LOOP). Mirrors
 * the owner-budget `InitiativeCloseInput` contract exactly (same fields, same
 * semantics) so classification reuses classifyBudgetOutcome unchanged.
 * `outcomeVerified` is required (no default) — the owner must explicitly say
 * whether the impact numbers below are verified; an unverified outcome is
 * never silently treated as a success by the classifier.
 */
export const startupInitiativeCloseSchema = z
  .object({
    cancelled: z.boolean().optional(),
    overridden: z.boolean().optional(),
    externalFactor: z.boolean().optional(),
    outcomeVerified: z.boolean(),
    expectedImpact: z.number().finite().nullable().optional(),
    actualImpact: z.number().finite().nullable().optional(),
    expectedSpend: z.number().finite().nonnegative().nullable().optional(),
    actualSpend: z.number().finite().nonnegative().nullable().optional(),
    note: z.string().max(2000).optional(),
  })
  .strict();
export type StartupInitiativeCloseInput = z.infer<typeof startupInitiativeCloseSchema>;
