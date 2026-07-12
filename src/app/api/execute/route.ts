import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { ForbiddenError, PlanLimitError, ValidationError } from "@/infra/errors";
import { hasInternalAccess } from "@/policies/capability-check";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { executeWorkflow } from "@/services/execute";
import { parseRequestBody } from "@/lib/validation";
import { checkIdempotencyKey, recordIdempotencyResponse, recordIdempotencyError } from "@/services/idempotency";
import { z } from "zod/v4";
import { assertCapability } from "@/services/entitlement.service";

const executeSchema = z.object({
  clientName: z.string().min(1, "Client name is required"),
  problem: z.string().min(1, "Problem statement is required"),
  findings: z.array(z.string().min(1)).min(1, "At least one finding is required"),
  priority: z.enum(["low", "medium", "high", "critical"]),
});

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    if (!ctx.policy || !hasInternalAccess(ctx.policy)) {
      throw new ForbiddenError("Internal access required");
    }

    const workspaceId = ctx.verifiedWorkspaceId;

    const capabilityCheck = await assertCapability(workspaceId, "decision_engine");
    if (!capabilityCheck.allowed) {
      throw new PlanLimitError("decision_engine", capabilityCheck.reason || "Plan limit exceeded");
    }

    const idempotencyKey = ctx.request?.headers.get("idempotency-key");
    if (!idempotencyKey) {
      throw new ValidationError("idempotency-key header required");
    }

    const body = await parseRequestBody(ctx.request!, executeSchema);

    const idempotencyCheck = await checkIdempotencyKey({
      idempotencyKey,
      operationName: "executeWorkflow",
      actorId: ctx.verifiedActorId,
      payload: body,
    });

    if (!idempotencyCheck.isNew && idempotencyCheck.cachedResponse) {
      return idempotencyCheck.cachedResponse.body;
    }

    try {
      const result = await executeWorkflow(body, ctx, workspaceId);
      await recordIdempotencyResponse(idempotencyKey, 200, result as unknown as Record<string, unknown>);
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error("Unknown error");
      await recordIdempotencyError(idempotencyKey, err);
      throw error;
    }
  },
  {
    requireCapabilities: [CAPABILITIES.ENGAGEMENT_CREATE],
    requireWorkspace: true,
  }
);
