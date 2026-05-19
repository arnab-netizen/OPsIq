import { emitAuditEvent } from '@/infra/audit';
import { AUDIT_EVENTS } from '@/domain/constants/audit-events';
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { withEnforcementFull } from "@/lib/enforced-route";
import { withAuth, canonicalizeAuthContext } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { updateActionStatus } from "@/services/action";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { assertEngagementAccess } from "@/lib/visibility";
import { db } from "@/lib/db";
import { NotFoundError } from "@/infra/errors";
import { z } from "zod/v4";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const updateActionSchema = z.object({
  status: z.enum(["open", "in_progress", "completed", "blocked", "deferred"]).optional(),
  blockageReason: z.string().optional(),
  version: z.number().int(),
});

export const PATCH = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const { actionId } = params;
    parseOrThrow(uuidSchema, actionId);

    const body = await parseRequestBody(ctx.request!, updateActionSchema);

    // Fetch action to verify engagement access
    const action = await db.action.findUnique({
      where: { id: actionId, workspaceId: ctx.verifiedWorkspaceId },
      select: { engagementId: true },
    });
    if (!action) throw new NotFoundError("Action", actionId);

    await assertEngagementAccess(ctx.verifiedActorId, action.engagementId, ctx.verifiedWorkspaceId);

    const updated = await updateActionStatus(actionId, body, ctx, ctx.verifiedWorkspaceId);
    return Response.json(updated);
  },
  {
    requireCapabilities: [CAPABILITIES.ACTION_UPDATE],
    requireWorkspace: true,
  }
);
