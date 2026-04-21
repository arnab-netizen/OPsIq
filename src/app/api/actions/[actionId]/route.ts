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

export const GET = withRequestContext(async (_request, context) => {
  const { actionId } = await context.params;
  parseOrThrow(uuidSchema, actionId);
  await withAuth({ capability: CAPABILITIES.ACTION_VIEW });

  const action = await getActionById(actionId);
  return Response.json(action);
});

export const PATCH = withRequestContext(async (request, context) => {
  const { actionId } = await context.params;
  parseOrThrow(uuidSchema, actionId);
  const { session } = await withAuth({
    capability: CAPABILITIES.ACTION_UPDATE,
    internalOnly: true,
  });

  const body = await parseRequestBody(request, updateActionSchema);
  await updateAction(actionId, body, session.user.id);

  const updated = await getActionById(actionId);
  return Response.json(updated);
});
