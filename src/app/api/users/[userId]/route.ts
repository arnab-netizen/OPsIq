import { emitAuditEvent } from '@/infra/audit';
import { AUDIT_EVENTS } from '@/domain/constants/audit-events';
import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { withEnforcementFull } from "@/lib/enforced-route";
import { UnauthorizedError, ForbiddenError } from "@/infra/errors";
import { withAuth, createServiceCapabilityContext, canonicalizeAuthContext } from "@/lib/auth-guard";
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
import { checkIdempotencyKey, recordIdempotencyResponse, recordIdempotencyError } from "@/services/idempotency";
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

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const workspaceId = ctx.verifiedWorkspaceId;
    const { userId } = params;
    parseOrThrow(uuidSchema, userId);

    const user = await getUserById(userId, workspaceId);
    return Response.json(user);
  },
  { requireWorkspace: true, requireCapabilities: ['USER_VIEW'] }
);

export const PATCH = withEnforcementFull(async (request, context, params) => {
  // Authenticate + authorize (fail-closed)
  const authContext = await withAuth({
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
    throw new ForbiddenError("Unauthorized");
  }

  const { userId } = params;
  parseOrThrow(uuidSchema, userId);

  const body = await parseRequestBody(request, updateUserSchema);
  await updateUser(userId, body, canonicalizeAuthContext(authContext, workspaceId), workspaceId);

  const updated = await getUserById(userId, workspaceId);
  return Response.json(updated);
});

export const POST = withEnforcementFull(async (request, context, params) => {
  // Auth check BEFORE body parse
  const authContext = await withAuth({
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

  const body = await parseRequestBody(request, actionSchema);

  const auditContext = createServiceCapabilityContext({
    capability: body.action === "deactivate" ? CAPABILITIES.USER_DEACTIVATE : CAPABILITIES.USER_UPDATE,
  });

  const idempotencyCheck = await checkIdempotencyKey({
    idempotencyKey,
    operationName: "userAction",
    actorId: authContext.session.user.id,
    workspaceId,
    payload: { userId, action: body.action, version: body.version },
  });

  if (!idempotencyCheck.isNew && idempotencyCheck.cachedResponse) {
    return Response.json(idempotencyCheck.cachedResponse.body, {
      status: idempotencyCheck.cachedResponse.status,
    });
  }

  try {
    if (body.action === "deactivate") {
      await deactivateUser(userId, body.version, canonicalizeAuthContext(authContext, workspaceId), workspaceId);
      const result = { status: "deactivated" };
      await recordIdempotencyResponse(idempotencyKey, 200, result, auditContext, workspaceId);
      return Response.json(result);
    }

    // reactivate
    await reactivateUser(userId, body.version, canonicalizeAuthContext(authContext, workspaceId), workspaceId);
    const result = { status: "reactivated" };
    await recordIdempotencyResponse(idempotencyKey, 200, result, auditContext, workspaceId);
    return Response.json(result);
  } catch (error) {
    const err = error instanceof Error ? error : new Error("Unknown error");
    await recordIdempotencyError(idempotencyKey, err, auditContext, workspaceId);
    throw error;
  }
});
