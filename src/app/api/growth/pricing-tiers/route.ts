import { withEnforcementFull } from "@/lib/enforced-route";
import { withAuth } from "@/lib/auth-guard";
import { withRequestContext } from "@/lib/api-handler";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { PricingEngine } from "@/services/growth/pricing-engine";
import { z } from "zod/v4";
import type { NextRequest } from "next/server";

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
 * Create a new price tier (workspace-scoped)
 * Wire: PricingEngine.createPriceTier()
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
    const validated = createTierSchema.parse(body);

    const result = PricingEngine.createPriceTier(workspaceId, validated);

    if (result.error) {
      return Response.json({ error: result.error }, { status: 400 });
    }

    return Response.json(result.tier, { status: 201 });
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
 * OPTIONS /api/growth/pricing-tiers
 *
 * CORS preflight for optimize endpoint
 */
export const OPTIONS = withEnforcementFull(async (request: NextRequest) => {
  return { status: 200 };
});
