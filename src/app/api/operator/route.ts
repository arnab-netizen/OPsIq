import { UnauthorizedError } from "@/infra/errors";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import {
  getItems,
  updateItem,
  addCalibrationRecord,
} from "@/services/operator/store";
import { sortByPriority } from "@/services/operator/sort";
import { calculateOutcomeDelta } from "@/services/operator/outcome";
import { calculateDecisionAccuracy } from "@/services/operator/accuracy";
import { evaluatePolicy, validateCompletion } from "@/services/policy/engine";
import { canEdit } from "@/services/auth/access";
import { resolveServerRole } from "@/services/auth/server-role";
import { sendWebhook } from "@/services/integration/webhook";
import { logAuditEvent } from "@/services/audit/audit-log";
import { validateStatusTransition, getStatusTransitionError } from "@/services/operator/validate";
import { createEventLogger } from "@/lib/observability/log";
import { emitWebhookAsync } from "@/lib/integrations/webhook";
import { checkIdempotencyKey, recordIdempotencyResponse, recordIdempotencyError } from "@/services/idempotency";
import { assertCapability } from "@/services/entitlement.service";
import { PlanLimitError } from "@/infra/errors";
import { captureOutcomeVerificationMetadata } from "@/services/outcome/verification";

export const GET = withCanonicalEnforcement(async (ctx: CanonicalAuthContext) => {
  const workspaceId = ctx.verifiedWorkspaceId;
  const logger = createEventLogger("api_operator_get", workspaceId);

  const items = await getItems();
  const sorted = sortByPriority(items);

  logger.success({ itemCount: sorted.length });
  return sorted;
});

