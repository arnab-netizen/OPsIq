/**
 * POST /api/owner/budget/spend — record a spend entry (runs spend governance and
 *      triggers reassessment). OWNER_MANAGE, workspace-scoped, validated, enforced.
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody } from "@/lib/validation";
import { budgetSpendCreateSchema } from "@/domain/owner-budget/validation";
import { recordSpendEntry } from "@/services/owner-budget/budget.service";
import { checkIdempotencyKey, recordIdempotencyResponse, recordIdempotencyError } from "@/services/idempotency";
import { BadRequestError } from "@/infra/errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const idempotencyKey = ctx.request!.headers.get("idempotency-key");
    if (!idempotencyKey) {
      throw new BadRequestError("idempotency-key header required");
    }

    const body = await parseRequestBody(ctx.request!, budgetSpendCreateSchema);
    const { businessId, ...input } = body;

    const idempotencyCheck = await checkIdempotencyKey({
      idempotencyKey,
      operationName: "recordSpendEntry",
      actorId: ctx.verifiedActorId,
      workspaceId: ctx.verifiedWorkspaceId,
      payload: body as Record<string, unknown>,
    });

    if (!idempotencyCheck.isNew && idempotencyCheck.cachedResponse) {
      return idempotencyCheck.cachedResponse.body;
    }

    try {
      const result = await recordSpendEntry(businessId, input, ctx.verifiedActorId, ctx.verifiedWorkspaceId);
      await recordIdempotencyResponse(idempotencyKey, 201, result as unknown as Record<string, unknown>, ctx.verifiedWorkspaceId);
      return canonicalJson(result, { status: 201 });
    } catch (error) {
      const err = error instanceof Error ? error : new Error("Unknown error");
      await recordIdempotencyError(idempotencyKey, err, ctx.verifiedWorkspaceId);
      throw error;
    }
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
