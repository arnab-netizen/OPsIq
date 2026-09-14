/**
 * POST /api/admin/customers/revoke-sessions
 *
 * Revokes ALL active sessions for a user. This is GLOBAL for the user, not
 * workspace-scoped — Session has no workspaceId column anywhere in this
 * schema (confirmed), so this is the same existing bulk-revocation security
 * primitive already used by reset-password and deactivateUser. The response
 * and this doc comment say so explicitly — never labeled as workspace-only.
 *
 * Gated on CUSTOMER_ACCESS_MANAGE, idempotent, audited (atomic tx+audit).
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { parseRequestBody, identityEmailSchema } from "@/lib/validation";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { emitAuditEvent } from "@/infra/audit";
import { NotFoundError } from "@/infra/errors";
import { z } from "zod/v4";
import { checkIdempotencyKey, recordIdempotencyResponse, recordIdempotencyError } from "@/services/idempotency";

const bodySchema = z.object({ email: identityEmailSchema, reason: z.string().trim().max(500).optional() });

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const { email, reason } = await parseRequestBody(ctx.request!, bodySchema);

    const idempotencyKey = ctx.request!.headers.get("idempotency-key");
    if (!idempotencyKey) {
      return canonicalJson({ error: "idempotency-key header required" }, { status: 400 });
    }
    const idempotencyCheck = await checkIdempotencyKey({
      idempotencyKey,
      operationName: "adminRevokeCustomerSessions",
      actorId: ctx.verifiedActorId,
      payload: { email },
    });
    if (!idempotencyCheck.isNew && idempotencyCheck.cachedResponse) {
      return canonicalJson(idempotencyCheck.cachedResponse.body, { status: idempotencyCheck.cachedResponse.status });
    }

    try {
      const user = await db.user.findUnique({ where: { email }, select: { id: true } });
      if (!user) throw new NotFoundError("User", email);

      const revokedCount = await db.$transaction(async (tx: Prisma.TransactionClient) => {
        const res = await tx.session.updateMany({
          where: { userId: user.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        await emitAuditEvent(
          {
            eventName: AUDIT_EVENTS.SESSION_REVOKED,
            actorId: ctx.verifiedActorId,
            entityType: "user",
            entityId: user.id,
            payload: { revokedCount: res.count, scope: "global", reason: reason ?? null },
            visibility: "internal",
          },
          tx
        );
        return res.count;
      });

      const result = { revokedCount, scope: "global" as const };
      await recordIdempotencyResponse(idempotencyKey, 200, result);
      return canonicalJson(result, { status: 200 });
    } catch (error) {
      const err = error instanceof Error ? error : new Error("Unknown error");
      await recordIdempotencyError(idempotencyKey, err);
      throw error;
    }
  },
  { requireCapabilities: [CAPABILITIES.CUSTOMER_ACCESS_MANAGE] }
);
