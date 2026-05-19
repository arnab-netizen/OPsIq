import { emitAuditEvent } from '@/infra/audit';
import { AUDIT_EVENTS } from '@/domain/constants/audit-events';
import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { withEnforcementFull } from "@/lib/enforced-route";
import { withAuth, canonicalizeAuthContext } from "@/lib/auth-guard";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import {
  createEvidenceBundle,
  listEvidenceBundles,
} from "@/services/evidence";
import { parseRequestBody, parseSearchParams } from "@/lib/validation";
import { createEvidenceBundleSchema } from "@/domain/validation/evidence";
import { checkIdempotencyKey, recordIdempotencyResponse, recordIdempotencyError } from "@/services/idempotency";
import { z } from "zod/v4";
import { errorToResponse } from "@/infra/errors";
import { logger } from "@/infra/logger";
import type { NextRequest } from "next/server";
import { UnauthorizedError, ForbiddenError } from "@/infra/errors";

const listBundlesSchema = z.object({
  engagementId: z.string().uuid(),
});

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    try {
      const workspaceId = ctx.verifiedWorkspaceId;

      const idempotencyKey = ctx.request?.headers.get("idempotency-key");
      if (!idempotencyKey) {
        return Response.json(
          { error: "idempotency-key header required" },
          { status: 400 }
        );
      }

      const body = await parseRequestBody(ctx.request!, createEvidenceBundleSchema);

      // Check idempotency
      const idempotencyCheck = await checkIdempotencyKey({
        idempotencyKey,
        operationName: "createEvidenceBundle",
        actorId: ctx.verifiedActorId,
        payload: body,
      });

      if (!idempotencyCheck.isNew && idempotencyCheck.cachedResponse) {
        return Response.json(idempotencyCheck.cachedResponse.body, {
          status: idempotencyCheck.cachedResponse.status,
        });
      }

      const result = await createEvidenceBundle(body, ctx, workspaceId);
      await recordIdempotencyResponse(idempotencyKey, 201, result);

      return Response.json(result, { status: 201 });
    } catch (error) {
      logger.error("Error creating evidence bundle", { error });
      if (ctx.request?.headers.get("idempotency-key")) {
        const err = error instanceof Error ? error : new Error("Unknown error");
        await recordIdempotencyError(ctx.request.headers.get("idempotency-key")!, err);
      }
      return errorToResponse(error);
    }
  },
  {
    requireCapabilities: [CAPABILITIES.EVIDENCE_SUBMIT],
    requireWorkspace: true,
  }
);

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const workspaceId = ctx.verifiedWorkspaceId;
    const params = parseSearchParams(ctx.request!.url, listBundlesSchema);
    const result = await listEvidenceBundles(params.engagementId, workspaceId);
    return Response.json({ bundles: result });
  },
  { requireWorkspace: true, requireCapabilities: ['EVIDENCE_VIEW'] }
);
