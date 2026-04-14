import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { createLead, listLeads } from "@/services/lead";
import { parseRequestBody, parseSearchParams } from "@/lib/validation";
import { z } from "zod/v4";
import { paginationSchema } from "@/lib/validation";

const createLeadSchema = z.object({
  companyName: z.string().min(1),
  contactName: z.string().min(1).optional(),
  contactEmail: z.email().optional(),
  contactPhone: z.string().optional(),
  source: z.string().optional(),
  notes: z.string().optional(),
  estimatedValue: z.number().positive().optional(),
  assignedTo: z.string().uuid().optional(),
});

const listLeadsSchema = paginationSchema.extend({
  status: z.string().optional(),
  search: z.string().optional(),
});

export const GET = withRequestContext(async (request) => {
  await withAuth({ capability: CAPABILITIES.LEAD_VIEW, internalOnly: true });

  const params = parseSearchParams(request.url, listLeadsSchema);
  const result = await listLeads(params);

  return Response.json(result);
});

export const POST = withRequestContext(async (request) => {
  const { session } = await withAuth({
    capability: CAPABILITIES.LEAD_CREATE,
    internalOnly: true,
  });

  const body = await parseRequestBody(request, createLeadSchema);
  const result = await createLead(body, session.user.id);

  return Response.json(result, { status: 201 });
});
