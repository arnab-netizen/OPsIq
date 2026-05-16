import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { withEnforcementFull } from "@/lib/enforced-route";
import { UnauthorizedError, ForbiddenError } from "@/infra/errors";
import { withAuth, canonicalizeAuthContext } from "@/lib/auth-guard";
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

export const PATCH = withEnforcementFull(async (request, context, params) => {
  const { session, policy } = await withAuth({
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

  const membership = await enforceWorkspaceScoping(nextRequest, workspaceId);
  if (!membership) {
    throw new ForbiddenError("Unauthorized");
  }

  const { clientId } = params;
  parseOrThrow(uuidSchema, clientId);

  const body = await parseRequestBody(request, updateClientSchema);
  const canonicalContext = canonicalizeAuthContext({ session, policy }, workspaceId);
  await updateClient(clientId, body, canonicalContext, workspaceId);

  const updated = await getClientById(clientId, workspaceId);
  return Response.json(updated);
});

export const POST = withEnforcementFull(async (request, context, params) => {
  const { session, policy } = await withAuth({
    capability: CAPABILITIES.CLIENT_ARCHIVE,
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

  const membership = await enforceWorkspaceScoping(nextRequest, workspaceId);
  if (!membership) {
    throw new ForbiddenError("Unauthorized");
  }

  const idempotencyKey = request.headers.get("idempotency-key");
  if (!idempotencyKey) {
    return Response.json(
      { error: "idempotency-key header required" },
      { status: 400 }
    );
  }

  const { clientId } = params;
  parseOrThrow(uuidSchema, clientId);

  const body = await parseRequestBody(request, archiveSchema);

  const idempotencyCheck = await checkIdempotencyKey({
    idempotencyKey,
    operationName: "archiveClient",
    actorId: session.user.id,
    payload: { clientId, version: body.version },
  });

  if (!idempotencyCheck.isNew && idempotencyCheck.cachedResponse) {
    return Response.json(idempotencyCheck.cachedResponse.body, {
      status: idempotencyCheck.cachedResponse.status,
    });
  }

  try {
    const canonicalContext = canonicalizeAuthContext({ session, policy }, workspaceId);
    await archiveClient(clientId, canonicalContext, body.version, workspaceId);
    const result = { status: "archived" };
    await recordIdempotencyResponse(idempotencyKey, 200, result);
    return Response.json(result);
  } catch (error) {
    const err = error instanceof Error ? error : new Error("Unknown error");
    await recordIdempotencyError(idempotencyKey, err);
    throw error;
  }
});
