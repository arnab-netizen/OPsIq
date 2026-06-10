/**
 * GET /api/ops/readiness
 * Readiness state history and current status
 *
 * SECURITY: Requires OPSIQ_DIAGNOSTIC_KEY
 * This endpoint exposes internal readiness state and should only be accessible
 * to operators with the diagnostic key.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { classifyOperatorError } from "@/lib/operator-error-governance";
import { verifyDiagnosticKeyFromRequest } from "@/lib/security/diagnostic-key";

export async function GET(request: NextRequest) {
  // Require diagnostic key for readiness status access
  if (!verifyDiagnosticKeyFromRequest(request)) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 404 }
    );
  }
  try {
    // Get current readiness status
    const startupStatus = await db.startupStatus.findFirst({
      orderBy: { updatedAt: "desc" },
    });

    const currentStatus = startupStatus?.status || "UNKNOWN";
    const lastUpdate = startupStatus?.updatedAt || new Date();

    // Get audit events related to readiness transitions
    const readinessAuditEvents = await db.auditEvent.findMany({
      where: {
        eventName: {
          in: [
            "readiness_check_started",
            "readiness_check_passed",
            "readiness_check_failed",
            "system_ready",
            "system_failing",
          ],
        },
      },
      orderBy: { occurredAt: "desc" },
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
        event_name: event.eventName,
        occurred_at: event.occurredAt.toISOString(),
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
