import { withEnforcementFull } from "@/lib/enforced-route";
import { UnauthorizedError, ForbiddenError } from "@/infra/errors";
import { withAuth, canonicalizeAuthContext } from "@/lib/auth-guard";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import {
  getEvidenceBundleById,
  updateEvidenceBundle,
} from "@/services/evidence";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { updateEvidenceBundleSchema } from "@/domain/validation/evidence";
import { errorToResponse } from "@/infra/errors";
import { logger } from "@/infra/logger";
import type { NextRequest } from "next/server";

export const GET = withEnforcementFull(async (request, context, params) => {
  try {
    // Authenticate + authorize (fail-closed)
    await withAuth({
      capability: CAPABILITIES.EVIDENCE_VIEW,
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
      throw new ForbiddenError("Unauthorized");
    }

    const { bundleId } = params;
    parseOrThrow(uuidSchema, bundleId);

    const result = await getEvidenceBundleById(bundleId, workspaceId);

    return Response.json(result);
  } catch (error) {
    logger.error("Error getting evidence bundle", { error });
    return errorToResponse(error);
  }
});

export const PUT = withEnforcementFull(async (request, context, params) => {
  try {
    // Authenticate + authorize (fail-closed)
    const authContext = await withAuth({
      capability: CAPABILITIES.EVIDENCE_SUBMIT,
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
      throw new ForbiddenError("Unauthorized");
    }

    const { bundleId } = params;
    parseOrThrow(uuidSchema, bundleId);

    const body = await parseRequestBody(request, updateEvidenceBundleSchema);

    const canonicalContext = canonicalizeAuthContext(authContext, workspaceId);
    await updateEvidenceBundle(bundleId, body, canonicalContext, workspaceId);

    return Response.json({ success: true });
  } catch (error) {
    logger.error("Error updating evidence bundle", { error });
    return errorToResponse(error);
  }
});
