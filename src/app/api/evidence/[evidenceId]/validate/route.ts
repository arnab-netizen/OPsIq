import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { validateEvidence } from "@/services/evidence";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { validateEvidenceSchema } from "@/domain/validation/evidence";
import { errorToResponse } from "@/infra/errors";
import { logger } from "@/infra/logger";

export const POST = withRequestContext(async (request, context) => {
  try {
    const workspaceId = request.headers.get("x-workspace-id") || "";
    const { evidenceId } = await context.params;
    parseOrThrow(uuidSchema, evidenceId);

    const { session } = await withAuth({
      capability: CAPABILITIES.EVIDENCE_VALIDATE,
      internalOnly: true,
    });

    const bodyData = await parseRequestBody(request, validateEvidenceSchema);

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

    await validateEvidence(bodyData, session.user.id, workspaceId);

    return Response.json({ success: true });
  } catch (error) {
    logger.error("Error validating evidence", { error });
    return errorToResponse(error);
  }
});
