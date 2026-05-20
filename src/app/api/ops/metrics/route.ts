/**
 * GET /api/ops/metrics
 * Real-time operational metrics in Prometheus-compatible format
 */

import { NextRequest, NextResponse } from "next/server";
import { getMetrics, getActiveRequests } from "@/infra/structured-logger";
import { getTraceHistory, getTracesWithError } from "@/infra/request-tracer";

export async function GET(request: NextRequest) {
  try {
    const metrics = getMetrics();
    const traceHistory = getTraceHistory(100);
    const errorTraces = getTracesWithError();

    // Calculate success rate
    const successCount = traceHistory.filter(
      (t) => t.final_status === "SUCCESS"
    ).length;
    const totalCount = traceHistory.length;
    const successRate =
      totalCount > 0 ? ((successCount / totalCount) * 100).toFixed(2) : "0";

    // Calculate error rate by classification
    const errorsByClassification: Record<string, number> = {};
    errorTraces.forEach((t) => {
      const classification = t.error_classification || "UNKNOWN";
      errorsByClassification[classification] =
        (errorsByClassification[classification] || 0) + 1;
    });

    // Memory metrics
    const memUsage = process.memoryUsage();
    const heapUsagePercent = (
      (memUsage.heapUsed / memUsage.heapTotal) *
      100
    ).toFixed(2);

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      counters: {
        http_requests_total: traceHistory.length,
        http_request_errors_total: errorTraces.length,
        http_request_success_rate_percent: parseFloat(successRate),
        active_requests: getActiveRequests(),
        idempotency_collisions_total:
          metrics.idempotency_collisions.length,
      },
      gauges: {
        memory_heap_used_bytes: memUsage.heapUsed,
        memory_heap_total_bytes: memUsage.heapTotal,
        memory_heap_usage_percent: parseFloat(heapUsagePercent),
        memory_external_bytes: memUsage.external,
        memory_rss_bytes: memUsage.rss,
      },
      latencies: {
        request_latency_ms: {
          avg: metrics.avg_request_latency,
          p95: metrics.p95_request_latency,
        },
        db_latency_ms: {
          avg: metrics.avg_db_latency,
          p95: metrics.p95_db_latency,
        },
      },
      errors_by_classification: errorsByClassification,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to get metrics",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
