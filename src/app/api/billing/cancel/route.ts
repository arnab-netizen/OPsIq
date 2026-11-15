/**
 * POST /api/billing/cancel — schedule cancellation at the end of the paid period.
 * Local state changes only when Paddle's verified webhook reports it.
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { ValidationError } from "@/infra/errors";
import { checkIdempotencyKey, recordIdempotencyResponse, recordIdempotencyError } from "@/services/idempotency";
import { requestCancellation } from "@/services/billing/checkout.service";

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const workspaceId = ctx.verifiedWorkspaceId;
    const idempotencyKey = ctx.request?.headers.get("idempotency-key");
    if (!idempotencyKey) throw new ValidationError("idempotency-key header required");

    const check = await checkIdempotencyKey({
      idempotencyKey,
      operationName: "billingCancel",
      actorId: ctx.verifiedActorId,
      workspaceId,
      payload: {},
    });
    if (!check.isNew && check.cachedResponse) return check.cachedResponse.body;

    try {
      const result = await requestCancellation({ workspaceId, actorId: ctx.verifiedActorId });
      await recordIdempotencyResponse(idempotencyKey, 200, result, workspaceId);
      return result;
    } catch (error) {
      await recordIdempotencyError(idempotencyKey, error instanceof Error ? error : new Error("Unknown error"), workspaceId);
      throw error;
    }
  },
  { requireWorkspace: true, requireCapabilities: [CAPABILITIES.OWNER_MANAGE] },
);
