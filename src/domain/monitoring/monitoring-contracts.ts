/**
 * MONITORING BACKBONE - Domain Contracts
 *
 * PRIORITY 4: Monitoring infrastructure that does NOT depend on external services
 * (Sentry, DataDog, CloudWatch, etc). All metrics collected and stored locally.
 *
 * Provides:
 * - Health checks (startup, liveness, readiness)
 * - Metrics collection (response time, error rate, queue depth)
 * - Alert rule engine (local evaluation, no external integrations)
 * - Structured telemetry (trace IDs, span context)
 */

/**
 * Health Status: What the `/health` endpoint reports
 */
export enum HealthStatus {
  HEALTHY = "healthy",
  DEGRADED = "degraded",
  UNHEALTHY = "unhealthy",
}

/**
 * Health Check Probe Types
 */
export enum HealthProbeType {
  STARTUP = "startup", // Did application initialize successfully?
  LIVENESS = "liveness", // Is application running and responding?
  READINESS = "readiness", // Is application ready to accept traffic?
}

/**
 * Health Check Result
 */
export interface HealthCheckResult {
  type: HealthProbeType;
  status: HealthStatus;
  timestamp: Date;
  checks: {
    name: string; // e.g., "database", "queue", "cache"
    status: HealthStatus;
    latency_ms: number;
    error?: string;
  }[];
  metadata: {
    uptime_ms: number;
    version: string;
    environment: string;
  };
}

/**
 * Metrics: Quantitative measurements of system behavior
 */
export interface MetricPoint {
  name: string; // e.g., "http_request_duration_seconds"
  value: number;
  unit: string; // "ms", "count", "percent", "bytes"
  timestamp: Date;
  labels: Record<string, string>; // e.g., { method: "GET", endpoint: "/api/health" }
}

/**
 * Metrics Registry: Local collection of all metrics
 */
export interface MetricsRegistry {
  record(metric: MetricPoint): void;
  query(name: string, startTime: Date, endTime: Date): MetricPoint[];
  aggregate(
    name: string,
    startTime: Date,
    endTime: Date
  ): {
    count: number;
    min: number;
    max: number;
    avg: number;
    p50: number;
    p95: number;
    p99: number;
  };
  flush(): Promise<void>; // Persist to database
}

/**
 * Structured Telemetry: Trace context for distributed tracing
 */
export interface TracingContext {
  trace_id: string; // Unique request ID
  span_id: string; // Current operation ID
  parent_span_id?: string;
  workspace_id?: string; // Multi-tenant context
  user_id?: string;
  started_at: Date;
  attributes: Record<string, string | number | boolean>;
}

/**
 * Alert Rule: Evaluate metric thresholds locally
 */
export interface AlertRule {
  id: string;
  name: string; // e.g., "High Error Rate"
  metric_name: string; // e.g., "http_requests_total{status=500}"
  condition: {
    type: "gt" | "lt" | "eq"; // Greater than, less than, equals
    threshold: number;
    for_duration_seconds: number; // Alert only if condition true for N seconds
  };
  severity: "critical" | "warning" | "info";
  actions: {
    log?: boolean; // Log to application logs
    emit_event?: boolean; // Emit to local event bus
    // Note: no external service calls (Sentry/DataDog/etc)
  };
}

/**
 * Readiness Probe: Can the application accept traffic?
 */
export interface ReadinessCheck {
  database_healthy: boolean;
  database_latency_ms: number;
  queue_healthy: boolean;
  queue_depth: number;
  cache_healthy: boolean;
  external_services: {
    name: string; // e.g., "stripe", "hubspot"
    reachable: boolean; // Last connectivity check result (cached)
    last_check: Date;
  }[];
  is_ready: boolean; // Overall readiness (all critical checks healthy)
}

/**
 * Liveness Probe: Is the application still running?
 */
export interface LivenessCheck {
  http_responding: boolean;
  memory_usage_percent: number;
  memory_ok: boolean; // < 90%
  cpu_usage_percent: number;
  cpu_ok: boolean; // < 80%
  uptime_minutes: number;
  is_alive: boolean; // Overall liveness (HTTP responding + not resource exhausted)
}

/**
 * Startup Probe: Did the application initialize successfully?
 */
export interface StartupCheck {
  config_loaded: boolean;
  database_migrated: boolean;
  routes_registered: number;
  test_request_successful: boolean;
  is_ready: boolean; // Overall startup readiness
}

/**
 * Monitoring Event: Emitted to local event bus (no external service)
 */
export interface MonitoringEvent {
  type:
    | "health_status_change"
    | "alert_triggered"
    | "metric_recorded"
    | "error_rate_spike";
  severity: "critical" | "warning" | "info";
  timestamp: Date;
  message: string;
  context: {
    workspace_id?: string;
    trace_id?: string;
    metric_name?: string;
    threshold?: number;
    current_value?: number;
  };
}

/**
 * Alert Engine: Local evaluation of alert rules
 */
export interface AlertEngine {
  registerRule(rule: AlertRule): void;
  evaluate(metric: MetricPoint): AlertRule[]; // Returns triggered rules
  getActiveAlerts(): {
    rule: AlertRule;
    triggered_at: Date;
    current_value: number;
  }[];
}

/**
 * Operational Assertions: Fail-closed monitoring checks
 */
export const MONITORING_ASSERTIONS = {
  // Database connectivity check
  DATABASE_HEALTHY: {
    check: async (dbInstance: any) => {
      const start = Date.now();
      try {
        await dbInstance.$queryRawUnsafe("SELECT 1");
        return { healthy: true, latency_ms: Date.now() - start };
      } catch (e) {
        return { healthy: false, latency_ms: Date.now() - start, error: String(e) };
      }
    },
  },

  // Queue depth check (webhook jobs pending)
  QUEUE_HEALTHY: {
    check: async (dbInstance: any) => {
      try {
        const result = await dbInstance.$queryRawUnsafe(
          "SELECT COUNT(*) as count FROM webhookEvent WHERE status='pending' OR status='retrying'"
        );
        const depth = result[0]?.count || 0;
        return {
          healthy: depth < 10000, // Alert if > 10k pending
          depth,
        };
      } catch (e) {
        return { healthy: false, depth: 0, error: String(e) };
      }
    },
  },

  // Memory exhaustion check
  MEMORY_OK: {
    check: async () => {
      const mem = process.memoryUsage();
      const heapPercent = (mem.heapUsed / mem.heapTotal) * 100;
      return {
        healthy: heapPercent < 90,
        percent: heapPercent,
      };
    },
  },

  // CPU saturation check
  CPU_OK: {
    check: async () => {
      const cpus = require("os").cpus();
      let totalIdle = 0;
      let totalTick = 0;
      cpus.forEach((cpu: any) => {
        for (const type in cpu.times) {
          totalTick += cpu.times[type];
        }
        totalIdle += cpu.times.idle;
      });
      const idlePercent = totalIdle / totalTick;
      const cpuPercent = (1 - idlePercent) * 100;
      return {
        healthy: cpuPercent < 80,
        percent: cpuPercent,
      };
    },
  },
};
