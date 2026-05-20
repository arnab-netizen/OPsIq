import { emitAuditEvent } from '@/infra/audit';
import { AUDIT_EVENTS } from '@/domain/constants/audit-events';
import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { createFinding } from "@/services/findings";
import { hasInternalAccess } from "@/policies/capability-check";
import { parseRequestBody } from "@/lib/validation";
import { checkIdempotencyKey, recordIdempotencyResponse, recordIdempotencyError } from "@/services/idempotency";
import { z } from "zod/v4";
import {
  FINDING_STATUSES,
  FINDING_SEVERITIES,
  FINDING_IMPACTS,
} from "@/domain/constants/statuses";
import { assertCapability } from "@/services/entitlement.service";
import { PlanLimitError } from "@/infra/errors";

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

    // Check capability: generate_recommendation (plan-based quota enforcement)
    const capabilityCheck = await assertCapability(workspaceId, "generate_recommendation");
    if (!capabilityCheck.allowed) {
      throw new PlanLimitError("generate_recommendation", capabilityCheck.reason || "Plan limit exceeded");
    }

    const body = await parseRequestBody(ctx.request!, createFindingSchema);

    // Check idempotency
    const idempotencyCheck = await checkIdempotencyKey({
      idempotencyKey,
      operationName: "createFinding",
      actorId: ctx.verifiedSessionSnapshot.actorId,
      payload: body,
    });

    if (!idempotencyCheck.isNew && idempotencyCheck.cachedResponse) {
      return Response.json(idempotencyCheck.cachedResponse.body, {
        status: idempotencyCheck.cachedResponse.status,
      });
    }

    try {
      const authEnvelope = {
        verifiedActorId: ctx.verifiedSessionSnapshot.actorId,
        verifiedActorType: 'user' as const,
        verifiedWorkspaceId: ctx.verifiedWorkspaceId,
        verifiedCapabilities: new Set(ctx.verifiedSessionSnapshot.capabilities),
        hasInternalAccess: ctx.policy ? hasInternalAccess(ctx.policy) : false,
        verifiedActor: {
          id: ctx.verifiedSessionSnapshot.actorId,
          email: '',
          name: '',
          isActive: true,
        },
      };
      const result = await createFinding(body, authEnvelope);
      await recordIdempotencyResponse(idempotencyKey, 201, result, auditContext, workspaceId);
      return Response.json(result, { status: 201 });
    } catch (error) {
      const err = error instanceof Error ? error : new Error("Unknown error");
      await recordIdempotencyError(idempotencyKey, err, auditContext, workspaceId);
      throw error;
    }
  }, auditContext, { requireWorkspace: true, requireCapabilities: ['FINDING_CREATE'] }
);
