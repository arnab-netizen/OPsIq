import { NextRequest } from "next/server";
import { withEnforcementFull } from "@/lib/enforced-route";
import { withAuth } from "@/lib/auth-guard";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { checkWorkspaceRateLimit } from "@/middleware/rate-limit";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { createAction, listActions } from "@/services/action";
import { parseRequestBody, parseSearchParams } from "@/lib/validation";
import { withIdempotency } from "@/infra/idempotency";
import { z } from "zod/v4";
import { paginationSchema } from "@/lib/validation";
import { assertCapability } from "@/services/entitlement.service";
import { PlanLimitError } from "@/infra/errors";
import { getTierConfig, type SubscriptionTier } from "@/lib/tier-config";

const createActionSchema = z.object({
  engagementId: z.string().uuid(),
  recommendationId: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().optional(),
  dueDate: z.string().optional(),
  priority: z.enum(["low", "medium", "high", "critical"]),
  assignedTo: z.string().uuid().optional(),
});

const listActionsSchema = paginationSchema.extend({
  engagementId: z.string().uuid().optional(),
  recommendationId: z.string().uuid().optional(),
  status: z.string().optional(),
  assignedTo: z.string().uuid().optional(),
});

const handleGet = async (request: NextRequest) => {
  // Authenticate + authorize (fail-closed)
  // Database initialization is guaranteed by getSession() in auth.ts
  await withAuth({ capability: CAPABILITIES.ACTION_VIEW });

  // Validate workspace membership (fail-closed)
  const workspaceId = request.headers.get("x-workspace-id");
  if (!workspaceId) {
    throw new Error("Workspace ID required (x-workspace-id header)");
  }

  const membership = await enforceWorkspaceScoping(request, workspaceId);
  if (!membership) {
    throw new Error("Unauthorized");
  }

  const params = parseSearchParams(request.url, listActionsSchema);
  const result = await listActions(workspaceId, params);

  return result;
};

const handlePost = async (request: NextRequest) => {
  // Authenticate + authorize (fail-closed)
  // Database initialization is guaranteed by getSession() in auth.ts
  const authContext = await withAuth({
    capability: CAPABILITIES.ACTION_CREATE,
    internalOnly: true,
  });

  // Validate workspace membership (fail-closed)
  const workspaceId = request.headers.get("x-workspace-id");
  if (!workspaceId) {
    throw new Error("Workspace ID required (x-workspace-id header)");
  }

  // Require Idempotency-Key (fail-closed)
  const idempotencyKey = request.headers.get("Idempotency-Key");
  if (!idempotencyKey) {
    throw new Error("Idempotency-Key header required");
  }

  const membership = await enforceWorkspaceScoping(request, workspaceId);
  if (!membership) {
    throw new Error("Unauthorized");
  }

  // Check rate limiting: workspace requests/hour limit
  const tier: SubscriptionTier = (request.headers.get("x-tier") as SubscriptionTier) || "free";
  const rateLimit = checkWorkspaceRateLimit(workspaceId, tier);
  if (!rateLimit.allowed) {
    const config = getTierConfig(tier);
    throw new Error(`Rate limit exceeded: ${config.limits.requestsPerHour} requests/hour`);
  }

  // Check capability: action_create
  const capabilityCheck = await assertCapability(workspaceId, "action_create");
  if (!capabilityCheck.allowed) {
    throw new PlanLimitError("action_create", capabilityCheck.reason || "Plan limit exceeded");
  }

  const body = await parseRequestBody(request, createActionSchema);

  const { isNew, result } = await withIdempotency(
    idempotencyKey,
    "action.create",
    async () => createAction(body, authContext, workspaceId),
    body,
    authContext.session.user.id
  );

  return result;
};

export const GET = withEnforcementFull(handleGet);
export const POST = withEnforcementFull(handlePost);
