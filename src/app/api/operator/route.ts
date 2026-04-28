import { NextResponse, NextRequest } from "next/server";
import {
  getItems,
  updateItem,
  addCalibrationRecord,
} from "@/services/operator/store";
import { sortByPriority } from "@/services/operator/sort";
import { evaluatePolicy } from "@/services/policy/engine";
import type { PolicyRule } from "@/domain/policy/types";

export async function GET() {
  try {
    const items = getItems();
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

      const items = getItems();
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

    updateItem(id, { status, actualOutcome });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
