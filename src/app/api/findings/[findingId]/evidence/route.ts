import { withEnforcementFull } from "@/lib/enforced-route";
import { withAuth, canonicalizeAuthContext } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { linkEvidenceToFinding, unlinkEvidenceFromFinding } from "@/services/findings";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { checkIdempotencyKey, recordIdempotencyResponse, recordIdempotencyError } from "@/services/idempotency";
import { z } from "zod/v4";
import type { NextRequest } from "next/server";

const linkEvidenceSchema = z.object({
  evidenceId: z.string().uuid(),
});

const unlinkEvidenceSchema = z.object({
  evidenceId: z.string().uuid(),
});

export const POST = withEnforcementFull(async (request, context, params) => {
  const { findingId } = params;
  parseOrThrow(uuidSchema, findingId);

  const nextRequest = request as NextRequest;
  const workspaceId = nextRequest.headers.get("x-workspace-id") || "system";

  const { session, policy } = await withAuth({
    capability: CAPABILITIES.FINDING_UPDATE,
    internalOnly: true,
  }, workspaceId);

  const idempotencyKey = request.headers.get("idempotency-key");
  if (!idempotencyKey) {
    return Response.json(
      { error: "idempotency-key header required" },
      { status: 400 }
    );
  }

  const body = await parseRequestBody(request, linkEvidenceSchema);

  const idempotencyCheck = await checkIdempotencyKey({
    idempotencyKey,
    operationName: "linkEvidenceToFinding",
    actorId: session.user.id,
    payload: { findingId, evidenceId: body.evidenceId },
  });

  if (!idempotencyCheck.isNew && idempotencyCheck.cachedResponse) {
    return Response.json(idempotencyCheck.cachedResponse.body, {
      status: idempotencyCheck.cachedResponse.status,
    });
  }

  try {
    const result = await linkEvidenceToFinding(findingId, body.evidenceId, canonicalizeAuthContext({ session, policy }, workspaceId), undefined, workspaceId);
    await recordIdempotencyResponse(idempotencyKey, 201, result);
    return Response.json(result, { status: 201 });
  } catch (error) {
    const err = error instanceof Error ? error : new Error("Unknown error");
    await recordIdempotencyError(idempotencyKey, err);
    throw error;
  }
});

export const DELETE = withEnforcementFull(async (request, context, params) => {
  const { findingId } = params;
  parseOrThrow(uuidSchema, findingId);

  const nextRequest = request as NextRequest;
  const workspaceId = nextRequest.headers.get("x-workspace-id") || "system";

  const { session, policy } = await withAuth({
    capability: CAPABILITIES.FINDING_UPDATE,
    internalOnly: true,
  }, workspaceId);

  const body = await parseRequestBody(request, unlinkEvidenceSchema);
  const result = await unlinkEvidenceFromFinding(findingId, body.evidenceId, canonicalizeAuthContext({ session, policy }, workspaceId), workspaceId);

  return Response.json(result, { status: 200 });
});
