/**
 * GET /api/ops/errors
 * Recent error history with classification
 *
 * SECURITY: Requires OPSIQ_DIAGNOSTIC_KEY
 * This endpoint exposes internal operation metrics and should only be accessible
 * to operators with the diagnostic key.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getTracesWithError,
  getIdempotencyCollisions,
  getSlowRequests,
} from "@/infra/request-tracer";
import { classifyOperatorError } from "@/lib/operator-error-governance";
import { verifyDiagnosticKeyFromRequest } from "@/lib/security/diagnostic-key";

export async function GET(request: NextRequest) {
  // Require diagnostic key for operational metrics access
  if (!verifyDiagnosticKeyFromRequest(request)) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 404 }
    );
  }
  try {
    const searchParams = request.nextUrl.searchParams;
    const classification = searchParams.get("classification");
    const limit = parseInt(searchParams.get("limit") || "50");

    let errorTraces = getTracesWithError(classification || undefined);

    // Apply limit
    errorTraces = errorTraces.slice(-limit);

    const collisions = getIdempotencyCollisions();
    const slowRequests = getSlowRequests(1000);

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      errors: {
        count: errorTraces.length,
        by_classification: errorTraces.reduce(
          (acc, t) => {
            const classification = t.error_classification || "UNKNOWN";
            acc[classification] = (acc[classification] || 0) + 1;
            return acc;
          },
          {} as Record<string, number>
        ),
        recent: errorTraces.map((t) => ({
          correlation_id: t.correlation_id,
          request_id: t.request_id,
          route: t.route,
          method: t.method,
          duration_ms: t.duration_ms,
          classification: t.error_classification || "UNKNOWN",
          spans_with_errors: t.spans
            .filter((s) => s.status === "FAILED")
            .map((s) => ({
              operation: s.operation,
              error: s.error,
              duration_ms: s.duration_ms,
            })),
          timestamp: new Date(t.start_time).toISOString(),
        })),
      },
      idempotency_issues: {
        collision_count: collisions.length,
        recent_collisions: collisions.slice(-10).map((t) => ({
          correlation_id: t.correlation_id,
          idempotency_key: t.spans.find((s) => s.tags.idempotency_key)?.tags
            .idempotency_key,
          timestamp: new Date(t.start_time).toISOString(),
        })),
      },
      slow_requests: {
        count: slowRequests.length,
        slow_traces: slowRequests.slice(-10).map((t) => ({
          correlation_id: t.correlation_id,
          route: t.route,
          method: t.method,
          duration_ms: t.duration_ms,
          timestamp: new Date(t.start_time).toISOString(),
        })),
      },
    });
  } catch (error) {
    const governed = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: 'load' });
    return NextResponse.json(
      {
        error: "Failed to get error history",
        details: governed.operatorMessage,
      },
      { status: 500 }
    );
  }
}
