/**
 * GET  /api/growth/pricing-tiers — list persisted price tiers for the workspace.
 * POST /api/growth/pricing-tiers — create a new price tier (workspace-scoped, DB-backed).
 *
 * A tier requires explicit owner approval (approvalStatus) before operational use.
 * Derived margin is NOT stored — computed at read time from price and costs.
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { parseRequestBody } from "@/lib/validation";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { PricingEngine } from "@/services/growth/pricing-engine";
import { z } from "zod/v4";

const quantityBreakSchema = z.object({
  minQty: z.number().int().positive(),
  price: z.number().nonnegative(),
});

const discountItemSchema = z.object({
  type: z.string().min(1),
  value: z.number().min(0),
});

const createTierSchema = z.object({
  name: z.string().min(1, "Tier name required"),
  currency: z.string().length(3, "Currency must be a 3-letter ISO code").optional(),
  unitOfMeasure: z.string().min(1).optional(),
  entryPrice: z.number().nonnegative("Entry price must be non-negative"),
  maxPrice: z.number().nonnegative("Max price must be non-negative"),
  variableCost: z.number().nonnegative().optional(),
  allocatedCost: z.number().nonnegative().optional(),
  customerSegment: z.string().optional(),
  channel: z.string().optional(),
  quantityBreaks: z.array(quantityBreakSchema).optional(),
  discountStructure: z.array(discountItemSchema).optional(),
  features: z.array(z.string()).optional(),
  status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]).optional(),
  approvalStatus: z.enum(["draft", "pending_approval", "approved", "archived"]).optional(),
  provenance: z.string().optional(),
  effectiveFrom: z.string().datetime().optional(),
  effectiveTo: z.string().datetime().optional(),
});

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    return PricingEngine.listTiers(ctx.verifiedWorkspaceId);
  },
  { requireWorkspace: true, requireCapabilities: [CAPABILITIES.ENGAGEMENT_VIEW] }
);

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const body = await parseRequestBody(ctx.request!, createTierSchema);

    const tier = await PricingEngine.createPriceTier(
      ctx.verifiedWorkspaceId,
      ctx.verifiedActorId,
      body
    );

    return canonicalJson(tier, { status: 201 });
  },
  { requireWorkspace: true, requireCapabilities: [CAPABILITIES.ENGAGEMENT_UPDATE] }
);
