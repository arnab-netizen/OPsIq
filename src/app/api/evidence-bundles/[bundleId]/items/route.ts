import { withEnforcementFull } from "@/lib/enforced-route";
import type { NextRequest } from "next/server";
import { withAuth, canonicalizeAuthContext } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import {
  addEvidenceToBundle,
  removeEvidenceFromBundle,
} from "@/services/evidence";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { checkIdempotencyKey, recordIdempotencyResponse, recordIdempotencyError } from "@/services/idempotency";
import {
  addEvidenceToBundleSchema,
  removeEvidenceFromBundleSchema,
} from "@/domain/validation/evidence";
import { errorToResponse } from "@/infra/errors";
import { logger } from "@/infra/logger";

export const POST = withEnforcementFull(async (request, context, params) => {
  try {
    const workspaceId = request.headers.get("x-workspace-id") || "";
    const { bundleId } = params;
    parseOrThrow(uuidSchema, bundleId);

    const authContext = await withAuth({
      capability: CAPABILITIES.EVIDENCE_SUBMIT,
    });

    const idempotencyKey = request.headers.get("idempotency-key");
    if (!idempotencyKey) {
      return Response.json(
        { error: "idempotency-key header required" },
        { status: 400 }
      );
    }

    const bodyData = await parseRequestBody(
      request,
      addEvidenceToBundleSchema
    );

    if (bodyData.bundleId !== bundleId) {
      return Response.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Bundle ID mismatch",
          },
        },
        { status: 400 }
      );
    }

    const idempotencyCheck = await checkIdempotencyKey({
      idempotencyKey,
      operationName: "addEvidenceToBundle",
      actorId: authContext.session.user.id,
      payload: bodyData,
    });

    if (!idempotencyCheck.isNew && idempotencyCheck.cachedResponse) {
      return Response.json(idempotencyCheck.cachedResponse.body, {
        status: idempotencyCheck.cachedResponse.status,
      });
    }

    await addEvidenceToBundle(bodyData, canonicalizeAuthContext(authContext, workspaceId), workspaceId);
    await recordIdempotencyResponse(idempotencyKey, 201, { success: true });

    return Response.json({ success: true }, { status: 201 });
  } catch (error) {
    logger.error("Error adding evidence to bundle", { error });
    if (request.headers.get("idempotency-key")) {
      const err = error instanceof Error ? error : new Error("Unknown error");
      await recordIdempotencyError(request.headers.get("idempotency-key")!, err);
    }
    return errorToResponse(error);
  }
});

export const DELETE = withEnforcementFull(async (request, context, params) => {
  try {
    const workspaceId = request.headers.get("x-workspace-id") || "";
    const { bundleId } = params;
    parseOrThrow(uuidSchema, bundleId);

    const authContext = await withAuth({
      capability: CAPABILITIES.EVIDENCE_SUBMIT,
    });

    const bodyData = await parseRequestBody(
      request,
      removeEvidenceFromBundleSchema
    );

    if (bodyData.bundleId !== bundleId) {
      return Response.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Bundle ID mismatch",
          },
        },
        { status: 400 }
      );
    }

    await removeEvidenceFromBundle(bodyData, canonicalizeAuthContext(authContext, workspaceId), workspaceId);

    return Response.json({ success: true });
  } catch (error) {
    logger.error("Error removing evidence from bundle", { error });
    return errorToResponse(error);
  }
});
