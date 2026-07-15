/**
 * POST /api/growth/pricing-tiers/[tierId]/supersede
 *
 * Creates a new version of an existing tier (append-only versioning).
 * The old tier is archived (status=ARCHIVED, supersededById=newId).
 * The new tier starts as DRAFT/pending_approval and requires explicit approval before use.
 * Both mutations are atomic (single DB transaction).
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
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

const supersedeTierSchema = z.object({
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
  features: z.array(z.string()).min(1, "At least one feature required").optional(),
  provenance: z.string().optional(),
  effectiveFrom: z.string().datetime().optional(),
  effectiveTo: z.string().datetime().optional(),
});

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    parseOrThrow(uuidSchema, params.tierId);
    const body = await parseRequestBody(ctx.request!, supersedeTierSchema);
    const tier = await PricingEngine.supersedeTier(
      ctx.verifiedWorkspaceId,
      params.tierId,
      ctx.verifiedActorId,
      body
    );
    return canonicalJson(tier, { status: 201 });
  },
  { requireWorkspace: true, requireCapabilities: [CAPABILITIES.ENGAGEMENT_UPDATE] }
);
