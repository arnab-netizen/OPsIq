import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { createUser, listUsers } from "@/services/user";
import { parseRequestBody, parseSearchParams } from "@/lib/validation";
import { z } from "zod/v4";
import { paginationSchema } from "@/lib/validation";

const createUserSchema = z.object({
  email: z.email(),
  name: z.string().min(1).optional(),
});

const listUsersSchema = paginationSchema.extend({
  isActive: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
  search: z.string().optional(),
});

export const GET = withRequestContext(async (request) => {
  const workspaceId = request.headers.get("x-workspace-id") || "";
  await withAuth({ capability: CAPABILITIES.USER_VIEW, internalOnly: true });

  const params = parseSearchParams(request.url, listUsersSchema);
  const result = await listUsers(workspaceId, params);

  return Response.json(result);
});

export const POST = withRequestContext(async (request) => {
  const workspaceId = request.headers.get("x-workspace-id") || "";
  const { session } = await withAuth({
    capability: CAPABILITIES.USER_CREATE,
    internalOnly: true,
  });

  const body = await parseRequestBody(request, createUserSchema);
  const result = await createUser(body, session.user.id, workspaceId);

  return Response.json(result, { status: 201 });
});
