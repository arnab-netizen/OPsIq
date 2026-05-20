import { emitAuditEvent } from '@/infra/audit';
import { AUDIT_EVENTS } from '@/domain/constants/audit-events';
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { withEnforcementFull } from "@/lib/enforced-route";
import { ForbiddenError } from "@/infra/errors";
import { withAuth, canonicalizeAuthContext } from ", { createServiceCapabilityContext }@/lib/auth-guard", { createServiceCapabilityContext };
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import {
  getClientById,
  updateClient,
  archiveClient,
} from "@/services/client-account";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { checkIdempotencyKey, recordIdempotencyResponse, recordIdempotencyError } from "@/services/idempotency";
import { z } from "zod/v4";
import type { NextRequest } from "next/server";

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

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const workspaceId = ctx.verifiedWorkspaceId;
    const { clientId } = params;
    parseOrThrow(uuidSchema, clientId);

    const client = await getClientById(clientId, workspaceId);
    return Response.json(client);
  },
  { requireWorkspace: true, requireCapabilities: ['CLIENT_VIEW'] }
);

export const PATCH = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const { clientId } = params;
    parseOrThrow(uuidSchema, clientId);

    const body = await parseRequestBody(ctx.request!, updateClientSchema);

    await updateClient(clientId, body, ctx, ctx.verifiedWorkspaceId);

    const updated = await getClientById(clientId, ctx.verifiedWorkspaceId);
    return Response.json(updated);
  },
  {
    requireCapabilities: [CAPABILITIES.CLIENT_UPDATE],
    requireWorkspace: true,
  }
);

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const { clientId } = params;
    parseOrThrow(uuidSchema, clientId);
    const workspaceId = ctx.verifiedWorkspaceId;

    const idempotencyKey = ctx.request?.headers.get("idempotency-key");
    if (!idempotencyKey) {
      return Response.json(
        { error: "idempotency-key header required" },
        { status: 400 }
      );
    }

    const body = await parseRequestBody(ctx.request!, archiveSchema);

    const idempotencyCheck = await checkIdempotencyKey({
      idempotencyKey,
      operationName: "archiveClient",
      actorId: ctx.verifiedActorId,
      payload: { clientId, version: body.version },
    });

    if (!idempotencyCheck.isNew && idempotencyCheck.cachedResponse) {
      return Response.json(idempotencyCheck.cachedResponse.body, {
        status: idempotencyCheck.cachedResponse.status,
      });
    }

    try {
      await archiveClient(clientId, ctx, body.version, workspaceId);
      const result = { status: "archived" };
      await recordIdempotencyResponse(idempotencyKey, 200, result, auditContext, workspace?.workspaceId || workspaceId || verifiedWorkspaceId || "unknown");
      return Response.json(result);
    } catch (error) {
      const err = error instanceof Error ? error : new Error("Unknown error");
      await recordIdempotencyError(idempotencyKey, err, auditContext, workspace?.workspaceId || workspaceId || verifiedWorkspaceId || "unknown");
      throw error;
    }
  }, auditContext, {
    requireCapabilities: [CAPABILITIES.CLIENT_ARCHIVE],
    requireWorkspace: true,
  }
);
