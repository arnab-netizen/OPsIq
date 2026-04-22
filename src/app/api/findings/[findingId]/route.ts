import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getFindingDetailDetail, updateFinding } from "@/services/findings";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { z } from "zod/v4";
import {
  FINDING_STATUSES,
  FINDING_SEVERITIES,
  FINDING_IMPACTS,
} from "@/domain/constants/statuses";

const updateFindingSchema = z.object({
  title: z.string().min(1).optional(),
  summary: z.string().min(1).optional(),
  severity: z.enum(FINDING_SEVERITIES).optional(),
  impactArea: z.enum(FINDING_IMPACTS).optional(),
  confidenceScore: z.number().min(0).max(1).optional(),
  priorityScore: z.number().min(0).max(100).optional(),
  hypothesis: z.string().optional(),
  rootCause: z.string().optional(),
  consequence: z.string().optional(),
  ownerId: z.string().uuid().optional(),
  dueAt: z.string().optional(),
  status: z.enum(FINDING_STATUSES).optional(),
  version: z.number().int().min(1),
});

export const GET = withRequestContext(async (_request, context) => {
  const { findingId } = await context.params;
  parseOrThrow(uuidSchema, findingId);
  await withAuth({ capability: CAPABILITIES.FINDING_VIEW });

  const finding = await getFindingDetail(findingId);
  return Response.json(finding);
});

export const PATCH = withRequestContext(async (request, context) => {
  const { findingId } = await context.params;
  parseOrThrow(uuidSchema, findingId);
  const { session } = await withAuth({
    capability: CAPABILITIES.FINDING_UPDATE,
    internalOnly: true,
  });

  const body = await parseRequestBody(request, updateFindingSchema);
  await updateFinding(findingId, body, session.user.id);

  const updated = await getFindingDetail(findingId);
  return Response.json(updated);
});
