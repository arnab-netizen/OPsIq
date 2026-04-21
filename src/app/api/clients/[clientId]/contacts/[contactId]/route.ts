import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { updateContact, deactivateContact } from "@/services/client-contact";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { z } from "zod/v4";

const updateContactSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.email().optional(),
  phone: z.string().optional(),
  role: z.string().optional(),
  isPrimary: z.boolean().optional(),
  notes: z.string().optional(),
});

export const PATCH = withRequestContext(async (request, context) => {
  const { clientId, contactId } = await context.params;
  parseOrThrow(uuidSchema, clientId);
  parseOrThrow(uuidSchema, contactId);
  const { session } = await withAuth({
    capability: CAPABILITIES.CLIENT_UPDATE,
    internalOnly: true,
  });

  const body = await parseRequestBody(request, updateContactSchema);
  await updateContact(contactId, body, session.user.id);

  return Response.json({ status: "updated" });
});

export const DELETE = withRequestContext(async (_request, context) => {
  const { clientId, contactId } = await context.params;
  parseOrThrow(uuidSchema, clientId);
  parseOrThrow(uuidSchema, contactId);
  const { session } = await withAuth({
    capability: CAPABILITIES.CLIENT_UPDATE,
    internalOnly: true,
  });

  await deactivateContact(contactId, session.user.id);

  return Response.json({ status: "deactivated" });
});
