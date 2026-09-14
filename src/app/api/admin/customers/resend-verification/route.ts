/**
 * POST /api/admin/customers/resend-verification
 *
 * Operator-triggered resend of the email-verification link, reusing the
 * exact same eligibility/token/email logic as the public
 * /api/auth/resend-verification route (see resend-verification.service.ts —
 * REUSE EXISTING, not a second implementation). Gated on
 * CUSTOMER_ACCESS_MANAGE, idempotent.
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { parseRequestBody, identityEmailSchema } from "@/lib/validation";
import { resendVerificationEmailIfEligible } from "@/services/auth/resend-verification.service";
import { z } from "zod/v4";
import { checkIdempotencyKey, recordIdempotencyResponse, recordIdempotencyError } from "@/services/idempotency";

const bodySchema = z.object({ email: identityEmailSchema });

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const { email } = await parseRequestBody(ctx.request!, bodySchema);

    const idempotencyKey = ctx.request!.headers.get("idempotency-key");
    if (!idempotencyKey) {
      return canonicalJson({ error: "idempotency-key header required" }, { status: 400 });
    }
    const idempotencyCheck = await checkIdempotencyKey({
      idempotencyKey,
      operationName: "adminResendVerification",
      actorId: ctx.verifiedActorId,
      payload: { email },
    });
    if (!idempotencyCheck.isNew && idempotencyCheck.cachedResponse) {
      return canonicalJson(idempotencyCheck.cachedResponse.body, { status: idempotencyCheck.cachedResponse.status });
    }

    try {
      const result = await resendVerificationEmailIfEligible(email, {
        auditEventName: AUDIT_EVENTS.CUSTOMER_VERIFICATION_RESENT,
        actorId: ctx.verifiedActorId,
      });
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
