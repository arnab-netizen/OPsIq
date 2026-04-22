import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { hasInternalAccess } from "@/policies/capability-check";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getEngagementById, updateEngagement } from "@/services/engagement";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { z } from "zod/v4";
import {
  ENGAGEMENT_STATUSES,
  INTERVENTION_MODES,
  SERVICE_TIERS,
  ENGAGEMENT_MODES,
  HEALTH_STATUSES,
} from "@/domain/constants/statuses";

const updateEngagementSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  serviceTier: z.enum(SERVICE_TIERS).optional(),
  engagementMode: z.enum(ENGAGEMENT_MODES).optional(),
  startDate: z.string().optional(),
  targetEndDate: z.string().optional(),
  ownerId: z.string().uuid().optional(),
  assignedConsultantId: z.string().uuid().optional(),
  healthStatus: z.enum(HEALTH_STATUSES).optional(),
  status: z.enum(ENGAGEMENT_STATUSES).optional(),
  interventionMode: z.enum(INTERVENTION_MODES).optional(),
  version: z.number().int().min(1),
});

export const GET = withRequestContext(async (_request, context) => {
  const { engagementId } = await context.params;
  parseOrThrow(uuidSchema, engagementId);
  const { policy } = await withAuth({ capability: CAPABILITIES.ENGAGEMENT_VIEW });

  const engagement = await getEngagementById(engagementId, hasInternalAccess(policy));
  return Response.json(engagement);
});

export const PATCH = withRequestContext(async (request, context) => {
  const { engagementId } = await context.params;
  parseOrThrow(uuidSchema, engagementId);
  const { session, policy } = await withAuth({
    capability: CAPABILITIES.ENGAGEMENT_UPDATE,
    internalOnly: true,
  });

  const body = await parseRequestBody(request, updateEngagementSchema);
  await updateEngagement(engagementId, body, session.user.id);

  const updated = await getEngagementById(engagementId, hasInternalAccess(policy));
  return Response.json(updated);
});
