/**
 * POST /api/admin/customers/restore
 *
 * "Restore workspace access" — the reversing counterpart to Suspend, via
 * reactivateEmployee() (REUSE EXISTING). Workspace-scoped: restores access
 * only in the selected workspace.
 *
 * Gated on CUSTOMER_ACCESS_MANAGE, idempotent.
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody, identityEmailSchema, uuidSchema } from "@/lib/validation";
import { db } from "@/lib/db";
import { reactivateEmployee, LifecycleNotAllowedError, LifecycleConflictError } from "@/services/workspace/employee-lifecycle.service";
import { NotFoundError } from "@/infra/errors";
import { z } from "zod/v4";
import { checkIdempotencyKey, recordIdempotencyResponse, recordIdempotencyError } from "@/services/idempotency";

const bodySchema = z.object({
  email: identityEmailSchema,
  workspaceId: uuidSchema,
  reason: z.string().trim().max(500).optional(),
});

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const { email, workspaceId, reason } = await parseRequestBody(ctx.request!, bodySchema);

    const idempotencyKey = ctx.request!.headers.get("idempotency-key");
    if (!idempotencyKey) {
      return canonicalJson({ error: "idempotency-key header required" }, { status: 400 });
    }
    const idempotencyCheck = await checkIdempotencyKey({
      idempotencyKey,
      operationName: "adminRestoreCustomerWorkspaceAccess",
      actorId: ctx.verifiedActorId,
      payload: { email, workspaceId },
    });
    if (!idempotencyCheck.isNew && idempotencyCheck.cachedResponse) {
      return canonicalJson(idempotencyCheck.cachedResponse.body, { status: idempotencyCheck.cachedResponse.status });
    }

    try {
      const user = await db.user.findUnique({ where: { email }, select: { id: true } });
      if (!user) throw new NotFoundError("User", email);

      const status = await reactivateEmployee({
        workspaceId,
        userId: user.id,
        actorId: ctx.verifiedActorId,
        reason,
      });
      const result = { status, workspaceId, scope: "workspace" as const };
      await recordIdempotencyResponse(idempotencyKey, 200, result);
      return canonicalJson(result, { status: 200 });
    } catch (error) {
      const err = error instanceof Error ? error : new Error("Unknown error");
      await recordIdempotencyError(idempotencyKey, err);
      if (error instanceof LifecycleNotAllowedError || error instanceof LifecycleConflictError) {
        // err.message on these is hand-written at each throw site in
        // employee-lifecycle.service.ts specifically to be owner-safe --
        // never raw Prisma/stack text.
        const ownerSafeDetail = err.message;
        return canonicalJson({ error: ownerSafeDetail }, { status: 409 });
      }
      throw error;
    }
  },
  { requireCapabilities: [CAPABILITIES.CUSTOMER_ACCESS_MANAGE] }
);
