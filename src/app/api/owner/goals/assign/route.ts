/**
 * POST /api/owner/goals/assign — owner-confirmed assignment of the ACTIVE legacy workspace goal to
 * one business (requires OWNER_MANAGE). The legacy goal is not re-scoped in place: it becomes
 * REVISED and a business goal with the same target is created (audited). `confirm: true` is
 * required so the transition is always a deliberate owner action.
 */
import { z } from "zod/v4";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { parseRequestBody } from "@/lib/validation";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { assignLegacyGoalToBusiness } from "@/services/owner-strategy/goal.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const assignSchema = z.object({
  legacyGoalId: z.string().uuid(),
  businessId: z.string().uuid("Choose the business this goal belongs to"),
  confirm: z.literal(true, "Confirm the assignment"),
});

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const body = await parseRequestBody(ctx.request!, assignSchema);
    const goalId = await assignLegacyGoalToBusiness({
      workspaceId: ctx.verifiedWorkspaceId,
      actorId: ctx.verifiedActorId,
      legacyGoalId: body.legacyGoalId,
      businessId: body.businessId,
    });
    return canonicalJson({ goalId }, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
