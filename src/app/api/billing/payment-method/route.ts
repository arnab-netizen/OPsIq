/**
 * POST /api/billing/payment-method — obtain a Paddle payment-method-update checkout URL for the
 * caller's own subscription (past-due recovery). Local state changes only when Paddle's verified
 * webhook reports the recovered provider state; the browser is never trusted to restore access.
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { ValidationError } from "@/infra/errors";
import { checkIdempotencyKey, recordIdempotencyResponse, recordIdempotencyError } from "@/services/idempotency";
import { createPaymentMethodUpdate } from "@/services/billing/checkout.service";

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const workspaceId = ctx.verifiedWorkspaceId;
    const idempotencyKey = ctx.request?.headers.get("idempotency-key");
    if (!idempotencyKey) throw new ValidationError("idempotency-key header required");

    const check = await checkIdempotencyKey({
      idempotencyKey,
      operationName: "billingPaymentMethod",
      actorId: ctx.verifiedActorId,
      workspaceId,
      payload: {},
    });
    if (!check.isNew && check.cachedResponse) return check.cachedResponse.body;

    try {
      const result = await createPaymentMethodUpdate({ workspaceId, actorId: ctx.verifiedActorId });
      await recordIdempotencyResponse(idempotencyKey, 200, result, workspaceId);
      return result;
    } catch (error) {
      await recordIdempotencyError(idempotencyKey, error instanceof Error ? error : new Error("Unknown error"), workspaceId);
      throw error;
    }
  },
  { requireWorkspace: true, requireCapabilities: [CAPABILITIES.OWNER_MANAGE] },
);
