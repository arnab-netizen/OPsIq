import { withEnforcementFull } from "@/lib/enforced-route";
import { withAuth } from "@/lib/auth-guard";
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

export const PATCH = withEnforcementFull(async (request, context, params) => {
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

  const body = await parseRequestBody(request, updateContactSchema);
  await updateContact(contactId, body, authContext, workspaceId);

  return Response.json({ status: "updated" });
});

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
  await deactivateContact(contactId, authContext, workspaceId);

  return Response.json({ status: "deactivated" });
});
