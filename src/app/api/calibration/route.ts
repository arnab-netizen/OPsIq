import { NextResponse } from "next/server";
import { getItems } from "@/services/operator/store";
import { computeCalibration } from "@/services/calibration/engine";
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

    // Compute calibration metrics
    const metrics = computeCalibration(items);

    // Log audit event for viewing calibration
    await logAuditEvent({
      eventName: "CALIBRATION_VIEWED",
      entityType: "Calibration",
      entityId: "system",
      actorId,
      role,
      before: null,
      after: null,
      metadata: {
        itemsAnalyzed: metrics.itemsAnalyzed,
        successRate: metrics.successRate,
        avgAccuracy: metrics.avgAccuracy,
        avgError: metrics.avgError,
        weightedAccuracy: metrics.weightedAccuracy,
      },
    });

    return NextResponse.json(metrics);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
