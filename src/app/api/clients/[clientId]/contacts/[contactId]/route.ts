import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { deactivateContact } from "@/services/client-contact";
import { parseOrThrow, uuidSchema } from "@/lib/validation";

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
