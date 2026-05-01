import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { createEvidence, listEvidence } from "@/services/evidence";
import { parseRequestBody, parseSearchParams } from "@/lib/validation";
import { z } from "zod/v4";
import { paginationSchema } from "@/lib/validation";
import type { NextRequest } from "next/server";

const createEvidenceSchema = z.object({
  engagementId: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().optional(),
  evidenceType: z.enum(["document", "interview", "metric", "observation"]),
  sourceReference: z.string().optional(),
  severity: z.enum(["low", "medium", "high", "critical"]).optional(),
});

const listEvidenceSchema = paginationSchema.extend({
  engagementId: z.string().uuid().optional(),
  status: z.string().optional(),
});

export const GET = withRequestContext(async (request) => {
  // Authenticate + authorize (fail-closed)
  await withAuth({ capability: CAPABILITIES.EVIDENCE_VIEW });

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

  const params = parseSearchParams(request.url, listEvidenceSchema);
  const result = await listEvidence(workspaceId, params);

  return Response.json(result);
});

export const POST = withRequestContext(async (request) => {
  // Authenticate + authorize (fail-closed)
  const authContext = await withAuth({
    capability: CAPABILITIES.EVIDENCE_SUBMIT,
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

  const body = await parseRequestBody(request, createEvidenceSchema);
  const result = await createEvidence(body, authContext, workspaceId);

  return Response.json(result, { status: 201 });
});
