/**
 * POST /api/admin/workspaces/[id]/disable
 *
 * Soft-disable a workspace (set isActive=false; no hard deletion).
 * Admin-only endpoint (enforces SYSTEM_ADMIN capability via canonical
 * enforcement). Idempotent (requires an idempotency-key header) and audited
 * (emits WORKSPACE_DISABLED on an actual state change).
 *
 * Phase D1-D: replaces the prior stub with a real, governed write.
 */

import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { disableWorkspaceForAdmin } from "@/services/admin/admin-operability.service";
import { parseOrThrow, uuidSchema, parseRequestBody } from "@/lib/validation";
import {
  checkIdempotencyKey,
  recordIdempotencyResponse,
  recordIdempotencyError,
} from "@/services/idempotency";
import { z } from "zod/v4";

const disableWorkspaceSchema = z.object({
  reason: z.string().optional(),
  notifyMembers: z.boolean().optional().default(true),
});

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const workspaceId = params.id;
    parseOrThrow(uuidSchema, workspaceId);

    const idempotencyKey = ctx.request!.headers.get("idempotency-key");
    if (!idempotencyKey) {
      return canonicalJson(
        { error: "idempotency-key header required" },
        { status: 400 }
      );
    }

    const body = await parseRequestBody(ctx.request!, disableWorkspaceSchema);
    const reason = body.reason ?? null;
    const notifyMembers = body.notifyMembers;

    const idempotencyCheck = await checkIdempotencyKey({
      idempotencyKey,
      operationName: "disableWorkspace",
      actorId: ctx.verifiedActorId,
      payload: { workspaceId, reason, notifyMembers },
    });

    if (!idempotencyCheck.isNew && idempotencyCheck.cachedResponse) {
      return canonicalJson(idempotencyCheck.cachedResponse.body, {
        status: idempotencyCheck.cachedResponse.status,
      });
    }

    try {
      const result = await disableWorkspaceForAdmin({
        workspaceId,
        actorId: ctx.verifiedActorId,
        reason,
        notifyMembers,
      });
      await recordIdempotencyResponse(
        idempotencyKey,
        201,
        result as unknown as Record<string, unknown>
      );
      return canonicalJson(result, { status: 201 });
    } catch (error) {
      const err = error instanceof Error ? error : new Error("Unknown error");
      await recordIdempotencyError(idempotencyKey, err);
      throw error;
    }
  },
  {
    requireCapabilities: [CAPABILITIES.SYSTEM_ADMIN],
  }
);
