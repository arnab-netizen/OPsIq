/**
 * GET /api/ops/runtime
 * Real-time operational runtime metrics
 */

import { NextRequest, NextResponse } from "next/server";
import { getMetrics, getActiveRequests } from "@/infra/structured-logger";
import {
  getActiveTraces,
  getTraceHistory,
  getTracesWithError,
  getSlowRequests,
} from "@/infra/request-tracer";
import { classifyOperatorError } from "@/lib/operator-error-governance";

export async function GET(request: NextRequest) {
  try {
    const metrics = getMetrics();
    const activeTraces = getActiveTraces();
    const recentErrors = getTracesWithError();
    const slowRequests = getSlowRequests(1000);

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      runtime: {
        active_requests: getActiveRequests(),
        active_traces: activeTraces.length,
        memory_usage: {
          heapUsed: process.memoryUsage().heapUsed,
          heapTotal: process.memoryUsage().heapTotal,
          external: process.memoryUsage().external,
          rss: process.memoryUsage().rss,
        },
        event_loop_lag: 0, // Would be measured separately
      },
      performance: {
        avg_request_latency_ms: metrics.avg_request_latency,
        p95_request_latency_ms: metrics.p95_request_latency,
        avg_db_latency_ms: metrics.avg_db_latency,
        p95_db_latency_ms: metrics.p95_db_latency,
      },
      errors: {
        total_count: metrics.total_errors,
        recent: metrics.recent_errors.map((e) => ({
          correlation_id: e.correlation_id,
          request_id: e.request_id,
          error_classification: e.error_classification,
          timestamp: e.timestamp,
        })),
      },
      idempotency: {
        collision_count: metrics.idempotency_collisions.length,
        collisions: metrics.idempotency_collisions.slice(0, 10),
      },
      slow_requests: slowRequests.slice(0, 5).map((t) => ({
        correlation_id: t.correlation_id,
        duration_ms: t.duration_ms,
        route: t.route,
        method: t.method,
      })),
      active_traces: activeTraces.slice(0, 10).map((t) => ({
        correlation_id: t.correlation_id,
        request_id: t.request_id,
        route: t.route,
        method: t.method,
        duration_ms: t.duration_ms || Date.now() - t.start_time,
        span_count: t.spans.length,
      })),
    });
  } catch (error) {
    const governed = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: 'load' });
    return NextResponse.json(
      {
        error: "Failed to get runtime metrics",
        details: governed.operatorMessage,
      },
      { status: 500 }
    );
  }
}
