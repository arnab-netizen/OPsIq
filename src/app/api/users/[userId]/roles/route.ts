import { withRequestContext } from "@/lib/api-handler";
import { withAuth, getActorHierarchyLevel } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import {
  assignRole,
  revokeRole,
  getRolesForUser,
} from "@/services/role-assignment";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { z } from "zod/v4";
import { ROLES } from "@/domain/constants/roles";

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

export const GET = withRequestContext(async (_request, context) => {
  const { userId } = await context.params;
  parseOrThrow(uuidSchema, userId);
  await withAuth({ capability: CAPABILITIES.USER_VIEW, internalOnly: true });

  const roles = await getRolesForUser(userId);
  return Response.json({ roles });
});

export const POST = withRequestContext(async (request, context) => {
  const { userId } = await context.params;
  parseOrThrow(uuidSchema, userId);
  const { session, policy } = await withAuth({
    capability: CAPABILITIES.USER_ASSIGN_ROLE,
    internalOnly: true,
  });

  const body = await parseRequestBody(request, assignRoleSchema);
  const actorLevel = getActorHierarchyLevel(policy);

  const result = await assignRole(
    { userId, ...body } as Parameters<typeof assignRole>[0],
    session.user.id,
    actorLevel
  );

  return Response.json(result, { status: result.isNew ? 201 : 200 });
});

export const DELETE = withRequestContext(async (request, context) => {
  const { userId } = await context.params;
  parseOrThrow(uuidSchema, userId);
  const { session, policy } = await withAuth({
    capability: CAPABILITIES.USER_ASSIGN_ROLE,
    internalOnly: true,
  });

  const body = await parseRequestBody(request, revokeRoleSchema);
  const actorLevel = getActorHierarchyLevel(policy);

  await revokeRole(
    { userId, ...body } as Parameters<typeof revokeRole>[0],
    session.user.id,
    actorLevel
  );

  return Response.json({ status: "revoked" });
});
