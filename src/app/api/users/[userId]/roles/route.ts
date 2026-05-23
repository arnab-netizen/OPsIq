import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { UnauthorizedError, ForbiddenError } from "@/infra/errors";
import { resolveServerRole } from "@/services/auth/server-role";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import {
  assignRole,
  revokeRole,
  getRolesForUser,
} from "@/services/role-assignment";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { checkIdempotencyKey, recordIdempotencyResponse, recordIdempotencyError } from "@/services/idempotency";
import { z } from "zod/v4";
import { ROLES, type RoleName } from "@/domain/constants/roles";
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

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const workspaceId = ctx.verifiedWorkspaceId;
    const { userId } = params;
    parseOrThrow(uuidSchema, userId);

    const roles = await getRolesForUser(userId, workspaceId);
    return Response.json({ roles });
  },
  { requireWorkspace: true, requireCapabilities: ['USER_VIEW'] }
);

export const POST = withCanonicalEnforcement(async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
  const workspaceId = ctx.verifiedWorkspaceId;
  const idempotencyKey = ctx.request?.headers.get("idempotency-key");
  if (!idempotencyKey) {
    return Response.json(
      { error: "idempotency-key header required" },
      { status: 400 }
    );
  }

  const { userId } = params;
  parseOrThrow(uuidSchema, userId);

  const body = await parseRequestBody(ctx.request!, assignRoleSchema);

  const role = await resolveServerRole();
  const policy = {
    userId: ctx.verifiedActorId,
    roles: role ? [{ role: role as RoleName, scope: undefined, scopeId: undefined }] : [],
  };
  const actorLevel = getActorHierarchyLevel(policy);

  const idempotencyCheck = await checkIdempotencyKey({
    idempotencyKey,
    operationName: "assignRole",
    actorId: ctx.verifiedActorId,
    payload: { userId, ...body },
    workspaceId,
  });

  if (!idempotencyCheck.isNew && idempotencyCheck.cachedResponse) {
    return Response.json(idempotencyCheck.cachedResponse.body, {
      status: idempotencyCheck.cachedResponse.status,
    });
  }

  try {
    const result = await assignRole(
      { userId, ...body } as Parameters<typeof assignRole>[0],
      ctx.verifiedActorId,
      actorLevel,
      workspaceId
    );
    await recordIdempotencyResponse(idempotencyKey, result.isNew ? 201 : 200, result);
    return Response.json(result, { status: result.isNew ? 201 : 200 });
  } catch (error) {
    const err = error instanceof Error ? error : new Error("Unknown error");
    await recordIdempotencyError(idempotencyKey, err);
    throw error;
  }
}, { requireWorkspace: true, requireCapabilities: [CAPABILITIES.USER_ASSIGN_ROLE] });

export const DELETE = withCanonicalEnforcement(async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
  const workspaceId = ctx.verifiedWorkspaceId;

  const { userId } = params;
  parseOrThrow(uuidSchema, userId);

  const body = await parseRequestBody(ctx.request!, revokeRoleSchema);

  const role = await resolveServerRole();
  const policy = {
    userId: ctx.verifiedActorId,
    roles: role ? [{ role: role as RoleName, scope: undefined, scopeId: undefined }] : [],
  };
  const actorLevel = getActorHierarchyLevel(policy);

  await revokeRole(
    { userId, ...body } as Parameters<typeof revokeRole>[0],
    ctx.verifiedActorId,
    actorLevel,
    workspaceId
  );

  return Response.json({ status: "revoked" });
}, { requireWorkspace: true, requireCapabilities: [CAPABILITIES.USER_ASSIGN_ROLE] });
