import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { executeWorkflow } from "@/services/execute";
import { parseRequestBody } from "@/lib/validation";
import { checkIdempotencyKey, recordIdempotencyResponse, recordIdempotencyError } from "@/services/idempotency";
import { z } from "zod/v4";
import { assertCapability } from "@/services/entitlement.service";
import { PlanLimitError } from "@/infra/errors";

const executeSchema = z.object({
  clientName: z.string().min(1, "Client name is required"),
  problem: z.string().min(1, "Problem statement is required"),
  findings: z.array(z.string().min(1)).min(1, "At least one finding is required"),
  priority: z.enum(["low", "medium", "high", "critical"]),
});

export const POST = withRequestContext(async (request) => {
  const authContext = await withAuth({
    capability: CAPABILITIES.ENGAGEMENT_CREATE,
    internalOnly: true,
  });

  const workspaceId = request.headers.get("x-workspace-id") || "";

  // Check capability: decision_engine
  const capabilityCheck = await assertCapability(workspaceId, "decision_engine");
  if (!capabilityCheck.allowed) {
    throw new PlanLimitError("decision_engine", capabilityCheck.reason || "Plan limit exceeded");
  }

  const idempotencyKey = request.headers.get("idempotency-key");
  if (!idempotencyKey) {
    return Response.json(
      { error: "idempotency-key header required" },
      { status: 400 }
    );
  }

  const body = await parseRequestBody(request, executeSchema);

  // Check idempotency
  const idempotencyCheck = await checkIdempotencyKey({
    idempotencyKey,
    operationName: "executeWorkflow",
    actorId: authContext.session.user.id,
    payload: body,
  });

  if (!idempotencyCheck.isNew && idempotencyCheck.cachedResponse) {
    return Response.json(idempotencyCheck.cachedResponse.body, {
      status: idempotencyCheck.cachedResponse.status,
    });
  }

  try {
    const result = await executeWorkflow(body, authContext, workspaceId);
    await recordIdempotencyResponse(idempotencyKey, 200, result as unknown as Record<string, unknown>);
    return Response.json(result, { status: 200 });
  } catch (error) {
    const err = error instanceof Error ? error : new Error("Unknown error");
    await recordIdempotencyError(idempotencyKey, err);
    throw error;
  }
});
