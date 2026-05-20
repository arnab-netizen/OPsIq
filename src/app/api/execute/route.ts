import { classifyOperatorError } from "@/lib/operator-error-governance";

function getSafeErrorMessage(error: unknown): string {
  const classified = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" });
  return classified.operatorMessage;
}

import { emitAuditEvent } from '@/infra/audit';
import { AUDIT_EVENTS } from '@/domain/constants/audit-events';
import { withEnforcementFull } from "@/lib/enforced-route";
import type { NextRequest } from "next/server";
import { withAuth, createServiceCapabilityContext, canonicalizeAuthContext } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { executeWorkflow } from "@/services/execute";
import { parseRequestBody } from "@/lib/validation";
import { checkIdempotencyKey, recordIdempotencyResponse, recordIdempotencyError } from "@/services/idempotency";
import { z } from "zod/v4";
import { assertCapability } from "@/services/entitlement.service";
import { PlanLimitError } from "@/infra/errors";
import { UnauthorizedError, ForbiddenError } from "@/infra/errors";

const executeSchema = z.object({
  clientName: z.string().min(1, "Client name is required"),
  problem: z.string().min(1, "Problem statement is required"),
  findings: z.array(z.string().min(1)).min(1, "At least one finding is required"),
  priority: z.enum(["low", "medium", "high", "critical"]),
});

export const POST = withEnforcementFull(async (request: NextRequest) => {
  const { session, policy } = await withAuth({
    capability: CAPABILITIES.ENGAGEMENT_CREATE,
    internalOnly: true,
  });

  const nextRequest = request as NextRequest;
  const workspaceId = nextRequest.headers.get("x-workspace-id") || "";
  if (!workspaceId) {
    throw new UnauthorizedError("Workspace ID required");
  }

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

  const auditContext = createServiceCapabilityContext({
    capability: CAPABILITIES.ENGAGEMENT_CREATE,
  });

  const body = await parseRequestBody(request, executeSchema);

  // Check idempotency
  const idempotencyCheck = await checkIdempotencyKey({
    idempotencyKey,
    operationName: "executeWorkflow",
    actorId: session.user.id,
    workspaceId,
    payload: body,
  });

  if (!idempotencyCheck.isNew && idempotencyCheck.cachedResponse) {
    return Response.json(idempotencyCheck.cachedResponse.body, {
      status: idempotencyCheck.cachedResponse.status,
    });
  }

  try {
    const result = await executeWorkflow(body, canonicalizeAuthContext({ session, policy }, workspaceId), workspaceId);
    await recordIdempotencyResponse(idempotencyKey, 200, result as unknown as Record<string, unknown>, auditContext, workspaceId);
    return Response.json(result, { status: 200 });
  } catch (error) {
    const err = error instanceof Error ? error : new Error("Unknown error");
    await recordIdempotencyError(idempotencyKey, err, auditContext, workspaceId);
    throw error;
  }
});
