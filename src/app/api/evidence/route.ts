import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { createEvidence, listEvidence } from "@/services/evidence";
import { parseRequestBody, parseSearchParams } from "@/lib/validation";
import { checkIdempotencyKey, recordIdempotencyResponse, recordIdempotencyError } from "@/services/idempotency";
import { z } from "zod/v4";
import { paginationSchema } from "@/lib/validation";

const createEvidenceSchema = z.object({
  engagementId: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().optional(),
  evidenceType: z.enum(["document", "interview", "metric", "observation"]),
  sourceReference: z.string().optional(),
  severity: z.enum(["low", "medium", "high", "critical"]).optional(),
});

const listEvidenceSchema = paginationSchema.extend({
  engagementId: z.string().uuid().optional(),
  status: z.string().optional(),
});

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const workspaceId = ctx.verifiedWorkspaceId;
    const params = parseSearchParams(ctx.request!.url, listEvidenceSchema);
    const result = await listEvidence(workspaceId, params);
    return result;
  },
  { requireWorkspace: true, requireCapabilities: ['EVIDENCE_VIEW'] }
);

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const workspaceId = ctx.verifiedWorkspaceId;

    const idempotencyKey = ctx.request!.headers.get("idempotency-key");
    if (!idempotencyKey) {
      return Response.json(
        { error: "idempotency-key header required" },
        { status: 400 }
      );
    }

    const body = await parseRequestBody(ctx.request!, createEvidenceSchema);

    // Check idempotency
    const idempotencyCheck = await checkIdempotencyKey({
      idempotencyKey,
      operationName: "createEvidence",
      actorId: ctx.verifiedSessionSnapshot.actorId,
      payload: body,
    });

    if (!idempotencyCheck.isNew && idempotencyCheck.cachedResponse) {
      return Response.json(idempotencyCheck.cachedResponse.body, {
        status: idempotencyCheck.cachedResponse.status,
      });
    }

    try {
      const result = await createEvidence(body, ctx, workspaceId);
      await recordIdempotencyResponse(idempotencyKey, 201, result);
      return Response.json(result, { status: 201 });
    } catch (error) {
      const err = error instanceof Error ? error : new Error("Unknown error");
      await recordIdempotencyError(idempotencyKey, err);
      throw error;
    }
  },
  { requireWorkspace: true, requireCapabilities: ['EVIDENCE_SUBMIT'] }
);
