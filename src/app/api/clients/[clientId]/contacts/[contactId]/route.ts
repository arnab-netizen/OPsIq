import { emitAuditEvent } from '@/infra/audit';
import { AUDIT_EVENTS } from '@/domain/constants/audit-events';
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { withEnforcementFull } from "@/lib/enforced-route";
import { withAuth, canonicalizeAuthContext } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import {
  updateContact,
  deactivateContact,
} from "@/services/client-contact";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { z } from "zod/v4";
import type { NextRequest } from "next/server";

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

    return Response.json({ status: "updated" });
  },
  {
    requireCapabilities: [CAPABILITIES.CLIENT_UPDATE],
    requireWorkspace: true,
  }
);

export const DELETE = withEnforcementFull(async (request, context, params) => {
  const { clientId, contactId } = params;
  parseOrThrow(uuidSchema, clientId);
  parseOrThrow(uuidSchema, contactId);
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

  const body = await parseRequestBody(request, deactivateContactSchema);
  const canonicalContext = canonicalizeAuthContext(authContext, workspaceId);
  await deactivateContact(contactId, canonicalContext, workspaceId);

  return Response.json({ status: "deactivated" });
});
