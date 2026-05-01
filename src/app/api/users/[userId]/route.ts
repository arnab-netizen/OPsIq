import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
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
import type { NextRequest } from "next/server";

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
  // Authenticate + authorize (fail-closed)
  await withAuth({ capability: CAPABILITIES.USER_VIEW, internalOnly: true });

  // Validate workspace membership (fail-closed)
  const nextRequest = request as NextRequest;
  const workspaceId = nextRequest.headers.get("x-workspace-id");
  if (!workspaceId) {
    return Response.json(
      { error: "Workspace ID required (x-workspace-id header)" },
      { status: 400 }
    );
  }

  const membership = await enforceWorkspaceScoping(nextRequest, workspaceId);
  if (!membership) {
    return Response.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { userId } = await context.params;
  parseOrThrow(uuidSchema, userId);

  const user = await getUserById(userId, workspaceId);
  return Response.json(user);
});

export const PATCH = withRequestContext(async (request, context) => {
  // Authenticate + authorize (fail-closed)
  const { session } = await withAuth({
    capability: CAPABILITIES.USER_UPDATE,
    internalOnly: true,
  });

  // Validate workspace membership (fail-closed)
  const nextRequest = request as NextRequest;
  const workspaceId = nextRequest.headers.get("x-workspace-id");
  if (!workspaceId) {
    return Response.json(
      { error: "Workspace ID required (x-workspace-id header)" },
      { status: 400 }
    );
  }

  const membership = await enforceWorkspaceScoping(nextRequest, workspaceId);
  if (!membership) {
    return Response.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { userId } = await context.params;
  parseOrThrow(uuidSchema, userId);

  const body = await parseRequestBody(request, updateUserSchema);
  await updateUser(userId, body, session.user.id, workspaceId);

  const updated = await getUserById(userId, workspaceId);
  return Response.json(updated);
});

export const POST = withRequestContext(async (request, context) => {
  // Auth check BEFORE body parse
  const { session } = await withAuth({
    capability: CAPABILITIES.USER_DEACTIVATE,
    internalOnly: true,
  });

  // Validate workspace membership (fail-closed)
  const nextRequest = request as NextRequest;
  const workspaceId = nextRequest.headers.get("x-workspace-id");
  if (!workspaceId) {
    return Response.json(
      { error: "Workspace ID required (x-workspace-id header)" },
      { status: 400 }
    );
  }

  const membership = await enforceWorkspaceScoping(nextRequest, workspaceId);
  if (!membership) {
    return Response.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { userId } = await context.params;
  parseOrThrow(uuidSchema, userId);

  const body = await parseRequestBody(request, actionSchema);

  if (body.action === "deactivate") {
    await deactivateUser(userId, session.user.id, body.version, workspaceId);
    return Response.json({ status: "deactivated" });
  }

  // reactivate
  await reactivateUser(userId, session.user.id, body.version, workspaceId);
  return Response.json({ status: "reactivated" });
});
