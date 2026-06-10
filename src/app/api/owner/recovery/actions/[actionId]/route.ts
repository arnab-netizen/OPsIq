/**
 * GET   /api/owner/recovery/actions/[actionId]  — action detail (OWNER_VIEW)
 * PATCH /api/owner/recovery/actions/[actionId]  — assign/transition/annotate (OWNER_MANAGE)
 *       body: { status?, assignedToUserId?, completionNotes?, actualOutcome?, version }
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { z } from "zod/v4";
import { getRecoveryAction, updateRecoveryAction } from "@/services/founder-recovery/action.service";
import { RECOVERY_ACTION_STATUSES } from "@/domain/founder-recovery/action-status";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const updateSchema = z.object({
  status: z.enum(RECOVERY_ACTION_STATUSES).optional(),
  assignedToUserId: z.string().uuid().nullable().optional(),
  completionNotes: z.string().max(2000).optional(),
  actualOutcome: z.string().max(2000).optional(),
  version: z.number().int(),
});

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    parseOrThrow(uuidSchema, params.actionId);
    return getRecoveryAction(params.actionId, ctx.verifiedWorkspaceId);
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);

export const PATCH = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    parseOrThrow(uuidSchema, params.actionId);
    const input = await parseRequestBody(ctx.request!, updateSchema);
    return updateRecoveryAction(params.actionId, input, ctx.verifiedActorId, ctx.verifiedWorkspaceId);
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
