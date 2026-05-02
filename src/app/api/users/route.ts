import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { createUser, listUsers } from "@/services/user";
import { parseRequestBody, parseSearchParams } from "@/lib/validation";
import { withIdempotency } from "@/infra/idempotency";
import { z } from "zod/v4";
import { paginationSchema } from "@/lib/validation";
import type { NextRequest } from "next/server";

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

  const params = parseSearchParams(request.url, listUsersSchema);
  const result = await listUsers(workspaceId, params);

  return Response.json(result);
});

export const POST = withRequestContext(async (request) => {
  // Authenticate + authorize (fail-closed)
  const authContext = await withAuth({
    capability: CAPABILITIES.USER_CREATE,
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

  // Require Idempotency-Key (fail-closed)
  const idempotencyKey = nextRequest.headers.get("Idempotency-Key");
  if (!idempotencyKey) {
    return Response.json(
      { error: "Idempotency-Key header required" },
      { status: 400 }
    );
  }

  const membership = await enforceWorkspaceScoping(nextRequest, workspaceId);
  if (!membership) {
    return Response.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await parseRequestBody(request, createUserSchema);

  const { isNew, result } = await withIdempotency(
    idempotencyKey,
    "user.create",
    async () => createUser(body, authContext, workspaceId),
    body,
    authContext.session.user.id
  );

  return Response.json(result, { status: isNew ? 201 : 200 });
});
