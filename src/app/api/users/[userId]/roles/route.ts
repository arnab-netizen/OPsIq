import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { getActorHierarchyLevel } from "@/policies/capability-check";
import { UnauthorizedError, ValidationError } from "@/infra/errors";
import { canonicalJson } from "@/lib/canonical-json-response";
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

const roleValues = Object.values(ROLES) as [string, ...string[]];

const assignRoleSchema = z.object({
  role: z.enum(roleValues),
  scope: z.string().optional(),
  scopeId: z.string().uuid().optional(),
});

/**
 * The actor's ROLE_HIERARCHY level, read from the wrapper's verified PolicyContext (its real role assignments).
 * assignRole/revokeRole allow managing only roles strictly below this level. Fails closed without a verified policy.
 */
function verifiedActorHierarchyLevel(ctx: CanonicalAuthContext): number {
  if (!ctx.policy) throw new UnauthorizedError("Unauthorized");
  return getActorHierarchyLevel(ctx.policy);
}

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
    return { roles };
  },
  { requireWorkspace: true, requireCapabilities: [CAPABILITIES.USER_VIEW] }
);

export const POST = withCanonicalEnforcement(async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
  const workspaceId = ctx.verifiedWorkspaceId;
  const idempotencyKey = ctx.request?.headers.get("idempotency-key");
  if (!idempotencyKey) {
    throw new ValidationError("idempotency-key header required");
  }

  const { userId } = params;
  parseOrThrow(uuidSchema, userId);

  const body = await parseRequestBody(ctx.request!, assignRoleSchema);

  const actorLevel = verifiedActorHierarchyLevel(ctx);

  const idempotencyCheck = await checkIdempotencyKey({
    idempotencyKey,
    operationName: "assignRole",
    actorId: ctx.verifiedActorId,
    payload: { userId, ...body },
    workspaceId,
  });

  if (!idempotencyCheck.isNew && idempotencyCheck.cachedResponse) {
    return canonicalJson(idempotencyCheck.cachedResponse.body, { status: idempotencyCheck.cachedResponse.status });
  }

  try {
    const result = await assignRole(
      { userId, ...body } as Parameters<typeof assignRole>[0],
      ctx.verifiedActorId,
      actorLevel,
      workspaceId
    );
    await recordIdempotencyResponse(idempotencyKey, result.isNew ? 201 : 200, result);
    return canonicalJson(result, { status: result.isNew ? 201 : 200 });
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

  const actorLevel = verifiedActorHierarchyLevel(ctx);

  await revokeRole(
    { userId, ...body } as Parameters<typeof revokeRole>[0],
    ctx.verifiedActorId,
    actorLevel,
    workspaceId
  );

  return { status: "revoked" };
}, { requireWorkspace: true, requireCapabilities: [CAPABILITIES.USER_ASSIGN_ROLE] });
