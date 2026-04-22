import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { createFinding, listFindingsForEngagement } from "@/services/finding";
import { parseRequestBody, parseOrThrow, uuidSchema, parseSearchParams } from "@/lib/validation";
import { z } from "zod/v4";
import { RISK_SEVERITIES, FINDING_STATUSES } from "@/domain/constants/statuses";
import { paginationSchema } from "@/lib/validation";

const createFindingSchema = z.object({
  shockEventId: z.string().uuid().optional(),
  title: z.string().min(1),
  statement: z.string().min(1),
  severity: z.enum(RISK_SEVERITIES),
  status: z.enum(FINDING_STATUSES).optional(),
  rationale: z.string().optional(),
  linkedEvidenceIds: z.array(z.string().uuid()).optional(),
});

const listFindingSchema = paginationSchema.extend({
  severity: z.string().optional(),
  status: z.string().optional(),
});

export const GET = withRequestContext(async (request, context) => {
  const { engagementId } = await context.params;
  parseOrThrow(uuidSchema, engagementId);
  await withAuth({ capability: CAPABILITIES.FINDING_VIEW });

  const params = parseSearchParams(request.url, listFindingSchema);
  const result = await listFindingsForEngagement(engagementId, params);

  return Response.json(result);
});

export const POST = withRequestContext(async (request, context) => {
  const { engagementId } = await context.params;
  parseOrThrow(uuidSchema, engagementId);
  const { session } = await withAuth({
    capability: CAPABILITIES.FINDING_CREATE,
    internalOnly: true,
  });

  const body = await parseRequestBody(request, createFindingSchema);
  const result = await createFinding(
    { ...body, engagementId },
    session.user.id
  );

  return Response.json(result, { status: 201 });
});
