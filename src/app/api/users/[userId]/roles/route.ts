import { emitAuditEvent } from '@/infra/audit';
import { AUDIT_EVENTS } from '@/domain/constants/audit-events';
import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { withEnforcementFull } from "@/lib/enforced-route";
import { UnauthorizedError, ForbiddenError } from "@/infra/errors";
import { withAuth, createServiceCapabilityContext } from "@/lib/auth-guard";
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

export const POST = withEnforcementFull(async (request, context, params) => {
  // Authenticate + authorize (fail-closed)
  const { session, policy } = await withAuth({
    capability: CAPABILITIES.USER_ASSIGN_ROLE,
    internalOnly: true,
  });

  // Validate workspace membership (fail-closed)
  const nextRequest = request as NextRequest;
  const workspaceId = ctx.verifiedWorkspaceId;
  if (!workspaceId) {
    return Response.json(
      { error: "Workspace ID required (x-workspace-id header)" },
      { status: 400 }
    );
  }

  const membershipCheck = await enforceWorkspaceScoping(nextRequest, workspaceId);
  if (!membershipCheck) {
    throw new ForbiddenError("Unauthorized");
  }

  const idempotencyKey = request.headers.get("idempotency-key");
  if (!idempotencyKey) {
    return Response.json(
      { error: "idempotency-key header required" },
      { status: 400 }
    );
  }

  const { userId } = params;
  parseOrThrow(uuidSchema, userId);

  const body = await parseRequestBody(request, assignRoleSchema);
  const actorLevel = getActorHierarchyLevel(policy);

  const idempotencyCheck = await checkIdempotencyKey({
    idempotencyKey,
    operationName: "assignRole",
    actorId: session.user.id,
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
      session.user.id,
      actorLevel,
      workspaceId
    );
    await recordIdempotencyResponse(idempotencyKey, result.isNew ? 201 : 200, result);
    return Response.json(result, { status: result.isNew ? 201 : 200 });
  } catch (error) {
    const err = error instanceof Error ? error : new Error("Unknown error");
    await recordIdempotencyError(idempotencyKey, err, auditContext, workspaceId);
    throw error;
  }
});

export const DELETE = withEnforcementFull(async (request, auditContext, context, params) => {
  // Authenticate + authorize (fail-closed)
  const { session, policy } = await withAuth({
    capability: CAPABILITIES.USER_ASSIGN_ROLE,
    internalOnly: true,
  });

  // Validate workspace membership (fail-closed)
  const nextRequest = request as NextRequest;
  const workspaceId = ctx.verifiedWorkspaceId;
  if (!workspaceId) {
    return Response.json(
      { error: "Workspace ID required (x-workspace-id header)" },
      { status: 400 }
    );
  }

  const membershipCheck = await enforceWorkspaceScoping(nextRequest, workspaceId);
  if (!membershipCheck) {
    throw new ForbiddenError("Unauthorized");
  }

  const { userId } = params;
  parseOrThrow(uuidSchema, userId);

  const body = await parseRequestBody(request, revokeRoleSchema);
  const actorLevel = getActorHierarchyLevel(policy);

  await revokeRole(
    { userId, ...body } as Parameters<typeof revokeRole>[0],
    session.user.id,
    actorLevel,
    workspaceId
  );

  return Response.json({ status: "revoked" });
});
