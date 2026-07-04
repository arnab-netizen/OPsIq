import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { checkWorkspaceRateLimit } from "@/middleware/rate-limit";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { createAction, listActions } from "@/services/action";
import { parseRequestBody, parseSearchParams } from "@/lib/validation";
import { withIdempotency } from "@/infra/idempotency";
import { z } from "zod/v4";
import { paginationSchema } from "@/lib/validation";
import { assertCapability, resolveWorkspaceTier } from "@/services/entitlement.service";
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

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const workspaceId = ctx.verifiedWorkspaceId;
    const params = parseSearchParams(ctx.request!.url, listActionsSchema);
    const result = await listActions(workspaceId, params);
    return result;
  },
  { requireWorkspace: true, requireCapabilities: ['ACTION_VIEW'] }
);

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const workspaceId = ctx.verifiedWorkspaceId;

    // Require Idempotency-Key (fail-closed)
    const idempotencyKey = ctx.request?.headers.get("Idempotency-Key");
    if (!idempotencyKey) {
      throw new Error("Idempotency-Key header required");
    }

    // Check rate limiting: workspace requests/hour limit.
    // BILL-01: tier is resolved SERVER-SIDE from the workspace's active subscription,
    // never from a client-supplied x-tier header (which allowed quota elevation).
    const tier: SubscriptionTier = await resolveWorkspaceTier(workspaceId);
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

    const body = await parseRequestBody(ctx.request!, createActionSchema);

    const { isNew, result } = await withIdempotency(
      idempotencyKey,
      "action.create",
      async () => createAction(body, ctx, workspaceId),
      body,
      ctx.verifiedActorId
    );

    return result;
  },
  { requireCapabilities: ["ACTION_CREATE"], requireWorkspace: true }
);
