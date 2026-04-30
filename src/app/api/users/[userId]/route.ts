import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import {
  getUserById,
  updateUser,
  deactivateUser,
  reactivateUser,
} from "@/services/user";
import { parseRequestBody } from "@/lib/validation";
import { uuidSchema } from "@/lib/validation";
import { parseOrThrow } from "@/lib/validation";
import { z } from "zod/v4";

const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.email().optional(),
  version: z.number().int().min(1),
});

const deactivateSchema = z.object({
  action: z.literal("deactivate"),
  version: z.number().int().min(1),
});

const reactivateSchema = z.object({
  action: z.literal("reactivate"),
  version: z.number().int().min(1),
});

const actionSchema = z.discriminatedUnion("action", [
  deactivateSchema,
  reactivateSchema,
]);

export const GET = withRequestContext(async (request, context) => {
  const workspaceId = request.headers.get("x-workspace-id") || "";
  const { userId } = await context.params;
  parseOrThrow(uuidSchema, userId);
  await withAuth({ capability: CAPABILITIES.USER_VIEW, internalOnly: true });

  const user = await getUserById(userId, workspaceId);
  return Response.json(user);
});

export const PATCH = withRequestContext(async (request, context) => {
  const workspaceId = request.headers.get("x-workspace-id") || "";
  const { userId } = await context.params;
  parseOrThrow(uuidSchema, userId);
  const { session } = await withAuth({
    capability: CAPABILITIES.USER_UPDATE,
    internalOnly: true,
  });

  const body = await parseRequestBody(request, updateUserSchema);
  await updateUser(userId, body, session.user.id, workspaceId);

  const updated = await getUserById(userId, workspaceId);
  return Response.json(updated);
});

export const POST = withRequestContext(async (request, context) => {
  const workspaceId = request.headers.get("x-workspace-id") || "";
  const { userId } = await context.params;
  parseOrThrow(uuidSchema, userId);

  // Auth check BEFORE body parse
  const { session } = await withAuth({
    capability: CAPABILITIES.USER_DEACTIVATE,
    internalOnly: true,
  });

  const body = await parseRequestBody(request, actionSchema);

  if (body.action === "deactivate") {
    await deactivateUser(userId, session.user.id, body.version, workspaceId);
    return Response.json({ status: "deactivated" });
  }

  // reactivate
  await reactivateUser(userId, session.user.id, body.version, workspaceId);
  return Response.json({ status: "reactivated" });
});
