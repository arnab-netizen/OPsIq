/**
 * POST /api/owner/goals — set a business goal (requires OWNER_MANAGE).
 *   The request names the business explicitly; the server verifies it belongs to the caller's
 *   workspace and is an active, real business. Replaces only that business's current ACTIVE goal.
 *   New goals track Revenue or Net profit, in the business's currency.
 * GET  /api/owner/goals?businessId=<id> — the business's goal, the legacy workspace goal (if any),
 *   the business's goal history and trajectories (requires OWNER_VIEW). Without businessId only
 *   the legacy workspace goal is returned.
 */
import { z } from "zod/v4";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { parseOrThrow, parseRequestBody } from "@/lib/validation";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { createGoal, getGoalsOverview, NEW_GOAL_TARGET_TYPES } from "@/services/owner-strategy/goal.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const createGoalSchema = z.object({
  businessId: z.string().uuid("Choose a business for this goal"),
  targetType: z.enum(NEW_GOAL_TARGET_TYPES, "New goals can track Revenue or Net profit"),
  targetAmount: z.number().positive(),
  // Optional echo of the business currency; the server rejects any other value.
  targetCurrency: z.string().regex(/^[A-Za-z]{3}$/, "Currency must be a 3-letter code").optional(),
  targetDate: z
    .string()
    .datetime()
    .refine((v) => new Date(v).getTime() > Date.now(), "Target date must be in the future"),
  baselineAmount: z.number().nullable().optional(),
  baselineDate: z.string().datetime().nullable().optional(),
});

const scopeQuerySchema = z.object({ businessId: z.string().uuid().nullable() });

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const body = await parseRequestBody(ctx.request!, createGoalSchema);
    const goalId = await createGoal({
      workspaceId: ctx.verifiedWorkspaceId,
      actorId: ctx.verifiedActorId,
      businessId: body.businessId,
      targetType: body.targetType,
      targetAmount: body.targetAmount,
      targetCurrency: body.targetCurrency,
      targetDate: new Date(body.targetDate),
      baselineAmount: body.baselineAmount ?? null,
      baselineDate: body.baselineDate ? new Date(body.baselineDate) : null,
    });
    return canonicalJson({ goalId }, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const { businessId } = parseOrThrow(scopeQuerySchema, {
      businessId: new URL(ctx.request!.url).searchParams.get("businessId"),
    });
    const overview = await getGoalsOverview(ctx.verifiedWorkspaceId, businessId);
    return canonicalJson(overview, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);
