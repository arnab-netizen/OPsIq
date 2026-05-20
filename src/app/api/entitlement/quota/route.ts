/**
 * Quota API
 *
 * Check and manage quota usage for workspace.
 */

import { emitAuditEvent } from '@/infra/audit';
import { AUDIT_EVENTS } from '@/domain/constants/audit-events';
import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { UnauthorizedError } from "@/infra/errors";
import { CAPABILITIES } from "@/domain/constants/capabilities";
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
export const GET = withCanonicalEnforcement(async (ctx: CanonicalAuthContext) => {
  const workspaceId = nextRequest.headers.get("x-workspace-id");
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
}, { requireCapabilities: [CAPABILITIES.SYSTEM_ADMIN], requireWorkspace: true });

/**
 * POST /api/entitlement/quota/increment
 * Increment quota usage
 */
export const POST = withCanonicalEnforcement(async (ctx: CanonicalAuthContext) => {
  const workspaceId = nextRequest.headers.get("x-workspace-id");
  const userId = ctx.verifiedActorId;

  const nextRequest = ctx.request as any;
  const body = await nextRequest.json();
  const parsed = IncrementQuotaSchema.parse(body);

  // Check if quota available before incrementing
  const usage = getQuotaUsage(workspaceId, userId);
  const tier = getSubscriptionTier(workspaceId);
  const config = getTierConfig(tier);

  const quotaField = `${parsed.type}sCreated` as const;
  const limitField = `${parsed.type}sPerMonth` as const;
  const currentUsage = (usage as any)[quotaField] || 0;
  const limit = (config as any)[limitField] || Infinity;

  if (currentUsage >= limit) {
    throw new Error(`Quota exceeded for ${parsed.type}s`);
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
}, { requireCapabilities: [CAPABILITIES.SYSTEM_ADMIN], requireWorkspace: true });
