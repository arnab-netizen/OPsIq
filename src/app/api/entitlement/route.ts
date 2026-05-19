/**
 * Entitlement API
 *
 * Check subscription tier, capabilities, and quota enforcement.
 * Workspace-scoped, requires authentication.
 */

import { z } from "zod";
import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
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
export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const workspaceId = ctx.verifiedWorkspaceId;

    const tier = getSubscriptionTier(workspaceId);
    const config = getTierConfig(tier);

    return {
      success: true,
      tier,
      config,
    };
  },
  { requireCapabilities: [CAPABILITIES.SYSTEM_ADMIN], requireWorkspace: true }
);

/**
 * POST /api/entitlement/check-capability
 * Check if workspace has a specific capability
 */
export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const workspaceId = ctx.verifiedWorkspaceId;

    const body = await ctx.request!.json();
    const parsed = CheckCapabilitySchema.parse(body);
    const allowed = hasCapability(workspaceId, parsed.capability);

    if (!allowed) {
      throw new Error(`Capability ${parsed.capability} not available on current tier`);
    }

    return {
      success: true,
      allowed: true,
      capability: parsed.capability,
    };
  },
  { requireCapabilities: [CAPABILITIES.SYSTEM_ADMIN], requireWorkspace: true }
);
