import { NextResponse } from "next/server";
import { getItems } from "@/services/operator/store";
import { calculateValue } from "@/services/value/tracker";
import { resolveServerRole } from "@/services/auth/server-role";
import { canView } from "@/services/auth/access";
import { getSession } from "@/services/auth";
import { logAuditEvent } from "@/services/audit/audit-log";

export async function GET() {
  try {
    // Resolve role from server-side session/database (never from request)
    const role = await resolveServerRole();

    if (!role) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    if (!canView(role)) {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 }
      );
    }

    // Get actor ID from session
    const session = await getSession();
    const actorId = session?.user.id ?? null;

    // Fetch all items
    const items = await getItems();

    // Compute value metrics
    const metrics = calculateValue(items);

    // Log audit event for viewing value metrics
    await logAuditEvent({
      eventName: "VALUE_VIEWED",
      entityType: "Value",
      entityId: "system",
      actorId,
      role,
      before: null,
      after: null,
      metadata: {
        totalExpected: metrics.totalExpected,
        totalActual: metrics.totalActual,
        totalDelta: metrics.totalDelta,
        roi: metrics.roi,
        lossFromWrongDecisions: metrics.lossFromWrongDecisions,
        itemsAnalyzed: metrics.itemsAnalyzed,
      },
    });

    return NextResponse.json(metrics);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
