import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { updateActionStatus } from "@/services/action";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { assertEngagementAccess } from "@/lib/visibility";
import { db } from "@/lib/db";
import { NotFoundError } from "@/infra/errors";
import { z } from "zod/v4";
import { ACTION_STATUSES } from "@/domain/constants/statuses";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Status vocabulary is the domain's ACTION_STATUSES (the service validates against it and its
// transition map); "open"/"deferred" were never valid Action statuses and always failed with 422.
const updateActionSchema = z.object({
  status: z.enum(ACTION_STATUSES).optional(),
  blockageReason: z.string().optional(),
  version: z.number().int(),
});

export const PATCH = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const { actionId } = params;
    parseOrThrow(uuidSchema, actionId);

    const body = await parseRequestBody(ctx.request!, updateActionSchema);

    // Fetch action to verify engagement access
    const action = await db.action.findFirst({
      where: { id: actionId, engagement: { workspaceId: ctx.verifiedWorkspaceId } },
      select: { engagementId: true },
    });
    if (!action) throw new NotFoundError("Action", actionId);

    await assertEngagementAccess(ctx.verifiedActorId, action.engagementId, ctx.verifiedWorkspaceId);

    const updated = await updateActionStatus(actionId, body, ctx, ctx.verifiedWorkspaceId);
    return updated;
  },
  { requireCommercial: "governed_execution",
    requireCapabilities: [CAPABILITIES.ACTION_UPDATE],
    requireWorkspace: true,
  }
);
