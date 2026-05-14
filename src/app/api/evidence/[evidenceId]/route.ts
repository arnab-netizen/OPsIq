import { withEnforcementFull } from "@/lib/enforced-route";
import { UnauthorizedError, ForbiddenError } from "@/infra/errors";
import { withAuth, canonicalizeAuthContext } from "@/lib/auth-guard";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getEvidenceById, updateEvidence } from "@/services/evidence";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { z } from "zod/v4";
import { EVIDENCE_STATUSES } from "@/domain/constants/statuses";
import type { NextRequest } from "next/server";

const updateEvidenceSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  evidenceType: z
    .enum(["document", "interview", "metric", "observation"])
    .optional(),
  sourceReference: z.string().optional(),
  severity: z.enum(["low", "medium", "high", "critical"]).optional(),
  status: z.enum(EVIDENCE_STATUSES).optional(),
  rejectionReason: z.string().optional(),
  version: z.number().int().min(1),
});

export const GET = withEnforcementFull(async (request, context, params) => {
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
    throw new ForbiddenError("Unauthorized");
  }

  const { evidenceId } = params;
  parseOrThrow(uuidSchema, evidenceId);

  const evidence = await getEvidenceById(evidenceId, workspaceId);
  return Response.json(evidence);
});

export const PATCH = withEnforcementFull(async (request, context, params) => {
  // Authenticate + authorize (fail-closed)
  const authContext = await withAuth({
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
    throw new ForbiddenError("Unauthorized");
  }

  const { evidenceId } = params;
  parseOrThrow(uuidSchema, evidenceId);

  const body = await parseRequestBody(request, updateEvidenceSchema);
  await updateEvidence(evidenceId, body, canonicalizeAuthContext(authContext, workspaceId), workspaceId);

  const updated = await getEvidenceById(evidenceId, workspaceId);
  return Response.json(updated);
});
