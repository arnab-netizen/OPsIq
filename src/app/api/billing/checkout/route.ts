/**
 * POST /api/billing/checkout — create a Paddle checkout for the caller's workspace.
 * Auth + workspace + OWNER_MANAGE enforced server-side; Idempotency-Key required so a double
 * click returns the same checkout instead of creating a second transaction. The browser never
 * supplies workspace, price, or amount, and nothing it later reports is treated as payment proof.
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { ValidationError } from "@/infra/errors";
import { checkIdempotencyKey, recordIdempotencyResponse, recordIdempotencyError } from "@/services/idempotency";
import { createCheckout } from "@/services/billing/checkout.service";

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const workspaceId = ctx.verifiedWorkspaceId;
    const idempotencyKey = ctx.request?.headers.get("idempotency-key");
    if (!idempotencyKey) throw new ValidationError("idempotency-key header required");

    const check = await checkIdempotencyKey({
      idempotencyKey,
      operationName: "billingCheckout",
      actorId: ctx.verifiedActorId,
      workspaceId,
      payload: {},
    });
    if (!check.isNew && check.cachedResponse) return check.cachedResponse.body;

    try {
      const result = await createCheckout({ workspaceId, actorId: ctx.verifiedActorId });
      await recordIdempotencyResponse(idempotencyKey, 200, result, workspaceId);
      return result;
    } catch (error) {
      await recordIdempotencyError(idempotencyKey, error instanceof Error ? error : new Error("Unknown error"), workspaceId);
      throw error;
    }
  },
  { requireWorkspace: true, requireCapabilities: [CAPABILITIES.OWNER_MANAGE] },
);
