import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import {
  createEvidenceBundle,
  listEvidenceBundles,
} from "@/services/evidence";
import { parseRequestBody, parseSearchParams } from "@/lib/validation";
import { createEvidenceBundleSchema } from "@/domain/validation/evidence";
import { checkIdempotencyKey, recordIdempotencyResponse, recordIdempotencyError } from "@/services/idempotency";
import { ValidationError } from "@/infra/errors";
import { z } from "zod/v4";

const listBundlesSchema = z.object({
  engagementId: z.string().uuid(),
});

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const workspaceId = ctx.verifiedWorkspaceId;

    const idempotencyKey = ctx.request?.headers.get("idempotency-key");
    if (!idempotencyKey) {
      throw new ValidationError("idempotency-key header required");
    }

    const body = await parseRequestBody(ctx.request!, createEvidenceBundleSchema);

    const idempotencyCheck = await checkIdempotencyKey({
      idempotencyKey,
      operationName: "createEvidenceBundle",
      actorId: ctx.verifiedActorId,
      payload: body,
    });

    if (!idempotencyCheck.isNew && idempotencyCheck.cachedResponse) {
      return idempotencyCheck.cachedResponse.body;
    }

    try {
      const result = await createEvidenceBundle(body, ctx, workspaceId);
      await recordIdempotencyResponse(idempotencyKey, 201, result);
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error("Unknown error");
      await recordIdempotencyError(idempotencyKey, err);
      throw error;
    }
  },
  {
    requireCapabilities: [CAPABILITIES.EVIDENCE_SUBMIT],
    requireWorkspace: true,
  }
);

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const workspaceId = ctx.verifiedWorkspaceId;
    const params = parseSearchParams(ctx.request!.url, listBundlesSchema);
    const result = await listEvidenceBundles(params.engagementId, workspaceId);
    return { bundles: result };
  },
  { requireWorkspace: true, requireCapabilities: [CAPABILITIES.EVIDENCE_VIEW] }
);
