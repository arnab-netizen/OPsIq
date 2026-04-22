import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { updateActionStatus } from "@/services/action";
import { parseRequestBody } from "@/lib/validation";
import { z } from "zod/v4";

const updateActionSchema = z.object({
  status: z.enum(["open", "in_progress", "completed", "blocked", "deferred"]).optional(),
  blockageReason: z.string().optional(),
  version: z.number().int(),
});

export const PATCH = withRequestContext(async (request, context) => {
  const { actionId } = await context.params;
  const { session } = await withAuth();
  const body = await parseRequestBody(request, updateActionSchema);

  const updated = await updateActionStatus(actionId, body, session.user.id);
  return Response.json(updated);
});
