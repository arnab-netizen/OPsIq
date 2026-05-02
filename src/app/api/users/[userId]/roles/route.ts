import { withRequestContext } from "@/lib/api-handler";
import { withAuth, getActorHierarchyLevel } from "@/lib/auth-guard";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import {
  assignRole,
  revokeRole,
  getRolesForUser,
} from "@/services/role-assignment";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { checkIdempotencyKey, recordIdempotencyResponse, recordIdempotencyError } from "@/services/idempotency";
import { z } from "zod/v4";
import { ROLES } from "@/domain/constants/roles";
import type { NextRequest } from "next/server";

const roleValues = Object.values(ROLES) as [string, ...string[]];

const assignRoleSchema = z.object({
  role: z.enum(roleValues),
  scope: z.string().optional(),
  scopeId: z.string().uuid().optional(),
});

const revokeRoleSchema = z.object({
  role: z.enum(roleValues),
  scope: z.string().optional(),
  scopeId: z.string().uuid().optional(),
});

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

  const roles = await getRolesForUser(userId);
  return Response.json({ roles });
});

export const POST = withRequestContext(async (request, context) => {
  // Authenticate + authorize (fail-closed)
  const { session, policy } = await withAuth({
    capability: CAPABILITIES.USER_ASSIGN_ROLE,
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

  const membershipCheck = await enforceWorkspaceScoping(nextRequest, workspaceId);
  if (!membershipCheck) {
    return Response.json({ error: "Unauthorized" }, { status: 403 });
  }

  const idempotencyKey = request.headers.get("idempotency-key");
  if (!idempotencyKey) {
    return Response.json(
      { error: "idempotency-key header required" },
      { status: 400 }
    );
  }

  const { userId } = await context.params;
  parseOrThrow(uuidSchema, userId);

  const body = await parseRequestBody(request, assignRoleSchema);
  const actorLevel = getActorHierarchyLevel(policy);

  const idempotencyCheck = await checkIdempotencyKey({
    idempotencyKey,
    operationName: "assignRole",
    actorId: session.user.id,
    payload: { userId, ...body },
  });

  if (!idempotencyCheck.isNew && idempotencyCheck.cachedResponse) {
    return Response.json(idempotencyCheck.cachedResponse.body, {
      status: idempotencyCheck.cachedResponse.status,
    });
  }

  try {
    const result = await assignRole(
      { userId, ...body } as Parameters<typeof assignRole>[0],
      session.user.id,
      actorLevel
    );
    await recordIdempotencyResponse(idempotencyKey, result.isNew ? 201 : 200, result);
    return Response.json(result, { status: result.isNew ? 201 : 200 });
  } catch (error) {
    const err = error instanceof Error ? error : new Error("Unknown error");
    await recordIdempotencyError(idempotencyKey, err);
    throw error;
  }
});

export const DELETE = withRequestContext(async (request, context) => {
  // Authenticate + authorize (fail-closed)
  const { session, policy } = await withAuth({
    capability: CAPABILITIES.USER_ASSIGN_ROLE,
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

  const membershipCheck = await enforceWorkspaceScoping(nextRequest, workspaceId);
  if (!membershipCheck) {
    return Response.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { userId } = await context.params;
  parseOrThrow(uuidSchema, userId);

  const body = await parseRequestBody(request, revokeRoleSchema);
  const actorLevel = getActorHierarchyLevel(policy);

  await revokeRole(
    { userId, ...body } as Parameters<typeof revokeRole>[0],
    session.user.id,
    actorLevel
  );

  return Response.json({ status: "revoked" });
});
