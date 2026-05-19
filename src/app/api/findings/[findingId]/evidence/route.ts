import { emitAuditEvent } from '@/infra/audit';
import { AUDIT_EVENTS } from '@/domain/constants/audit-events';
import { withCanonicalEnforcement, type CanonicalAuthContext, type ServiceAuthEnvelope } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { linkEvidenceToFinding, unlinkEvidenceFromFinding } from "@/services/findings";
import { hasInternalAccess } from "@/policies/capability-check";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { checkIdempotencyKey, recordIdempotencyResponse, recordIdempotencyError } from "@/services/idempotency";
import { z } from "zod/v4";

const linkEvidenceSchema = z.object({
  evidenceId: z.string().uuid(),
});

const unlinkEvidenceSchema = z.object({
  evidenceId: z.string().uuid(),
});

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const { findingId } = params;
    parseOrThrow(uuidSchema, findingId);

    const idempotencyKey = ctx.request?.headers.get("idempotency-key");
    if (!idempotencyKey) {
      return Response.json(
        { error: "idempotency-key header required" },
        { status: 400 }
      );
    }

    const body = await parseRequestBody(ctx.request!, linkEvidenceSchema);

    const idempotencyCheck = await checkIdempotencyKey({
      idempotencyKey,
      operationName: "linkEvidenceToFinding",
      actorId: ctx.verifiedActorId,
      payload: { findingId, evidenceId: body.evidenceId },
    });

    if (!idempotencyCheck.isNew && idempotencyCheck.cachedResponse) {
      return Response.json(idempotencyCheck.cachedResponse.body, {
        status: idempotencyCheck.cachedResponse.status,
      });
    }

    try {
      const authEnvelope: ServiceAuthEnvelope = {
        verifiedActorId: ctx.verifiedActorId,
        verifiedActorType: ctx.verifiedActorType,
        verifiedWorkspaceId: ctx.verifiedWorkspaceId,
        verifiedCapabilities: ctx.verifiedCapabilities,
        hasInternalAccess: ctx.policy ? hasInternalAccess(ctx.policy) : false,
        verifiedActor: ctx.verifiedActor,
      };
      const result = await linkEvidenceToFinding(findingId, body.evidenceId, authEnvelope);
      await recordIdempotencyResponse(idempotencyKey, 201, result);
      return Response.json(result, { status: 201 });
    } catch (error) {
      const err = error instanceof Error ? error : new Error("Unknown error");
      await recordIdempotencyError(idempotencyKey, err);
      throw error;
    }
  },
  {
    requireCapabilities: [CAPABILITIES.FINDING_UPDATE],
    requireWorkspace: true,
  }
);

export const DELETE = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const { findingId } = params;
    parseOrThrow(uuidSchema, findingId);

    const body = await parseRequestBody(ctx.request!, unlinkEvidenceSchema);
    const authEnvelope: ServiceAuthEnvelope = {
      verifiedActorId: ctx.verifiedActorId,
      verifiedActorType: ctx.verifiedActorType,
      verifiedWorkspaceId: ctx.verifiedWorkspaceId,
      verifiedCapabilities: ctx.verifiedCapabilities,
      hasInternalAccess: ctx.policy ? hasInternalAccess(ctx.policy) : false,
      verifiedActor: ctx.verifiedActor,
    };
    const result = await unlinkEvidenceFromFinding(findingId, body.evidenceId, authEnvelope);

    return Response.json(result, { status: 200 });
  },
  {
    requireCapabilities: [CAPABILITIES.FINDING_UPDATE],
    requireWorkspace: true,
  }
);
