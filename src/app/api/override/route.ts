import { NextRequest, NextResponse } from "next/server";
import { addOverride } from "@/services/override/store";
import { getItems, applyOverride } from "@/services/operator/store";
import { resolveServerRole } from "@/services/auth/server-role";
import { canEdit } from "@/services/auth/access";
import { randomUUID } from "crypto";

export async function POST(request: NextRequest) {
  try {
    // Enforce server-side auth
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

    const body = await request.json();
    const { operatorItemId, overriddenAction, reason } = body;

    // Validate required fields
    if (!operatorItemId || !overriddenAction || !reason) {
      return NextResponse.json(
        {
          error:
            "Missing required fields: operatorItemId, overriddenAction, reason",
        },
        { status: 400 }
      );
    }

    // Fetch operator item to get original action
    const items = await getItems();
    const item = items.find((i) => i.id === operatorItemId);

    if (!item) {
      return NextResponse.json(
        { error: "Operator item not found" },
        { status: 400 }
      );
    }

    // Create and store override record
    const overrideRecord = {
      id: randomUUID(),
      operatorItemId,
      originalAction: item.action,
      overriddenAction,
      reason,
      createdAt: new Date().toISOString(),
    };

    addOverride(overrideRecord);
    await applyOverride(operatorItemId, overriddenAction);

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
