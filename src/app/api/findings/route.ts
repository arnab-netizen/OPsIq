import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { createFinding } from "@/services/findings";
import { parseRequestBody } from "@/lib/validation";
import { checkIdempotencyKey, recordIdempotencyResponse, recordIdempotencyError } from "@/services/idempotency";
import { z } from "zod/v4";
import {
  FINDING_STATUSES,
  FINDING_SEVERITIES,
  FINDING_IMPACTS,
} from "@/domain/constants/statuses";
import type { NextRequest } from "next/server";

const createFindingSchema = z.object({
  engagementId: z.string().uuid(),
  stageId: z.string().uuid().optional(),
  primaryEvidenceId: z.string().uuid(),
  title: z.string().min(1),
  summary: z.string().min(1),
  severity: z.enum(FINDING_SEVERITIES),
  impactArea: z.enum(FINDING_IMPACTS),
  confidenceScore: z.number().min(0).max(1).optional(),
  hypothesis: z.string().optional(),
  rootCause: z.string().optional(),
  consequence: z.string().optional(),
  ownerId: z.string().uuid().optional(),
  dueAt: z.string().optional(),
});

export const POST = withRequestContext(async (request) => {
  // Authenticate + authorize (fail-closed)
  const { session, policy } = await withAuth({
    capability: CAPABILITIES.FINDING_CREATE,
    internalOnly: true,
  });

  // Validate workspace membership (fail-closed)
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
    return Response.json({ error: "Unauthorized" }, { status: 403 });
  }

  const idempotencyKey = request.headers.get("idempotency-key");
  if (!idempotencyKey) {
    return Response.json(
      { error: "idempotency-key header required" },
      { status: 400 }
    );
  }

  const body = await parseRequestBody(request, createFindingSchema);

  // Check idempotency
  const idempotencyCheck = await checkIdempotencyKey({
    idempotencyKey,
    operationName: "createFinding",
    actorId: session.user.id,
    payload: body,
  });

  if (!idempotencyCheck.isNew && idempotencyCheck.cachedResponse) {
    return Response.json(idempotencyCheck.cachedResponse.body, {
      status: idempotencyCheck.cachedResponse.status,
    });
  }

  try {
    const result = await createFinding(body, { session, policy }, workspaceId);
    await recordIdempotencyResponse(idempotencyKey, 201, result);
    return Response.json(result, { status: 201 });
  } catch (error) {
    const err = error instanceof Error ? error : new Error("Unknown error");
    await recordIdempotencyError(idempotencyKey, err);
    throw error;
  }
});
