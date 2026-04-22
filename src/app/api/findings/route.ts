import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { createFinding } from "@/services/finding";
import { parseRequestBody } from "@/lib/validation";
import { z } from "zod/v4";
import {
  FINDING_STATUSES,
  FINDING_SEVERITIES,
  FINDING_IMPACTS,
} from "@/domain/constants/statuses";

const createFindingSchema = z.object({
  engagementId: z.string().uuid(),
  stageId: z.string().uuid().optional(),
  primaryEvidenceId: z.string().uuid(),
  title: z.string().min(1),
  summary: z.string().min(1),
  severity: z.enum(FINDING_SEVERITIES),
  impactArea: z.enum(FINDING_IMPACTS),
  confidenceScore: z.number().min(0).max(1).optional(),
  hypothesis: z.string().optional(),
  rootCause: z.string().optional(),
  consequence: z.string().optional(),
  ownerId: z.string().uuid().optional(),
  dueAt: z.string().optional(),
});

export const POST = withRequestContext(async (request) => {
  const { session } = await withAuth({
    capability: CAPABILITIES.FINDING_CREATE,
    internalOnly: true,
  });

  const body = await parseRequestBody(request, createFindingSchema);
  const result = await createFinding(body, session.user.id);

  return Response.json(result, { status: 201 });
});
