import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
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

export const POST = withCanonicalEnforcement(async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
  const workspaceId = ctx.verifiedWorkspaceId;

  // Require Idempotency-Key (fail-closed)
  const idempotencyKey = ctx.request?.headers.get("idempotency-key");
  if (!idempotencyKey) {
    return Response.json(
      { error: "idempotency-key header required" },
      { status: 400 }
    );
  }

  const { userId } = params;
  parseOrThrow(uuidSchema, userId);

  const body = await parseRequestBody(ctx.request!, addMemberSchema);

  const idempotencyCheck = await checkIdempotencyKey({
    idempotencyKey,
    operationName: "addMember",
    actorId: ctx.verifiedActorId,
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
      ctx
    );

    await recordIdempotencyResponse(idempotencyKey, result.isNew ? 201 : 200, result);
    return Response.json(result, { status: result.isNew ? 201 : 200 });
  } catch (error) {
    const err = error instanceof Error ? error : new Error("Unknown error");
    await recordIdempotencyError(idempotencyKey, err);
    throw error;
  }
}, { requireWorkspace: true, requireCapabilities: [CAPABILITIES.ENGAGEMENT_MANAGE_MEMBERS] });

export const DELETE = withCanonicalEnforcement(async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
  const workspaceId = ctx.verifiedWorkspaceId;

  const { userId } = params;
  parseOrThrow(uuidSchema, userId);

  const body = await parseRequestBody(ctx.request!, removeMemberSchema);

  await removeMember(
    { userId, ...body, workspaceId } as Parameters<typeof removeMember>[0],
    ctx
  );

  return Response.json({ status: "removed" });
}, { requireWorkspace: true, requireCapabilities: [CAPABILITIES.ENGAGEMENT_MANAGE_MEMBERS] });
