import { NextResponse, NextRequest } from "next/server";
import {
  getItems,
  updateItem,
  addCalibrationRecord,
} from "@/services/operator/store";
import { sortByPriority } from "@/services/operator/sort";
import { evaluatePolicy } from "@/services/policy/engine";
import { canEdit } from "@/services/auth/access";
import { resolveServerRole } from "@/services/auth/server-role";
import { getSession } from "@/services/auth";
import { sendWebhook } from "@/services/integration/webhook";
import { logAuditEvent } from "@/services/audit/audit-log";
import type { PolicyRule } from "@/domain/policy/types";

export async function GET() {
  try {
    const items = await getItems();
    const sorted = sortByPriority(items);
    return NextResponse.json(sorted);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, status, actualOutcome } = body;

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

    // Capture calibration when task is completed
    if (status === "done") {
      if (typeof actualOutcome !== "number") {
        return NextResponse.json(
          { error: "Missing or invalid field: actualOutcome must be a number" },
          { status: 400 }
        );
      }

      const items = await getItems();
      const item = items.find((i) => i.id === id);

      if (item) {
        const rules: PolicyRule[] = [
          {
            id: "high-impact",
            condition: (impact: number) => impact > 100000,
            requiresApproval: true,
          },
        ];

        const policy = evaluatePolicy(item.impactExpected, rules);
        if (policy.requiresApproval) {
          return NextResponse.json(
            { error: "High-impact action requires approval before completion" },
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

    await updateItem(id, { status, actualOutcome });

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
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
