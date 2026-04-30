import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { createEvidence, listEvidence } from "@/services/evidence";
import { parseRequestBody, parseSearchParams } from "@/lib/validation";
import { z } from "zod/v4";
import { paginationSchema } from "@/lib/validation";

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
  const workspaceId = request.headers.get("x-workspace-id") || "";
  await withAuth({ capability: CAPABILITIES.EVIDENCE_VIEW });

  const params = parseSearchParams(request.url, listEvidenceSchema);
  const result = await listEvidence(workspaceId, params);

  return Response.json(result);
});

export const POST = withRequestContext(async (request) => {
  const workspaceId = request.headers.get("x-workspace-id") || "";
  const { session } = await withAuth({
    capability: CAPABILITIES.EVIDENCE_SUBMIT,
    internalOnly: true,
  });

  const body = await parseRequestBody(request, createEvidenceSchema);
  const result = await createEvidence(body, session.user.id, workspaceId);

  return Response.json(result, { status: 201 });
});
