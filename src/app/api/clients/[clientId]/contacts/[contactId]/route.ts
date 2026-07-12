import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { ForbiddenError } from "@/infra/errors";
import { hasInternalAccess } from "@/policies/capability-check";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import {
  updateContact,
  deactivateContact,
} from "@/services/client-contact";
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

const deactivateContactSchema = z.object({
  action: z.literal("deactivate"),
});

export const PATCH = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const { contactId } = params;
    parseOrThrow(uuidSchema, contactId);

    const body = await parseRequestBody(ctx.request!, updateContactSchema);
    await updateContact(contactId, body, ctx, ctx.verifiedWorkspaceId);

    return { status: "updated" };
  },
  {
    requireCapabilities: [CAPABILITIES.CLIENT_UPDATE],
    requireWorkspace: true,
  }
);

export const DELETE = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    if (!ctx.policy || !hasInternalAccess(ctx.policy)) {
      throw new ForbiddenError("Internal access required");
    }

    const { clientId, contactId } = params;
    parseOrThrow(uuidSchema, clientId);
    parseOrThrow(uuidSchema, contactId);

    await parseRequestBody(ctx.request!, deactivateContactSchema);
    await deactivateContact(contactId, ctx, ctx.verifiedWorkspaceId);

    return { status: "deactivated" };
  },
  {
    requireCapabilities: [CAPABILITIES.CLIENT_UPDATE],
    requireWorkspace: true,
  }
);
