import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { withEnforcementFull } from "@/lib/enforced-route";
import { withAuth, canonicalizeAuthContext } from "@/lib/auth-guard";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import type { NextRequest } from "next/server";
import { ForbiddenError } from "@/infra/errors";

import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getEvidenceById, updateEvidence } from "@/services/evidence";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { z } from "zod/v4";
import { EVIDENCE_STATUSES } from "@/domain/constants/statuses";


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

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const workspaceId = ctx.verifiedWorkspaceId;
    const { evidenceId } = params;
    parseOrThrow(uuidSchema, evidenceId);

    const evidence = await getEvidenceById(evidenceId, workspaceId);
    return Response.json(evidence);
  },
  { requireCapabilities: ["EVIDENCE_VIEW"], requireWorkspace: true }
);

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
