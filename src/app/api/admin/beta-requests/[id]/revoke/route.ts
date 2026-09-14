/**
 * POST /api/admin/beta-requests/[id]/revoke
 *
 * Revoke an invite (INVITED -> REVOKED). Gated on BETA_REQUEST_INVITE (the
 * existing, unmodified production capability — revoking is the natural
 * counterpart to inviting, not a new customer-access power). Idempotent,
 * audited.
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { revokeBetaRequestInvite } from "@/services/admin/admin-operability.service";
import { parseOrThrow, uuidSchema } from "@/lib/validation";
import { checkIdempotencyKey, recordIdempotencyResponse, recordIdempotencyError } from "@/services/idempotency";

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const betaRequestId = params.id;
    parseOrThrow(uuidSchema, betaRequestId);

    const idempotencyKey = ctx.request!.headers.get("idempotency-key");
    if (!idempotencyKey) {
      return canonicalJson({ error: "idempotency-key header required" }, { status: 400 });
    }
    const idempotencyCheck = await checkIdempotencyKey({
      idempotencyKey,
      operationName: "revokeBetaRequestInvite",
      actorId: ctx.verifiedActorId,
      payload: { betaRequestId },
    });
    if (!idempotencyCheck.isNew && idempotencyCheck.cachedResponse) {
      return canonicalJson(idempotencyCheck.cachedResponse.body, { status: idempotencyCheck.cachedResponse.status });
    }

    try {
      const result = await revokeBetaRequestInvite({ betaRequestId, actorId: ctx.verifiedActorId });
      await recordIdempotencyResponse(idempotencyKey, 200, result as unknown as Record<string, unknown>);
      return canonicalJson(result, { status: 200 });
    } catch (error) {
      const err = error instanceof Error ? error : new Error("Unknown error");
      await recordIdempotencyError(idempotencyKey, err);
      throw error;
    }
  },
  { requireCapabilities: [CAPABILITIES.BETA_REQUEST_INVITE] }
);
