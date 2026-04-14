import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { createClient, listClients } from "@/services/client-account";
import { parseRequestBody, parseSearchParams } from "@/lib/validation";
import { z } from "zod/v4";
import { paginationSchema } from "@/lib/validation";

const createClientSchema = z.object({
  name: z.string().min(1),
  legalName: z.string().optional(),
  industry: z.string().optional(),
  size: z.string().optional(),
  website: z.string().url().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
});

const listClientsSchema = paginationSchema.extend({
  status: z.string().optional(),
  search: z.string().optional(),
});

export const GET = withRequestContext(async (request) => {
  await withAuth({ capability: CAPABILITIES.CLIENT_VIEW });

  const params = parseSearchParams(request.url, listClientsSchema);
  const result = await listClients(params);

  return Response.json(result);
});

export const POST = withRequestContext(async (request) => {
  const { session } = await withAuth({
    capability: CAPABILITIES.CLIENT_CREATE,
    internalOnly: true,
  });

  const body = await parseRequestBody(request, createClientSchema);
  const result = await createClient(body, session.user.id);

  return Response.json(result, { status: 201 });
});
