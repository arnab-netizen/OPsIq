import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
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

export const GET = withRequestContext(async (request, context) => {
  const workspaceId = request.headers.get("x-workspace-id") || "";
  const { evidenceId } = await context.params;
  parseOrThrow(uuidSchema, evidenceId);
  await withAuth({ capability: CAPABILITIES.EVIDENCE_VIEW });

  const evidence = await getEvidenceById(evidenceId, workspaceId);
  return Response.json(evidence);
});

export const PATCH = withRequestContext(async (request, context) => {
  const workspaceId = request.headers.get("x-workspace-id") || "";
  const { evidenceId } = await context.params;
  parseOrThrow(uuidSchema, evidenceId);
  const { session } = await withAuth({
    capability: CAPABILITIES.EVIDENCE_VALIDATE,
    internalOnly: true,
  });

  const body = await parseRequestBody(request, updateEvidenceSchema);
  await updateEvidence(evidenceId, body, session.user.id, workspaceId);

  const updated = await getEvidenceById(evidenceId, workspaceId);
  return Response.json(updated);
});
