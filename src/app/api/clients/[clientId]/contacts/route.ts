import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { createContact, getContactsForClient } from "@/services/client-contact";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { z } from "zod/v4";
import type { NextRequest } from "next/server";

const createContactSchema = z.object({
  name: z.string().min(1),
  email: z.email().optional(),
  phone: z.string().optional(),
  role: z.string().optional(),
  isPrimary: z.boolean().optional(),
  notes: z.string().optional(),
});

export const GET = withRequestContext(async (_request, context) => {
  const { clientId } = await context.params;
  parseOrThrow(uuidSchema, clientId);
  await withAuth({ capability: CAPABILITIES.CLIENT_VIEW });

  const contacts = await getContactsForClient(clientId);
  return Response.json({ contacts });
});

export const POST = withRequestContext(async (request, context) => {
  const { clientId } = await context.params;
  parseOrThrow(uuidSchema, clientId);
  const authContext = await withAuth({
    capability: CAPABILITIES.CLIENT_UPDATE,
    internalOnly: true,
  });

  const nextRequest = request as NextRequest;
  const workspaceId = nextRequest.headers.get("x-workspace-id");
  if (!workspaceId) {
    return Response.json(
      { error: "Workspace ID required (x-workspace-id header)" },
      { status: 400 }
    );
  }

  const body = await parseRequestBody(request, createContactSchema);
  const result = await createContact(
    { ...body, clientId },
    authContext,
    workspaceId
  );

  return Response.json(result, { status: 201 });
});
