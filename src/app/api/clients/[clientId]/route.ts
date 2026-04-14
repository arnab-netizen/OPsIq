import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import {
  getClientById,
  updateClient,
  archiveClient,
} from "@/services/client-account";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { z } from "zod/v4";

const updateClientSchema = z.object({
  name: z.string().min(1).optional(),
  legalName: z.string().optional(),
  industry: z.string().optional(),
  size: z.string().optional(),
  website: z.string().url().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
  version: z.number().int().min(1),
});

const archiveSchema = z.object({
  action: z.literal("archive"),
  version: z.number().int().min(1),
});

export const GET = withRequestContext(async (_request, context) => {
  const { clientId } = await context.params;
  parseOrThrow(uuidSchema, clientId);
  await withAuth({ capability: CAPABILITIES.CLIENT_VIEW });

  const client = await getClientById(clientId);
  return Response.json(client);
});

export const PATCH = withRequestContext(async (request, context) => {
  const { clientId } = await context.params;
  parseOrThrow(uuidSchema, clientId);
  const { session } = await withAuth({
    capability: CAPABILITIES.CLIENT_UPDATE,
    internalOnly: true,
  });

  const body = await parseRequestBody(request, updateClientSchema);
  await updateClient(clientId, body, session.user.id);

  const updated = await getClientById(clientId);
  return Response.json(updated);
});

export const POST = withRequestContext(async (request, context) => {
  const { clientId } = await context.params;
  parseOrThrow(uuidSchema, clientId);
  const { session } = await withAuth({
    capability: CAPABILITIES.CLIENT_ARCHIVE,
    internalOnly: true,
  });

  const body = await parseRequestBody(request, archiveSchema);
  await archiveClient(clientId, session.user.id, body.version);

  return Response.json({ status: "archived" });
});
