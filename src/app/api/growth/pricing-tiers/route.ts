import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { PricingEngine } from "@/services/growth/pricing-engine";
import { ValidationError } from "@/infra/errors";
import { z } from "zod/v4";
import { NextResponse } from "next/server";
import { isProductionRuntime, demoOnlyBlockedResponse } from "@/lib/demo-write-guard";

const createTierSchema = z.object({
  name: z.string().min(1, "Tier name required"),
  entryPrice: z.number().positive("Entry price must be positive"),
  maxPrice: z.number().positive("Max price must be positive"),
  targetMargin: z.number().min(0).max(1, "Target margin must be 0-1"),
  features: z.array(z.string()).min(1, "At least one feature required"),
  status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]).optional(),
});

/**
 * POST /api/growth/pricing-tiers
 *
 * Create a new price tier (workspace-scoped).
 *
 * DEMO-ONLY / NON-PERSISTENT: PricingEngine stores tiers in an in-memory Map
 * (lost on restart, not multi-instance safe, no audit event). This route is
 * therefore blocked in production (503 NOT_PERSISTED_DEMO_ONLY) until durable,
 * tenant-scoped, audited persistence is added.
 * Wire: PricingEngine.createPriceTier()
 */
export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const workspaceId = ctx.verifiedWorkspaceId;

    // Fail closed in production: this write is backed only by an in-memory Map.
    if (isProductionRuntime()) {
      return demoOnlyBlockedResponse("pricing-tiers");
    }

    const body = ctx.request ? await ctx.request.json() : {};
    const validated = createTierSchema.parse(body);

    const result = PricingEngine.createPriceTier(workspaceId, validated);

    if (result.error) {
      throw new ValidationError(result.error);
    }

    return result.tier;
  },
  { requireWorkspace: true, requireCapabilities: [CAPABILITIES.ENGAGEMENT_UPDATE] }
);

/**
 * OPTIONS /api/growth/pricing-tiers
 * CORS preflight for optimize endpoint
 */
export async function OPTIONS(): Promise<NextResponse> {
  return NextResponse.json({}, { status: 200 });
}