export const POST = withCanonicalEnforcement(async (ctx: CanonicalAuthContext) => {
  if (!ctx.request) {
    throw new Error("Request object not available");
  }

  let logger: ReturnType<typeof createEventLogger> | null = null;
  let workspaceId: string | null = null;
  let id: string | null = null;
  let idempotencyKey: string | null = null;

  // Check idempotency key (required)
  idempotencyKey = ctx.request.headers.get("idempotency-key");
  if (!idempotencyKey) {
    throw new Error("idempotency-key header required");
  }

  const body = await ctx.request.json();
  id = body.id;
  const { status, actualOutcome, approvalRequired } = body;

  // Resolve role from server-side session/database (never from request body)
  const role = await resolveServerRole();

  if (!role) {
    throw new UnauthorizedError("Unauthorized");
  }

  if (!canEdit(role)) {
    throw new Error("Insufficient permissions");
  }

  if (!id) {
    throw new Error("Missing required field: id");
  }

  // Get actor ID from verified context
  const actorId = ctx.verifiedActorId;

  // Check idempotency (need workspace context first)
  // Will be set after we get workspace from item

  // Capture before state for audit
  const allItemsBefore = await getItems();
  const beforeItem = allItemsBefore.find((i) => i.id === id);

  // Initialize logger with workspace context from item
  if (beforeItem && beforeItem.workspaceId) {
    workspaceId = beforeItem.workspaceId;
    logger = createEventLogger("api_operator_post", workspaceId);

    // Check capability: decision_engine
    const capabilityCheck = await assertCapability(workspaceId, "decision_engine");
    if (!capabilityCheck.allowed) {
      throw new PlanLimitError("decision_engine", capabilityCheck.reason || "Plan limit exceeded");
    }

    // Check idempotency after we have workspace context
    const idempotencyCheck = await checkIdempotencyKey({
      idempotencyKey,
      operationName: "updateOperatorItem",
      actorId: actorId || "unknown",
      payload: body,
    });

    if (!idempotencyCheck.isNew && idempotencyCheck.cachedResponse) {
      return idempotencyCheck.cachedResponse.body;
    }
  }

  // Validate status transition
  if (beforeItem && status) {
    const currentStatus = beforeItem.status as "pending" | "in_progress" | "done" | "failed";
    const newStatus = status as "pending" | "in_progress" | "done" | "failed";
    const transitionError = getStatusTransitionError(currentStatus, newStatus);
    if (transitionError) {
      throw new Error(transitionError);
    }
  }

  // Validate completion policy when task is completed
  if (status === "done") {
    const items = await getItems();
    const item = items.find((i) => i.id === id);

    if (item) {
      // Validate completion policy
      const completionPolicy = validateCompletion(item, approvalRequired);
      if (!completionPolicy.allowed) {
        throw new Error(completionPolicy.reason);
      }

      if (typeof actualOutcome !== "number") {
        throw new Error("Missing or invalid field: actualOutcome must be a number");
      }

      addCalibrationRecord(
        id,
        item.impactExpected,
        actualOutcome,
        item.confidence
      );
    }
  }

  const updatePayload: any = {
    status,
  };

  if (status === 'done') {
    updatePayload.actualOutcomeValue = actualOutcome;
    updatePayload.completedAt = new Date().toISOString();
    updatePayload.executionStatus = 'completed';
    updatePayload.completedBy = actorId;

    // Capture outcome verification metadata
    const verificationMetadata = captureOutcomeVerificationMetadata(
      actualOutcome,
      beforeItem?.impactExpected ?? 0,
      beforeItem?.actualOutcomeValue ?? null,
      actorId || "unknown"
    );
    updatePayload.verificationStatus = verificationMetadata.verificationStatus;
    updatePayload.verificationMethod = verificationMetadata.verificationMethod;
    updatePayload.verificationConfidence = verificationMetadata.verificationConfidence;
    updatePayload.verificationEvidence = verificationMetadata.verificationEvidence;
    updatePayload.auditTrail = verificationMetadata.auditTrail;

    // Calculate outcome delta
    const expectedImpact = beforeItem?.impactExpected ?? null;
    const deltaResult = calculateOutcomeDelta(expectedImpact, actualOutcome);
    if (deltaResult.valid && deltaResult.delta !== null) {
      updatePayload.outcomeDelta = deltaResult.delta;
    }

    // Calculate decision accuracy metrics
    const accuracyResult = calculateDecisionAccuracy(expectedImpact, actualOutcome);
    if (accuracyResult.valid) {
      if (accuracyResult.accuracy !== null) {
        updatePayload.decisionAccuracy = accuracyResult.accuracy;
      }
      if (accuracyResult.error !== null) {
        updatePayload.decisionError = accuracyResult.error;
      }
    }
  } else if (status === 'in_progress') {
    updatePayload.startedAt = new Date().toISOString();
    updatePayload.executionStatus = 'started';
  }

  await updateItem(id, updatePayload, workspaceId || undefined);

  // Capture after state and log audit event
  const allItemsAfter = await getItems();
  const afterItem = allItemsAfter.find((i) => i.id === id);

  // Determine event name
  const eventName = status === "done" ? "COMPLETE" : "UPDATE";

  // Log audit event (fail-closed if audit fails)
  await logAuditEvent({
    eventName,
    entityType: "OperatorItem",
    entityId: id,
    actorId,
    role,
    before: beforeItem ?? null,
    after: afterItem ?? null,
  }).catch((auditError) => {
    if (logger) logger.error(`Audit failed: ${auditError}`);
  });

  if (status === "done") {
    const completedItem = afterItem;
    if (completedItem) {
      sendWebhook({
        event: "action_completed",
        payload: completedItem,
      });

      // Emit structured webhook for completion (non-blocking)
      emitWebhookAsync(`${process.env.WEBHOOK_URL || ""}`, {
        event: "action_completed",
        timestamp: new Date().toISOString(),
        workspaceId: completedItem.workspaceId,
        data: {
          itemId: completedItem.id,
          problem: completedItem.problem,
          action: completedItem.action,
          expectedImpact: Number(completedItem.impactExpected),
          actualOutcome: completedItem.actualOutcomeValue,
          outcomeDelta: completedItem.outcomeDelta,
          decisionAccuracy: completedItem.decisionAccuracy,
        },
      }).catch(() => {
        // Intentionally swallow errors - webhook failures should not block the request
      });
    }
  }

  if (logger) {
    logger.success({ itemId: id, newStatus: status });
  }
  const result = { success: true };
  if (workspaceId && idempotencyKey) {
    await recordIdempotencyResponse(idempotencyKey, 200, result);
  }
  return result;
});
