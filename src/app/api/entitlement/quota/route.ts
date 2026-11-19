/**
 * Quota API
 *
 * Check and manage quota usage for workspace.
 */

import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { z } from "zod";
import {
  getQuotaUsage,
  incrementQuotaUsage,
  getTierConfig,
  getSubscriptionTier,
} from "@/services/entitlement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { PlanLimitError } from "@/infra/errors";

const IncrementQuotaSchema = z.object({
  type: z.enum(["action", "decision", "experiment", "export"]),
});

/**
 * GET /api/entitlement/quota
 * Get quota usage for workspace
 */
export const GET = withCanonicalEnforcement(async (ctx: CanonicalAuthContext) => {
  const workspaceId = ctx.verifiedWorkspaceId;
  const userId = ctx.verifiedActorId;

  const usage = getQuotaUsage(workspaceId, userId);
  const tier = getSubscriptionTier(workspaceId);
  const config = getTierConfig(tier);

  return {
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
  };
}, { requireWorkspace: true, requireCapabilities: [CAPABILITIES.OWNER_VIEW] });

/**
 * POST /api/entitlement/quota/increment
 * Increment quota usage
 */
export const POST = withCanonicalEnforcement(async (ctx: CanonicalAuthContext) => {
  const workspaceId = ctx.verifiedWorkspaceId;
  const userId = ctx.verifiedActorId;

  const body: unknown = await ctx.request!.json();
  const parsed = IncrementQuotaSchema.parse(body);

  // Check if quota available before incrementing
  const usage = getQuotaUsage(workspaceId, userId);
  const tier = getSubscriptionTier(workspaceId);
  const config = getTierConfig(tier);

  const quotaField = `${parsed.type}sCreated` as const;
  const limitField = `${parsed.type}sPerMonth` as const;
  // Indexed by the request's operation type; a field the usage/config shape lacks (e.g. "exportsCreated") reads as
  // undefined -> 0 usage / unlimited, exactly as before.
  const currentUsage = (usage as unknown as Record<string, number | undefined>)[quotaField] || 0;
  const limit = (config as unknown as Record<string, number | undefined>)[limitField] || Infinity;

  if (currentUsage >= limit) {
    // The repo-wide plan-limit denial contract: PlanLimitError (402 PLAN_LIMIT_EXCEEDED), never a raw 500.
    throw new PlanLimitError(`${parsed.type}s_per_month`, `Quota exceeded for ${parsed.type}s`);
  }

  incrementQuotaUsage(workspaceId, userId, parsed.type);

  const updatedUsage = getQuotaUsage(workspaceId, userId);

  return {
    success: true,
    usage: updatedUsage,
    remaining: {
      actions: Math.max(0, config.actionsPerMonth - (updatedUsage.actionsCreated || 0)),
      decisions: Math.max(0, config.decisionsPerMonth - (updatedUsage.decisionsCreated || 0)),
      experiments: Math.max(0, config.experimentsPerMonth - (updatedUsage.experimentsCreated || 0)),
    },
  };
}, { requireWorkspace: true, requireCapabilities: [CAPABILITIES.OWNER_VIEW] });
