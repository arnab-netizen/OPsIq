import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { ForbiddenError } from "@/infra/errors";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { validateEvidence } from "@/services/evidence";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { checkIdempotencyKey, recordIdempotencyResponse, recordIdempotencyError } from "@/services/idempotency";
import { validateEvidenceSchema } from "@/domain/validation/evidence";
import { errorToResponse } from "@/infra/errors";
import { logger } from "@/infra/logger";

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    try {
      // Use verified workspace from wrapper
      const workspaceId = ctx.verifiedWorkspaceId;

      const idempotencyKey = ctx.request?.headers.get("idempotency-key");
      if (!idempotencyKey) {
        return Response.json(
          { error: "idempotency-key header required" },
          { status: 400 }
        );
      }

      const { evidenceId } = params;
      parseOrThrow(uuidSchema, evidenceId);

      const bodyData = await parseRequestBody(ctx.request!, validateEvidenceSchema);

      if (bodyData.evidenceItemId !== evidenceId) {
        return Response.json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "Evidence ID mismatch",
            },
          },
          { status: 400 }
        );
      }

      const idempotencyCheck = await checkIdempotencyKey({
        idempotencyKey,
        operationName: "validateEvidence",
        actorId: ctx.verifiedActorId,
        payload: bodyData,
      });

      if (!idempotencyCheck.isNew && idempotencyCheck.cachedResponse) {
        return Response.json(idempotencyCheck.cachedResponse.body, {
          status: idempotencyCheck.cachedResponse.status,
        });
      }

      await validateEvidence(bodyData, ctx.verifiedActorId, workspaceId);
      const result = { success: true };
      await recordIdempotencyResponse(idempotencyKey, 200, result);

      return Response.json(result);
    } catch (error) {
      logger.error("Error validating evidence", { error });
      return errorToResponse(error);
    }
  },
  { requireWorkspace: true, requireCapabilities: [CAPABILITIES.EVIDENCE_VALIDATE] }
);
