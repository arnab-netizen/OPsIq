import { emitAuditEvent } from '@/infra/audit';
import { AUDIT_EVENTS } from '@/domain/constants/audit-events';
import { withEnforcementFull } from "@/lib/enforced-route";
import { UnauthorizedError, ForbiddenError } from "@/infra/errors";
import { withAuth, createServiceCapabilityContext } from "@/lib/auth-guard";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { validateEvidence } from "@/services/evidence";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { checkIdempotencyKey, recordIdempotencyResponse, recordIdempotencyError } from "@/services/idempotency";
import { validateEvidenceSchema } from "@/domain/validation/evidence";
import { errorToResponse } from "@/infra/errors";
import { logger } from "@/infra/logger";
import type { NextRequest } from "next/server";

export const POST = withEnforcementFull(async (request, context, params) => {
  try {
    // Authenticate + authorize (fail-closed)
    const { session } = await withAuth({
      capability: CAPABILITIES.EVIDENCE_VALIDATE,
      internalOnly: true,
    });

    // Validate workspace membership (fail-closed)
    const nextRequest = request as NextRequest;
    const workspaceId = ctx.verifiedWorkspaceId;
    if (!workspaceId) {
      return Response.json(
        { error: "Workspace ID required (x-workspace-id header)" },
        { status: 400 }
      );
    }

    const membership = await enforceWorkspaceScoping(nextRequest, workspaceId);
    if (!membership) {
      throw new ForbiddenError("Unauthorized");
    }

    const idempotencyKey = request.headers.get("idempotency-key");
    if (!idempotencyKey) {
      return Response.json(
        { error: "idempotency-key header required" },
        { status: 400 }
      );
    }

    const { evidenceId } = params;
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

    const idempotencyCheck = await checkIdempotencyKey({
      idempotencyKey,
      operationName: "validateEvidence",
      actorId: session.user.id,
      payload: bodyData,
    });

    if (!idempotencyCheck.isNew && idempotencyCheck.cachedResponse) {
      return Response.json(idempotencyCheck.cachedResponse.body, {
        status: idempotencyCheck.cachedResponse.status,
      });
    }

    await validateEvidence(bodyData, session.user.id, workspaceId);
    const result = { success: true };
    await recordIdempotencyResponse(idempotencyKey, 200, result, auditContext, workspace?.workspaceId || workspaceId || verifiedWorkspaceId || "unknown");

    return Response.json(result);
  } catch (error) {
    logger.error("Error validating evidence", { error });
    return errorToResponse(error);
  }
});
