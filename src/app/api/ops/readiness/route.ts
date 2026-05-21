/**
 * GET /api/ops/readiness
 * Readiness state history and current status
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { classifyOperatorError } from "@/lib/operator-error-governance";

export async function GET(request: NextRequest) {
  try {
    // Get current readiness status
    const startupStatus = await db.startup_status.findFirst({
      orderBy: { updated_at: "desc" },
    });

    const currentStatus = startupStatus?.status || "UNKNOWN";
    const lastUpdate = startupStatus?.updated_at || new Date();

    // Get audit events related to readiness transitions
    const readinessAuditEvents = await db.audit_events.findMany({
      where: {
        event_name: {
          in: [
            "readiness_check_started",
            "readiness_check_passed",
            "readiness_check_failed",
            "system_ready",
            "system_failing",
          ],
        },
      },
      orderBy: { occurred_at: "desc" },
      take: 20,
    });

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      current: {
        status: currentStatus,
        last_updated: lastUpdate.toISOString(),
        duration_ms:
          currentStatus === "READY"
            ? Date.now() - lastUpdate.getTime()
            : undefined,
      },
      history: readinessAuditEvents.map((event: any) => ({
        event_name: event.event_name,
        occurred_at: event.occurred_at.toISOString(),
        payload: event.payload,
      })),
      protected_routes_operational:
        currentStatus === "READY" ? true : false,
      system_health:
        currentStatus === "READY"
          ? "HEALTHY"
          : currentStatus === "FAILED"
            ? "UNHEALTHY"
            : "UNKNOWN",
    });
  } catch (error) {
    const governed = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: 'load' });
    return NextResponse.json(
      {
        error: "Failed to get readiness status",
        details: governed.operatorMessage,
      },
      { status: 500 }
    );
  }
}
