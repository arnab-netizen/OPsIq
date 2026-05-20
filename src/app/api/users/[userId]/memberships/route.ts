import { emitAuditEvent } from '@/infra/audit';
import { AUDIT_EVENTS } from '@/domain/constants/audit-events';
import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { withEnforcementFull } from "@/lib/enforced-route";
import { UnauthorizedError, ForbiddenError } from "@/infra/errors";
import { withAuth, canonicalizeAuthContext } from ", { createServiceCapabilityContext }@/lib/auth-guard", { createServiceCapabilityContext };
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import {
  addMember,
  removeMember,
  getMembershipsForUser,
} from "@/services/engagement-membership";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { checkIdempotencyKey, recordIdempotencyResponse, recordIdempotencyError } from "@/services/idempotency";
import { z } from "zod/v4";
import { ROLES } from "@/domain/constants/roles";
import type { NextRequest } from "next/server";

const roleValues = Object.values(ROLES) as [string, ...string[]];

const addMemberSchema = z.object({
  engagementId: z.string().uuid(),
  role: z.enum(roleValues),
});

const removeMemberSchema = z.object({
  engagementId: z.string().uuid(),
  role: z.enum(roleValues),
});

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const workspaceId = ctx.verifiedWorkspaceId;
    const { userId } = params;
    parseOrThrow(uuidSchema, userId);

    const memberships = await getMembershipsForUser(userId, workspaceId);
    return Response.json({ memberships });
  },
  { requireWorkspace: true, requireCapabilities: ['USER_VIEW'] }
);

export const POST = withEnforcementFull(async (request, context, params) => {
  // Authenticate + authorize (fail-closed)
  const { session, policy } = await withAuth({
    capability: CAPABILITIES.ENGAGEMENT_MANAGE_MEMBERS,
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

  // Require Idempotency-Key (fail-closed)
  const idempotencyKey = nextRequest.headers.get("idempotency-key");
  if (!idempotencyKey) {
    return Response.json(
      { error: "idempotency-key header required" },
      { status: 400 }
    );
  }

  const membershipCheck = await enforceWorkspaceScoping(nextRequest, workspaceId);
  if (!membershipCheck) {
    throw new ForbiddenError("Unauthorized");
  }

  const { userId } = params;
  parseOrThrow(uuidSchema, userId);

  const body = await parseRequestBody(request, addMemberSchema);

  const idempotencyCheck = await checkIdempotencyKey({
    idempotencyKey,
    operationName: "addMember",
    actorId: session.user.id,
    payload: { userId, ...body },
  });

  if (!idempotencyCheck.isNew && idempotencyCheck.cachedResponse) {
    return Response.json(idempotencyCheck.cachedResponse.body, {
      status: idempotencyCheck.cachedResponse.status,
    });
  }

  try {
    const result = await addMember(
      { userId, ...body, workspaceId } as Parameters<typeof addMember>[0],
      canonicalizeAuthContext({ session, policy }, workspaceId)
    );

    await recordIdempotencyResponse(idempotencyKey, result.isNew ? 201 : 200, result);
    return Response.json(result, { status: result.isNew ? 201 : 200 });
  } catch (error) {
    const err = error instanceof Error ? error : new Error("Unknown error");
    await recordIdempotencyError(idempotencyKey, err, auditContext, workspace?.workspaceId || workspaceId || verifiedWorkspaceId || "unknown");
    throw error;
  }
});

export const DELETE = withEnforcementFull(async (request, auditContext, context, params) => {
  // Authenticate + authorize (fail-closed)
  const { session, policy } = await withAuth({
    capability: CAPABILITIES.ENGAGEMENT_MANAGE_MEMBERS,
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

  const body = await parseRequestBody(request, removeMemberSchema);

  await removeMember(
    { userId, ...body, workspaceId } as Parameters<typeof removeMember>[0],
    canonicalizeAuthContext({ session, policy }, workspaceId)
  );

  return Response.json({ status: "removed" });
});
