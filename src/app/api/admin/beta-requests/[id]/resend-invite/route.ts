/**
 * POST /api/admin/beta-requests/[id]/resend-invite
 *
 * "Resend invitation email" for a currently valid INVITED beta request. It is a pure email side effect: it never
 * changes the request's status, invitedAt, invitedBy or entitlement window (an expired invitation must be re-issued
 * with the governed invite / re-invite transition). Gated on BETA_REQUEST_INVITE, requires an idempotency-key header,
 * is bounded per request (cooldown + hourly cap, enforced under a row lock so concurrent posts send one email) and per
 * operator (rate limit), and always answers with an explicit emailDelivery outcome and a safe human-readable reason.
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { resendBetaInvitationEmail } from "@/services/admin/beta-invite-email.service";
import { parseOrThrow, uuidSchema } from "@/lib/validation";
import { requirePgRateLimit } from "@/infra/rate-limit";
import {
  checkIdempotencyKey,
  recordIdempotencyResponse,
  recordIdempotencyError,
} from "@/services/idempotency";

/** Per-operator bound on resend attempts across all requests. */
const OPERATOR_RESEND_RATE_LIMIT = { windowMs: 60 * 60 * 1000, maxAttempts: 30 };

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
      operationName: "resendBetaInvitationEmail",
      actorId: ctx.verifiedActorId,
      payload: { betaRequestId },
    });
    if (!idempotencyCheck.isNew && idempotencyCheck.cachedResponse) {
      return canonicalJson(idempotencyCheck.cachedResponse.body, { status: idempotencyCheck.cachedResponse.status });
    }

    try {
      await requirePgRateLimit(`beta-invite-resend:${ctx.verifiedActorId}`, OPERATOR_RESEND_RATE_LIMIT);
      const result = await resendBetaInvitationEmail({ betaRequestId, actorId: ctx.verifiedActorId });
      const body = {
        id: result.id,
        status: result.status,
        invitedAt: result.invitedAt,
        invitedBy: result.invitedBy,
        emailDelivery: result.outcome,
        emailDeliveryReason: result.reason,
      };
      await recordIdempotencyResponse(idempotencyKey, 200, body as unknown as Record<string, unknown>);
      return canonicalJson(body, { status: 200 });
    } catch (error) {
      const err = error instanceof Error ? error : new Error("Unknown error");
      await recordIdempotencyError(idempotencyKey, err);
      throw error;
    }
  },
  { requireCapabilities: [CAPABILITIES.BETA_REQUEST_INVITE] }
);
