import { NextResponse, NextRequest } from "next/server";
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
import { getSession } from "@/services/auth";
import { sendWebhook } from "@/services/integration/webhook";
import { logAuditEvent } from "@/services/audit/audit-log";
import { validateStatusTransition, getStatusTransitionError } from "@/services/operator/validate";
import { createEventLogger } from "@/lib/observability/log";
import { requireWorkspaceContext } from "@/services/workspace/context";
import { emitWebhookAsync } from "@/lib/integrations/webhook";
import type { PolicyRule } from "@/domain/policy/types";

export async function GET() {
  let logger: ReturnType<typeof createEventLogger> | null = null;

  try {
    const workspace = await requireWorkspaceContext();
    logger = createEventLogger("api_operator_get", workspace.workspaceId);

    const items = await getItems();
    const sorted = sortByPriority(items);

    if (logger) {
      logger.success({ itemCount: sorted.length });
    }
    return NextResponse.json(sorted);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (logger) {
      logger.error(message);
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  let logger: ReturnType<typeof createEventLogger> | null = null;
  let workspaceId: string | null = null;
  let id: string | null = null;

  try {
    const body = await request.json();
    id = body.id;
    const { status, actualOutcome, approvalRequired } = body;

    // Resolve role from server-side session/database (never from request body)
    const role = await resolveServerRole();

    if (!role) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    if (!canEdit(role)) {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 }
      );
    }

    if (!id) {
      return NextResponse.json(
        { error: "Missing required field: id" },
        { status: 400 }
      );
    }

    // Get actor ID from session
    const session = await getSession();
    const actorId = session?.user.id ?? null;

    // Capture before state for audit
    const allItemsBefore = await getItems();
    const beforeItem = allItemsBefore.find((i) => i.id === id);

    // Initialize logger with workspace context from item
    if (beforeItem && beforeItem.workspaceId) {
      workspaceId = beforeItem.workspaceId;
      logger = createEventLogger("api_operator_post", workspaceId);
    }

    // Validate status transition
    if (beforeItem && status) {
      const currentStatus = beforeItem.status as "pending" | "in_progress" | "done" | "failed";
      const newStatus = status as "pending" | "in_progress" | "done" | "failed";
      const transitionError = getStatusTransitionError(currentStatus, newStatus);
      if (transitionError) {
        return NextResponse.json(
          { error: transitionError },
          { status: 400 }
        );
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
          return NextResponse.json(
            { error: completionPolicy.reason },
            { status: 400 }
          );
        }

        if (typeof actualOutcome !== "number") {
          return NextResponse.json(
            { error: "Missing or invalid field: actualOutcome must be a number" },
            { status: 400 }
          );
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
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (logger) {
      logger.error(message, { itemId: id });
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
