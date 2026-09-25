/**
 * POST /api/owner/goals — declare a financial goal (requires OWNER_MANAGE).
 *   Marks any current ACTIVE goal as REVISED before creating the new one.
 * GET  /api/owner/goals — retrieve the active goal (requires OWNER_VIEW).
 */
import { z } from "zod/v4";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { parseRequestBody } from "@/lib/validation";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { createGoal, getActiveGoal } from "@/services/owner-strategy/goal.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const createGoalSchema = z.object({
  targetType: z.enum(["PROFIT", "REVENUE", "NET_WORTH", "MULTIPLE"]),
  targetAmount: z.number().positive(),
  // Omitted → resolved server-side from the workspace's business currency.
  targetCurrency: z.string().regex(/^[A-Za-z]{3}$/, "Currency must be a 3-letter code").optional(),
  targetDate: z
    .string()
    .datetime()
    .refine((v) => new Date(v).getTime() > Date.now(), "Target date must be in the future"),
  baselineAmount: z.number().nullable().optional(),
  baselineDate: z.string().datetime().nullable().optional(),
});

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const body = await parseRequestBody(ctx.request!, createGoalSchema);
    const goalId = await createGoal({
      workspaceId: ctx.verifiedWorkspaceId,
      actorId: ctx.verifiedActorId,
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
    const goal = await getActiveGoal(ctx.verifiedWorkspaceId);
    return canonicalJson({ goal }, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);
