/**
 * Entitlement API
 *
 * Check subscription tier, capabilities, and quota enforcement.
 * Workspace-scoped, requires authentication.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getSubscriptionTier,
  getTierConfig,
  hasCapability,
  hasFeature,
  canCreateAction,
  canCreateDecision,
  canCreateExperiment,
  canExportData,
  hasApiAccess,
  getQuotaUsage,
  Capability,
  SubscriptionTier,
} from "@/services/entitlement";

const CheckCapabilitySchema = z.object({
  capability: z.nativeEnum(Capability),
});

const GetQuotaSchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/), // YYYY-MM format
});

/**
 * GET /api/entitlement/tier
 * Get workspace subscription tier
 */
export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.headers.get("x-workspace-id") || "default";

    const tier = getSubscriptionTier(workspaceId);
    const config = getTierConfig(tier);

    return NextResponse.json({
      success: true,
      tier,
      config,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to get subscription tier" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/entitlement/check-capability
 * Check if workspace has a specific capability
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = CheckCapabilitySchema.parse(body);

    const workspaceId = request.headers.get("x-workspace-id") || "default";
    const allowed = hasCapability(workspaceId, parsed.capability);

    if (!allowed) {
      return NextResponse.json(
        {
          success: false,
          allowed: false,
          error: `Capability ${parsed.capability} not available on current tier`,
        },
        { status: 403 }
      );
    }

    return NextResponse.json({
      success: true,
      allowed: true,
      capability: parsed.capability,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Failed to check capability" },
      { status: 500 }
    );
  }
}
