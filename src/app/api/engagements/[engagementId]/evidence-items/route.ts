import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { createEvidenceItem, listEvidenceForEngagement } from "@/services/evidence-item";
import { parseRequestBody, parseOrThrow, uuidSchema, parseSearchParams } from "@/lib/validation";
import { z } from "zod/v4";
import { EVIDENCE_CATEGORIES, EVIDENCE_SOURCE_TYPES, VISIBILITY_LEVELS } from "@/domain/constants/statuses";
import { paginationSchema } from "@/lib/validation";

const createEvidenceItemSchema = z.object({
  shockEventId: z.string().uuid().optional(),
  category: z.enum(EVIDENCE_CATEGORIES),
  sourceType: z.enum(EVIDENCE_SOURCE_TYPES),
  title: z.string().min(1),
  description: z.string().optional(),
  capturedAt: z.string(),
  visibilityClassification: z.enum(VISIBILITY_LEVELS),
});

const listEvidenceSchema = paginationSchema.extend({
  category: z.string().optional(),
  sourceType: z.string().optional(),
});

export const GET = withRequestContext(async (request, context) => {
  const { engagementId } = await context.params;
  parseOrThrow(uuidSchema, engagementId);
  await withAuth({ capability: CAPABILITIES.EVIDENCE_VIEW });

  const params = parseSearchParams(request.url, listEvidenceSchema);
  const result = await listEvidenceForEngagement(engagementId, params);

  return Response.json(result);
});

export const POST = withRequestContext(async (request, context) => {
  const { engagementId } = await context.params;
  parseOrThrow(uuidSchema, engagementId);
  const { session } = await withAuth({
    capability: CAPABILITIES.EVIDENCE_SUBMIT,
    internalOnly: true,
  });

  const body = await parseRequestBody(request, createEvidenceItemSchema);
  const result = await createEvidenceItem(
    { ...body, engagementId },
    session.user.id
  );

  return Response.json(result, { status: 201 });
});
