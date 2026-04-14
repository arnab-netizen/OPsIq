import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getLeadById, updateLead, linkLeadToEngagement } from "@/services/lead";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { z } from "zod/v4";
import { LEAD_STATUSES } from "@/domain/constants/statuses";

const updateLeadSchema = z.object({
  companyName: z.string().min(1).optional(),
  contactName: z.string().optional(),
  contactEmail: z.email().optional(),
  contactPhone: z.string().optional(),
  source: z.string().optional(),
  notes: z.string().optional(),
  estimatedValue: z.number().positive().optional(),
  status: z.enum(LEAD_STATUSES).optional(),
  assignedTo: z.string().uuid().optional(),
});

const linkLeadSchema = z.object({
  action: z.literal("link_to_engagement"),
  engagementId: z.string().uuid(),
  clientId: z.string().uuid(),
});

export const GET = withRequestContext(async (_request, context) => {
  const { leadId } = await context.params;
  parseOrThrow(uuidSchema, leadId);
  await withAuth({ capability: CAPABILITIES.LEAD_VIEW, internalOnly: true });

  const lead = await getLeadById(leadId);
  return Response.json(lead);
});

export const PATCH = withRequestContext(async (request, context) => {
  const { leadId } = await context.params;
  parseOrThrow(uuidSchema, leadId);
  const { session } = await withAuth({
    capability: CAPABILITIES.LEAD_UPDATE,
    internalOnly: true,
  });

  const body = await parseRequestBody(request, updateLeadSchema);
  await updateLead(leadId, body, session.user.id);

  const updated = await getLeadById(leadId);
  return Response.json(updated);
});

export const POST = withRequestContext(async (request, context) => {
  const { leadId } = await context.params;
  parseOrThrow(uuidSchema, leadId);
  const { session } = await withAuth({
    capability: CAPABILITIES.LEAD_UPDATE,
    internalOnly: true,
  });

  const body = await parseRequestBody(request, linkLeadSchema);
  await linkLeadToEngagement(
    leadId,
    body.engagementId,
    body.clientId,
    session.user.id
  );

  const updated = await getLeadById(leadId);
  return Response.json(updated);
});
