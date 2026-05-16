import { NextRequest, NextResponse } from "next/server";
import { MonitoringService } from "@/services/monitoring/monitoring.service";
import { db } from "@/lib/db";
import { logger } from "@/infra/logger";

let monitoringService: MonitoringService | null = null;

function getMonitoringService(): MonitoringService {
  if (!monitoringService) {
    monitoringService = new MonitoringService(db);
  }
  return monitoringService;
}

export type MonitoringContext = {
  recordMetric: (name: string, value: number, unit: string, labels?: Record<string, string>) => void;
  recordError: (errorType: string, message: string, workspaceId?: string, traceId?: string) => void;
};

export async function attachMonitoring(request: NextRequest): Promise<MonitoringContext> {
  const service = getMonitoringService();

  return {
    recordMetric: (name: string, value: number, unit: string, labels?: Record<string, string>) => {
      service.recordMetric({
        name,
        value,
        unit,
        timestamp: new Date(),
        labels: labels || {},
      });
    },
    recordError: (errorType: string, message: string, workspaceId?: string, traceId?: string) => {
      service.recordError(errorType, message, workspaceId, traceId);
    },
  };
}

export async function recordHttpRequest(
  endpoint: string,
  method: string,
  status: number,
  durationMs: number
): Promise<void> {
  const service = getMonitoringService();
  service.recordHttpRequest(endpoint, method, status, durationMs);
}

export function getMonitoringServiceInstance(): MonitoringService {
  return getMonitoringService();
}

export async function withMonitoringMiddleware(
  handler: (req: NextRequest, context: MonitoringContext) => Promise<Response>
) {
  return async (request: NextRequest) => {
    const startTime = Date.now();
    const endpoint = new URL(request.url).pathname;
    const method = request.method;

    try {
      const monitoringContext = await attachMonitoring(request);
      const response = await handler(request, monitoringContext);

      const durationMs = Date.now() - startTime;
      const status = response.status;

      // Record successful request
      await recordHttpRequest(endpoint, method, status, durationMs);

      return response;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const service = getMonitoringService();

      // Record error
      service.recordError(
        "unhandled_exception",
        error instanceof Error ? error.message : String(error)
      );

      // Record failed request with 500 status
      await recordHttpRequest(endpoint, method, 500, durationMs);

      logger.error("Unhandled exception in monitored endpoint", { error, endpoint, method });

      throw error;
    }
  };
}

export async function flushMetrics(): Promise<void> {
  const service = getMonitoringService();
  await service.flush();
}
