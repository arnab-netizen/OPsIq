import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { createAction, listActions } from "@/services/action";
import { parseRequestBody, parseSearchParams } from "@/lib/validation";
import { z } from "zod/v4";
import { paginationSchema } from "@/lib/validation";

const createActionSchema = z.object({
  engagementId: z.string().uuid(),
  recommendationId: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().optional(),
  dueDate: z.string().optional(),
  priority: z.enum(["low", "medium", "high", "critical"]),
  assignedTo: z.string().uuid().optional(),
});

const listActionsSchema = paginationSchema.extend({
  engagementId: z.string().uuid().optional(),
  recommendationId: z.string().uuid().optional(),
  status: z.string().optional(),
  assignedTo: z.string().uuid().optional(),
});

export const GET = withRequestContext(async (request) => {
  await withAuth({ capability: CAPABILITIES.ACTION_VIEW });

  const params = parseSearchParams(request.url, listActionsSchema);
  const result = await listActions(params);

  return Response.json(result);
});

export const POST = withRequestContext(async (request) => {
  const { session } = await withAuth({
    capability: CAPABILITIES.ACTION_CREATE,
    internalOnly: true,
  });

  const body = await parseRequestBody(request, createActionSchema);
  const result = await createAction(body, session.user.id);

  return Response.json(result, { status: 201 });
});
