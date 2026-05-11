import { withAuth } from "@/lib/auth-guard";
import { withRequestContext } from "@/lib/api-handler";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { OfferEngine } from "@/services/growth/offer-engine";
import { z } from "zod/v4";
import type { NextRequest } from "next/server";

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

const effectivePriceSchema = z.object({
  basePrice: z.number().positive(),
  discountPercent: z.number().min(0).max(100),
});

const recordPerformanceSchema = z.object({
  offerId: z.string().min(1),
  conversions: z.number().nonnegative(),
  revenue: z.number().nonnegative(),
  baselineConversions: z.number().nonnegative(),
  baselineRevenue: z.number().nonnegative(),
  productionCost: z.number().nonnegative(),
});

/**
 * POST /api/growth/offers
 *
 * Create a new offer (workspace-scoped)
 * Wire: OfferEngine.createOffer()
 */
export const POST = withRequestContext(async (request) => {
  const { session } = await withAuth({
    capability: CAPABILITIES.ENGAGEMENT_UPDATE,
  });

  const nextRequest = request as NextRequest;
  const workspaceId = nextRequest.headers.get("x-workspace-id");
  if (!workspaceId) {
    return Response.json(
      { error: "Workspace ID required (x-workspace-id header)" },
      { status: 400 }
    );
  }

  const membership = await enforceWorkspaceScoping(nextRequest, workspaceId);
  if (!membership) {
    return Response.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const validated = createOfferSchema.parse(body);

    const result = OfferEngine.createOffer(workspaceId, validated);

    if (result.error) {
      return Response.json({ error: result.error }, { status: 400 });
    }

    return Response.json(result.offer, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      );
    }

    if (error instanceof Error) {
      return Response.json({ error: error.message }, { status: 400 });
    }

    return Response.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
});

/**
 * POST /api/growth/offers/effective-price
 *
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
 * POST /api/growth/offers/performance
 *
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
 * POST /api/growth/offers/compare
 *
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
