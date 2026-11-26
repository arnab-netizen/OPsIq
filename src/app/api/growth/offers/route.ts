import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { OfferEngine } from "@/services/growth/offer-engine";
import { ValidationError } from "@/infra/errors";
import { z } from "zod/v4";

const createOfferSchema = z.object({
  name: z.string().min(1, "Offer name is required"),
  basePrice: z.number().positive("Base price must be positive"),
  discountPercent: z.number().min(0).max(100, "Discount must be 0-100%"),
  bundledFeatures: z.array(z.string().min(1)).min(1, "At least one feature is required"),
  validFrom: z.coerce.date().optional(),
  validUntil: z.coerce.date().optional(),
  status: z.enum(["DRAFT", "ACTIVE", "EXPIRED"]).optional(),
  maxUses: z.number().positive().optional(),
});

/**
 * POST /api/growth/offers
 *
 * Create a new offer (workspace-scoped)
 * Wire: OfferEngine.createOffer()
 */
export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const workspaceId = ctx.verifiedWorkspaceId;

    const body = ctx.request ? await ctx.request.json() : {};
    const validated = createOfferSchema.parse(body);

    const result = OfferEngine.createOffer(workspaceId, validated);

    if (result.error) {
      throw new ValidationError(result.error);
    }

    return result.offer;
  },
  { requireWorkspace: true, requireCapabilities: [CAPABILITIES.ENGAGEMENT_UPDATE] }
);

/**
 * Calculate effective price with discount
 * Wire: OfferEngine.calculateEffectivePrice()
 */
export async function calculateEffectivePriceHandler(
  workspaceId: string,
  basePrice: number,
  discountPercent: number
): Promise<any> {
  if (!workspaceId) {
    return { error: "Workspace ID required" };
  }

  return OfferEngine.calculateEffectivePrice(workspaceId, basePrice, discountPercent);
}

/**
 * Record offer performance metrics
 * Wire: OfferEngine.recordPerformance()
 */
export async function recordPerformanceHandler(
  workspaceId: string,
  offerId: string,
  conversions: number,
  revenue: number,
  baselineConversions: number,
  baselineRevenue: number,
  productionCost: number
): Promise<any> {
  if (!workspaceId) {
    return { error: "Workspace ID required" };
  }

  return OfferEngine.recordPerformance(
    workspaceId,
    offerId,
    conversions,
    revenue,
    baselineConversions,
    baselineRevenue,
    productionCost
  );
}

/**
 * Compare multiple offers
 * Wire: OfferEngine.compareOffers()
 */
export async function compareOffersHandler(
  workspaceId: string,
  offers: any[]
): Promise<any> {
  if (!workspaceId) {
    return { error: "Workspace ID required" };
  }

  return OfferEngine.compareOffers(workspaceId, offers);
}
