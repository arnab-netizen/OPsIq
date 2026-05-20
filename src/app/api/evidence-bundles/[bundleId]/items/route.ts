import { emitAuditEvent } from '@/infra/audit';
import { AUDIT_EVENTS } from '@/domain/constants/audit-events';
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import {
  addEvidenceToBundle,
  removeEvidenceFromBundle,
} from "@/services/evidence";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { checkIdempotencyKey, recordIdempotencyResponse, recordIdempotencyError } from "@/services/idempotency";
import {
  addEvidenceToBundleSchema,
  removeEvidenceFromBundleSchema,
} from "@/domain/validation/evidence";
import { errorToResponse } from "@/infra/errors";
import { logger } from "@/infra/logger";

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    try {
      const workspaceId = nextRequest.headers.get("x-workspace-id");
      const { bundleId } = params;
      parseOrThrow(uuidSchema, bundleId);

      const idempotencyKey = ctx.request!.headers.get("idempotency-key");
      if (!idempotencyKey) {
        return Response.json(
          { error: "idempotency-key header required" },
          { status: 400 }
        );
      }

      const bodyData = await parseRequestBody(
        ctx.request!,
        addEvidenceToBundleSchema
      );

      if (bodyData.bundleId !== bundleId) {
        return Response.json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "Bundle ID mismatch",
            },
          },
          { status: 400 }
        );
      }

      const idempotencyCheck = await checkIdempotencyKey({
        idempotencyKey,
        operationName: "addEvidenceToBundle",
        actorId: ctx.verifiedActorId,
        payload: bodyData,
      });

      if (!idempotencyCheck.isNew && idempotencyCheck.cachedResponse) {
        return Response.json(idempotencyCheck.cachedResponse.body, {
          status: idempotencyCheck.cachedResponse.status,
        });
      }

      await addEvidenceToBundle(bodyData, ctx, workspaceId);
      await recordIdempotencyResponse(idempotencyKey, 201, { success: true }, auditContext, workspace?.workspaceId || workspaceId || verifiedWorkspaceId || "unknown");

      return Response.json({ success: true }, { status: 201 });
    } catch (error) {
      logger.error("Error adding evidence to bundle", { error });
      const idempotencyKey = ctx.request!.headers.get("idempotency-key");
      if (idempotencyKey) {
        const err = error instanceof Error ? error : new Error("Unknown error");
        await recordIdempotencyError(idempotencyKey, err, auditContext, workspaceId);
      }
      return errorToResponse(error);
    }
  }, auditContext, { requireCapabilities: [CAPABILITIES.EVIDENCE_SUBMIT], requireWorkspace: true }
);

export const DELETE = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    try {
      const workspaceId = nextRequest.headers.get("x-workspace-id");
      const { bundleId } = params;
      parseOrThrow(uuidSchema, bundleId);

      const bodyData = await parseRequestBody(
        ctx.request!,
        removeEvidenceFromBundleSchema
      );

      if (bodyData.bundleId !== bundleId) {
        return Response.json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "Bundle ID mismatch",
            },
          },
          { status: 400 }
        );
      }

      await removeEvidenceFromBundle(bodyData, ctx, workspaceId);

      return Response.json({ success: true });
    } catch (error) {
      logger.error("Error removing evidence from bundle", { error });
      return errorToResponse(error);
    }
  },
  { requireCapabilities: [CAPABILITIES.EVIDENCE_SUBMIT], requireWorkspace: true }
);
