import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
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

export const GET = withRequestContext(async (request, context) => {
  const { actionId } = await context.params;
  parseOrThrow(uuidSchema, actionId);
  await withAuth({ capability: CAPABILITIES.ACTION_VIEW });

  const workspaceId = request.headers.get("x-workspace-id") || "";
  const action = await getActionById(actionId, workspaceId);
  return Response.json(action);
});

export const PATCH = withRequestContext(async (request, context) => {
  const { actionId } = await context.params;
  parseOrThrow(uuidSchema, actionId);
  const { session } = await withAuth({
    capability: CAPABILITIES.ACTION_UPDATE,
    internalOnly: true,
  });

  const workspaceId = request.headers.get("x-workspace-id") || "";
  const body = await parseRequestBody(request, updateActionSchema);
  await updateAction(actionId, body, session.user.id, workspaceId);

  const updated = await getActionById(actionId, workspaceId);
  return Response.json(updated);
});
