/**
 * Entitlement API
 *
 * Check subscription tier, capabilities, and quota enforcement.
 * Workspace-scoped, requires authentication.
 */

import { NextRequest } from "next/server";
import { withEnforcementFull } from "@/lib/enforced-route";
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
export const GET = withEnforcementFull(async (request: NextRequest) => {
  const workspaceId = request.headers.get("x-workspace-id") || "default";

  const tier = getSubscriptionTier(workspaceId);
  const config = getTierConfig(tier);

  return {
    success: true,
    tier,
    config,
  };
});

/**
 * POST /api/entitlement/check-capability
 * Check if workspace has a specific capability
 */
export const POST = withEnforcementFull(async (request: NextRequest) => {
  const body = await request.json();
  const parsed = CheckCapabilitySchema.parse(body);

  const workspaceId = request.headers.get("x-workspace-id") || "default";
  const allowed = hasCapability(workspaceId, parsed.capability);

  if (!allowed) {
    throw new Error(`Capability ${parsed.capability} not available on current tier`);
  }

  return {
    success: true,
    allowed: true,
    capability: parsed.capability,
  };
});
