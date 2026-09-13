/**
 * POST /api/admin/beta-requests/[id]/invite
 *
 * Mark a controlled-beta homepage capture request as invited. Admin-only
 * (enforces SYSTEM_ADMIN capability via canonical enforcement). Idempotent
 * (requires an idempotency-key header, same as
 * /api/admin/workspaces/[id]/disable) and audited (emits
 * beta_request.marked_invited on an actual state change).
 *
 * This is the "HOW_OWNER_MARKS_INVITED" mechanism for the controlled-beta
 * homepage capture. It never creates a User, Workspace, or session itself —
 * the owner invites the requester out-of-band (email) and the requester
 * uses the existing, unchanged /signup flow.
 */

import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { markBetaRequestInvited } from "@/services/admin/admin-operability.service";
import { parseOrThrow, uuidSchema } from "@/lib/validation";
import {
  checkIdempotencyKey,
  recordIdempotencyResponse,
  recordIdempotencyError,
} from "@/services/idempotency";

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
      operationName: "markBetaRequestInvited",
      actorId: ctx.verifiedActorId,
      payload: { betaRequestId },
    });

    if (!idempotencyCheck.isNew && idempotencyCheck.cachedResponse) {
      return canonicalJson(idempotencyCheck.cachedResponse.body, {
        status: idempotencyCheck.cachedResponse.status,
      });
    }

    try {
      const result = await markBetaRequestInvited({
        betaRequestId,
        actorId: ctx.verifiedActorId,
      });
      await recordIdempotencyResponse(idempotencyKey, 200, result as unknown as Record<string, unknown>);
      return canonicalJson(result, { status: 200 });
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
