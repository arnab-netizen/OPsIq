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

export const GET = withRequestContext(async (_request, context) => {
  const { userId } = await context.params;
  await withAuth({ capability: CAPABILITIES.USER_VIEW, internalOnly: true });

  const user = await getUserById(userId);
  return Response.json(user);
});

export const PATCH = withRequestContext(async (request, context) => {
  const { userId } = await context.params;
  const { session } = await withAuth({
    capability: CAPABILITIES.USER_UPDATE,
    internalOnly: true,
  });

  const body = await parseRequestBody(request, updateUserSchema);
  await updateUser(userId, body, session.user.id);

  const updated = await getUserById(userId);
  return Response.json(updated);
});

export const POST = withRequestContext(async (request, context) => {
  const { userId } = await context.params;
  const body = await parseRequestBody(request, actionSchema);

  if (body.action === "deactivate") {
    const { session } = await withAuth({
      capability: CAPABILITIES.USER_DEACTIVATE,
      internalOnly: true,
    });
    await deactivateUser(userId, session.user.id, body.version);
    return Response.json({ status: "deactivated" });
  }

  // reactivate
  const { session } = await withAuth({
    capability: CAPABILITIES.USER_DEACTIVATE, // reactivation requires same permission
    internalOnly: true,
  });
  await reactivateUser(userId, session.user.id, body.version);
  return Response.json({ status: "reactivated" });
});
