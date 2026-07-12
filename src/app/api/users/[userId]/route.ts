import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { ForbiddenError, ValidationError } from "@/infra/errors";
import { hasInternalAccess } from "@/policies/capability-check";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import {
  getUserById,
  updateUser,
  deactivateUser,
  reactivateUser,
} from "@/services/user";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { checkIdempotencyKey, recordIdempotencyResponse, recordIdempotencyError } from "@/services/idempotency";
import { z } from "zod/v4";

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
    return user;
  },
  { requireWorkspace: true, requireCapabilities: [CAPABILITIES.USER_VIEW] }
);

export const PATCH = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    if (!ctx.policy || !hasInternalAccess(ctx.policy)) {
      throw new ForbiddenError("Internal access required");
    }

    const workspaceId = ctx.verifiedWorkspaceId;
    const { userId } = params;
    parseOrThrow(uuidSchema, userId);

    const body = await parseRequestBody(ctx.request!, updateUserSchema);
    await updateUser(userId, body, ctx, workspaceId);

    const updated = await getUserById(userId, workspaceId);
    return updated;
  },
  { requireWorkspace: true, requireCapabilities: [CAPABILITIES.USER_UPDATE] }
);

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    if (!ctx.policy || !hasInternalAccess(ctx.policy)) {
      throw new ForbiddenError("Internal access required");
    }

    const workspaceId = ctx.verifiedWorkspaceId;
    const { userId } = params;
    parseOrThrow(uuidSchema, userId);

    const idempotencyKey = ctx.request?.headers.get("idempotency-key");
    if (!idempotencyKey) {
      throw new ValidationError("idempotency-key header required");
    }

    const body = await parseRequestBody(ctx.request!, actionSchema);

    const idempotencyCheck = await checkIdempotencyKey({
      idempotencyKey,
      operationName: "userAction",
      actorId: ctx.verifiedActorId,
      payload: { userId, action: body.action, version: body.version },
    });

    if (!idempotencyCheck.isNew && idempotencyCheck.cachedResponse) {
      return idempotencyCheck.cachedResponse.body;
    }

    try {
      if (body.action === "deactivate") {
        await deactivateUser(userId, body.version, ctx, workspaceId);
        const result = { status: "deactivated" };
        await recordIdempotencyResponse(idempotencyKey, 200, result);
        return result;
      }

      await reactivateUser(userId, body.version, ctx, workspaceId);
      const result = { status: "reactivated" };
      await recordIdempotencyResponse(idempotencyKey, 200, result);
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error("Unknown error");
      await recordIdempotencyError(idempotencyKey, err);
      throw error;
    }
  },
  { requireWorkspace: true, requireCapabilities: [CAPABILITIES.USER_DEACTIVATE] }
);
