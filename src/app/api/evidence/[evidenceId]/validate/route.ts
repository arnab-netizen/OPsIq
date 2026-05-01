import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { validateEvidence } from "@/services/evidence";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { validateEvidenceSchema } from "@/domain/validation/evidence";
import { errorToResponse } from "@/infra/errors";
import { logger } from "@/infra/logger";
import type { NextRequest } from "next/server";

export const POST = withRequestContext(async (request, context) => {
  try {
    // Authenticate + authorize (fail-closed)
    const { session } = await withAuth({
      capability: CAPABILITIES.EVIDENCE_VALIDATE,
      internalOnly: true,
    });

    // Validate workspace membership (fail-closed)
    const nextRequest = request as NextRequest;
    const workspaceId = nextRequest.headers.get("x-workspace-id");
    if (!workspaceId) {
      return Response.json(
        { error: "Workspace ID required (x-workspace-id header)" },
        { status: 400 }
      );
    }

    const membership = await enforceWorkspaceScoping(nextRequest, workspaceId);
    if (!membership) {
      return Response.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { evidenceId } = await context.params;
    parseOrThrow(uuidSchema, evidenceId);

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
