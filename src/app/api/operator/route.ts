import { NextResponse, NextRequest } from "next/server";
import {
  getItems,
  updateItem,
  addCalibrationRecord,
} from "@/services/operator/store";
import { sortByPriority } from "@/services/operator/sort";
import { evaluatePolicy } from "@/services/policy/engine";
import { canEdit } from "@/services/auth/access";
import { sendWebhook } from "@/services/integration/webhook";
import type { PolicyRule } from "@/domain/policy/types";
import type { UserRole } from "@/domain/auth/types";

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
    const { id, status, actualOutcome, role } = body;

    if (!role) {
      return NextResponse.json(
        { error: "Missing required field: role" },
        { status: 400 }
      );
    }

    if (!canEdit(role as UserRole)) {
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

    if (status === "done") {
      const updatedItems = await getItems();
      const completedItem = updatedItems.find((i) => i.id === id);
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
