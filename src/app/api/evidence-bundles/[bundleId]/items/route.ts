import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import {
  addEvidenceToBundle,
  removeEvidenceFromBundle,
} from "@/services/evidence";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import {
  addEvidenceToBundleSchema,
  removeEvidenceFromBundleSchema,
} from "@/domain/validation/evidence";
import { errorToResponse } from "@/infra/errors";
import { logger } from "@/infra/logger";

export const POST = withRequestContext(async (request, context) => {
  try {
    const workspaceId = request.headers.get("x-workspace-id") || "";
    const { bundleId } = await context.params;
    parseOrThrow(uuidSchema, bundleId);

    const { session } = await withAuth({
      capability: CAPABILITIES.EVIDENCE_SUBMIT,
    });

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

    await addEvidenceToBundle(bodyData, session.user.id, workspaceId);

    return Response.json({ success: true }, { status: 201 });
  } catch (error) {
    logger.error("Error adding evidence to bundle", { error });
    return errorToResponse(error);
  }
});

export const DELETE = withRequestContext(async (request, context) => {
  try {
    const workspaceId = request.headers.get("x-workspace-id") || "";
    const { bundleId } = await context.params;
    parseOrThrow(uuidSchema, bundleId);

    const { session } = await withAuth({
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

    await removeEvidenceFromBundle(bodyData, session.user.id, workspaceId);

    return Response.json({ success: true });
  } catch (error) {
    logger.error("Error removing evidence from bundle", { error });
    return errorToResponse(error);
  }
});
