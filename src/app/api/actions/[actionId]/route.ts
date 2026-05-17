import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getActionById, updateAction } from "@/services/action";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { z } from "zod/v4";
import { ACTION_STATUSES } from "@/domain/constants/statuses";

const updateActionSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  dueDate: z.string().optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).optional(),
  status: z.enum(ACTION_STATUSES).optional(),
  assignedTo: z.string().uuid().optional(),
  completedAt: z.string().optional(),
  verifiedAt: z.string().optional(),
  blockerReason: z.string().optional(),
  notes: z.string().optional(),
  version: z.number().int().min(1),
});

export const GET = withCanonicalEnforcement(
  async (ctx, params) => {
    const { actionId } = params;
    parseOrThrow(uuidSchema, actionId);

    const action = await getActionById(actionId, ctx.verifiedWorkspaceId);
    return Response.json(action);
  },
  {
    requireWorkspace: true,
    requireCapabilities: [CAPABILITIES.ACTION_VIEW],
  }
);

export const PATCH = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const { actionId } = params;
    parseOrThrow(uuidSchema, actionId);

    const body = await parseRequestBody(ctx.request!, updateActionSchema);

    await updateAction(actionId, body, ctx, ctx.verifiedWorkspaceId);

    const updated = await getActionById(actionId, ctx.verifiedWorkspaceId);
    return Response.json(updated);
  },
  {
    requireCapabilities: [CAPABILITIES.ACTION_UPDATE],
    requireWorkspace: true,
  }
);
