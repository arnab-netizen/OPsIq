/**
 * Quota API
 *
 * Check and manage quota usage for workspace.
 */

import { NextRequest } from "next/server";
import { UnauthorizedError } from "@/infra/errors";
import { withEnforcementFull } from "@/lib/enforced-route";
import { withAuth } from "@/lib/auth-guard";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
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
export const GET = withEnforcementFull(async (request: NextRequest) => {
  // Authenticate user (fail-closed)
  const auth = await withAuth();

  // Get workspace ID from header
  const workspaceId = request.headers.get("x-workspace-id");
  if (!workspaceId) {
    throw new Error("Workspace ID required (x-workspace-id header)");
  }

  // Verify user is member of workspace (fail-closed)
  const membership = await enforceWorkspaceScoping(request, workspaceId);
  if (!membership) {
    throw new UnauthorizedError("Unauthorized");
  }

  const userId = auth.session.user.id;

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
});

/**
 * POST /api/entitlement/quota/increment
 * Increment quota usage
 */
export const POST = withEnforcementFull(async (request: NextRequest) => {
  // Authenticate user (fail-closed)
  const auth = await withAuth();

  // Get workspace ID from header
  const workspaceId = request.headers.get("x-workspace-id");
  if (!workspaceId) {
    throw new Error("Workspace ID required (x-workspace-id header)");
  }

  // Verify user is member of workspace (fail-closed)
  const membership = await enforceWorkspaceScoping(request, workspaceId);
  if (!membership) {
    throw new UnauthorizedError("Unauthorized");
  }

  const userId = auth.session.user.id;

  const body = await request.json();
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
});
