/**
 * Quota API
 *
 * Check and manage quota usage for workspace.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getQuotaUsage,
  incrementQuotaUsage,
  getTierConfig,
  getSubscriptionTier,
} from "@/services/entitlement";

const IncrementQuotaSchema = z.object({
  type: z.enum(["action", "decision", "experiment", "export"]),
});

/**
 * GET /api/entitlement/quota
 * Get quota usage for workspace
 */
export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get("x-user-id") || "anonymous";
    const workspaceId = request.headers.get("x-workspace-id") || "default";

    const usage = getQuotaUsage(workspaceId, userId);
    const tier = getSubscriptionTier(workspaceId);
    const config = getTierConfig(tier);

    return NextResponse.json({
      success: true,
      usage,
      limits: {
        actions: config.actionsPerMonth,
        decisions: config.decisionsPerMonth,
        experiments: config.experimentsPerMonth,
      },
      remaining: {
        actions: Math.max(0, config.actionsPerMonth - usage.actionsCreated),
        decisions: Math.max(0, config.decisionsPerMonth - usage.decisionsCreated),
        experiments: Math.max(0, config.experimentsPerMonth - usage.experimentsCreated),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to get quota usage" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/entitlement/quota/increment
 * Increment quota usage
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = IncrementQuotaSchema.parse(body);

    const userId = request.headers.get("x-user-id") || "anonymous";
    const workspaceId = request.headers.get("x-workspace-id") || "default";

    // Check if quota available before incrementing
    const usage = getQuotaUsage(workspaceId, userId);
    const tier = getSubscriptionTier(workspaceId);
    const config = getTierConfig(tier);

    const quotaField = `${parsed.type}sCreated` as const;
    const limitField = `${parsed.type}sPerMonth` as const;
    const currentUsage = (usage as any)[quotaField] || 0;
    const limit = (config as any)[limitField] || Infinity;

    if (currentUsage >= limit) {
      return NextResponse.json(
        {
          success: false,
          error: `Quota exceeded for ${parsed.type}s`,
          current: currentUsage,
          limit,
        },
        { status: 429 }
      );
    }

    incrementQuotaUsage(workspaceId, userId, parsed.type);

    const updatedUsage = getQuotaUsage(workspaceId, userId);

    return NextResponse.json({
      success: true,
      usage: updatedUsage,
      remaining: {
        actions: Math.max(0, config.actionsPerMonth - (updatedUsage.actionsCreated || 0)),
        decisions: Math.max(0, config.decisionsPerMonth - (updatedUsage.decisionsCreated || 0)),
        experiments: Math.max(0, config.experimentsPerMonth - (updatedUsage.experimentsCreated || 0)),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Failed to increment quota" },
      { status: 500 }
    );
  }
}
