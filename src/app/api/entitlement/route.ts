/**
 * Entitlement API
 *
 * Check subscription tier, capabilities, and quota enforcement.
 * Workspace-scoped, requires authentication.
 */

import { z } from "zod";
import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import {
  getSubscriptionTier,
  getTierConfig,
  hasCapability,
  Capability,
} from "@/services/entitlement";
import { CAPABILITIES } from "@/domain/constants/capabilities";

const CheckCapabilitySchema = z.object({
  capability: z.nativeEnum(Capability),
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
  }, { requireWorkspace: true, requireCapabilities: [CAPABILITIES.OWNER_VIEW] }
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
  }, { requireWorkspace: true, requireCapabilities: [CAPABILITIES.OWNER_VIEW] }
);
