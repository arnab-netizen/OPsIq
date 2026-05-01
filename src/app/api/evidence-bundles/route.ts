import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import {
  createEvidenceBundle,
  listEvidenceBundles,
} from "@/services/evidence";
import { parseRequestBody, parseSearchParams } from "@/lib/validation";
import { createEvidenceBundleSchema } from "@/domain/validation/evidence";
import { z } from "zod/v4";
import { errorToResponse } from "@/infra/errors";
import { logger } from "@/infra/logger";
import type { NextRequest } from "next/server";

const listBundlesSchema = z.object({
  engagementId: z.string().uuid(),
});

export const POST = withRequestContext(async (request) => {
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
      return Response.json({ error: "Unauthorized" }, { status: 403 });
    }

    const body = await parseRequestBody(request, createEvidenceBundleSchema);
    const result = await createEvidenceBundle(body, authContext, workspaceId);

    return Response.json(result, { status: 201 });
  } catch (error) {
    logger.error("Error creating evidence bundle", { error });
    return errorToResponse(error);
  }
});

export const GET = withRequestContext(async (request) => {
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
      return Response.json({ error: "Unauthorized" }, { status: 403 });
    }

    const params = parseSearchParams(request.url, listBundlesSchema);
    const result = await listEvidenceBundles(params.engagementId, workspaceId);

    return Response.json({ bundles: result });
  } catch (error) {
    logger.error("Error listing evidence bundles", { error });
    return errorToResponse(error);
  }
});
