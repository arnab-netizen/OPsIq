/**
 * PHASE I-9: OBSERVABILITY DTOS + METRICS
 *
 * Operational visibility: request latency, queue latency, execution throughput,
 * failure rate, retry rate, blocked execution rate, overload frequency, recovery frequency.
 * NOT analytics theatre - only actionable metrics.
 */

export interface RequestMetrics {
  total_requests: number;
  latency_p50_ms: number;
  latency_p95_ms: number;
  latency_p99_ms: number;
  error_rate: number;
}

export interface QueueMetrics {
  total_jobs: number;
  queue_depth: number;
  throughput_jobs_per_sec: number;
  latency_p50_ms: number;
  latency_p95_ms: number;
  failure_rate: number;
  dead_letter_queue_size: number;
  average_retries: number;
}

export interface ExecutionMetrics {
  total_executions: number;
  completion_rate: number;
  blocked_execution_count: number;
  blocked_execution_rate: number;
  average_duration_ms: number;
  operator_overload_events: number;
  stale_recommendation_count: number;
  stale_recommendation_rate: number;
}

export interface DatabaseMetrics {
  total_operations: number;
  query_latency_p50_ms: number;
  query_latency_p95_ms: number;
  query_latency_p99_ms: number;
  connection_pool_utilization: number;
  retry_rate: number;
  error_rate: number;
}

export interface SystemMetrics {
  uptime_seconds: number;
  memory_usage_mb: number;
  memory_pressure: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  cpu_usage_percent: number;
  active_connections: number;
  gc_pause_ms: number;
}

export interface AggregatedMetrics {
  timestamp: Date;
  window_seconds: number;
  request: RequestMetrics;
  queue: QueueMetrics;
  execution: ExecutionMetrics;
  database: DatabaseMetrics;
  system: SystemMetrics;
  recovery_events: number;
  circuit_breaker_open_count: number;
  request_shedding_events: number;
}

class RuntimeMetricsCollector {
  private metrics: AggregatedMetrics[] = [];
  private request_latencies: number[] = [];
  private queue_latencies: number[] = [];
  private db_latencies: number[] = [];
  private requests_total: number = 0;
  private requests_error: number = 0;
  private jobs_total: number = 0;
  private jobs_failed: number = 0;
  private executions_total: number = 0;
  private executions_blocked: number = 0;
  private recoveries: number = 0;
  private circuit_breaker_opens: number = 0;
  private request_shedding_count: number = 0;
  private start_time: Date = new Date();

  recordRequestLatency(latency_ms: number): void {
    this.request_latencies.push(latency_ms);
    this.requests_total++;
  }

  recordRequestError(): void {
    this.requests_error++;
  }

  recordQueueLatency(latency_ms: number): void {
    this.queue_latencies.push(latency_ms);
    this.jobs_total++;
  }

  recordQueueFailure(): void {
    this.jobs_failed++;
  }

  recordDatabaseLatency(latency_ms: number): void {
    this.db_latencies.push(latency_ms);
  }

  recordExecution(): void {
    this.executions_total++;
  }

  recordExecutionBlocked(): void {
    this.executions_blocked++;
  }

  recordRecovery(): void {
    this.recoveries++;
  }

  recordCircuitBreakerOpen(): void {
    this.circuit_breaker_opens++;
  }

  recordRequestShedding(): void {
    this.request_shedding_count++;
  }

  private calculatePercentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  private getRequestMetrics(): RequestMetrics {
    return {
      total_requests: this.requests_total,
      latency_p50_ms: this.calculatePercentile(this.request_latencies, 50),
      latency_p95_ms: this.calculatePercentile(this.request_latencies, 95),
      latency_p99_ms: this.calculatePercentile(this.request_latencies, 99),
      error_rate: this.requests_total > 0 ? this.requests_error / this.requests_total : 0,
    };
  }

  private getQueueMetrics(): QueueMetrics {
    const elapsed_seconds = (Date.now() - this.start_time.getTime()) / 1000;
    const completed_jobs = this.jobs_total - this.jobs_failed;

    return {
      total_jobs: this.jobs_total,
      queue_depth: 0, // Would be actual queue depth
      throughput_jobs_per_sec: elapsed_seconds > 0 ? completed_jobs / elapsed_seconds : 0,
      latency_p50_ms: this.calculatePercentile(this.queue_latencies, 50),
      latency_p95_ms: this.calculatePercentile(this.queue_latencies, 95),
      failure_rate: this.jobs_total > 0 ? this.jobs_failed / this.jobs_total : 0,
      dead_letter_queue_size: 0, // Would be actual DLQ size
      average_retries: 1, // Would calculate actual average
    };
  }

  private getExecutionMetrics(): ExecutionMetrics {
    return {
      total_executions: this.executions_total,
      completion_rate:
        this.executions_total > 0
          ? (this.executions_total - this.executions_blocked) / this.executions_total
          : 0,
      blocked_execution_count: this.executions_blocked,
      blocked_execution_rate:
        this.executions_total > 0 ? this.executions_blocked / this.executions_total : 0,
      average_duration_ms: 0, // Would calculate actual average
      operator_overload_events: 0, // Would be actual count
      stale_recommendation_count: 0, // Would be actual count
      stale_recommendation_rate: 0, // Would calculate actual rate
    };
  }

  private getDatabaseMetrics(): DatabaseMetrics {
    return {
      total_operations: this.db_latencies.length,
      query_latency_p50_ms: this.calculatePercentile(this.db_latencies, 50),
      query_latency_p95_ms: this.calculatePercentile(this.db_latencies, 95),
      query_latency_p99_ms: this.calculatePercentile(this.db_latencies, 99),
      connection_pool_utilization: 0, // Would be actual utilization
      retry_rate: 0, // Would calculate actual rate
      error_rate: 0, // Would calculate actual rate
    };
  }

  private getSystemMetrics(): SystemMetrics {
    const uptime_seconds = (Date.now() - this.start_time.getTime()) / 1000;
    const memUsage = process.memoryUsage ? process.memoryUsage() : null;

    return {
      uptime_seconds: Math.floor(uptime_seconds),
      memory_usage_mb: memUsage ? Math.round(memUsage.heapUsed / 1024 / 1024) : 0,
      memory_pressure: this.getMemoryPressure(),
      cpu_usage_percent: 0, // Would get actual CPU usage
      active_connections: 0, // Would get actual connection count
      gc_pause_ms: 0, // Would track actual GC pauses
    };
  }

  private getMemoryPressure(): "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" {
    if (!process.memoryUsage) return "LOW";
    const usage = process.memoryUsage();
    const heapPercent = (usage.heapUsed / usage.heapTotal) * 100;

    if (heapPercent > 95) return "CRITICAL";
    if (heapPercent > 85) return "HIGH";
    if (heapPercent > 70) return "MEDIUM";
    return "LOW";
  }

  aggregateMetrics(): AggregatedMetrics {
    const aggregated: AggregatedMetrics = {
      timestamp: new Date(),
      window_seconds: Math.floor((Date.now() - this.start_time.getTime()) / 1000),
      request: this.getRequestMetrics(),
      queue: this.getQueueMetrics(),
      execution: this.getExecutionMetrics(),
      database: this.getDatabaseMetrics(),
      system: this.getSystemMetrics(),
      recovery_events: this.recoveries,
      circuit_breaker_open_count: this.circuit_breaker_opens,
      request_shedding_events: this.request_shedding_count,
    };

    this.metrics.push(aggregated);
    return aggregated;
  }

  getMetricsHistory(): AggregatedMetrics[] {
    return [...this.metrics];
  }

  getLatestMetrics(): AggregatedMetrics | null {
    return this.metrics.length > 0 ? this.metrics[this.metrics.length - 1] : null;
  }

  isUnhealthy(): boolean {
    const latest = this.getLatestMetrics();
    if (!latest) return false;

    // Mark unhealthy if:
    // - Error rate > 5%
    // - Queue failure rate > 10%
    // - Blocked execution rate > 20%
    // - Memory critical

    if (latest.request.error_rate > 0.05) return true;
    if (latest.queue.failure_rate > 0.1) return true;
    if (latest.execution.blocked_execution_rate > 0.2) return true;
    if (latest.system.memory_pressure === "CRITICAL") return true;

    return false;
  }

  formatMetricsReport(): string {
    const latest = this.getLatestMetrics();
    if (!latest) return "No metrics collected yet";

    return `Runtime Metrics Report
=====================
Timestamp: ${latest.timestamp.toISOString()}
Uptime: ${latest.system.uptime_seconds}s

Request Metrics:
  Total: ${latest.request.total_requests}
  Error Rate: ${(latest.request.error_rate * 100).toFixed(2)}%
  Latency p50: ${latest.request.latency_p50_ms}ms
  Latency p95: ${latest.request.latency_p95_ms}ms
  Latency p99: ${latest.request.latency_p99_ms}ms

Queue Metrics:
  Total Jobs: ${latest.queue.total_jobs}
  Throughput: ${latest.queue.throughput_jobs_per_sec.toFixed(2)} jobs/sec
  Failure Rate: ${(latest.queue.failure_rate * 100).toFixed(2)}%
  Dead Letter Queue: ${latest.queue.dead_letter_queue_size}
  DLQ Size: ${latest.queue.dead_letter_queue_size}

Execution Metrics:
  Total: ${latest.execution.total_executions}
  Completion Rate: ${(latest.execution.completion_rate * 100).toFixed(2)}%
  Blocked: ${latest.execution.blocked_execution_count} (${(latest.execution.blocked_execution_rate * 100).toFixed(2)}%)

Database Metrics:
  Total Operations: ${latest.database.total_operations}
  Query Latency p95: ${latest.database.query_latency_p95_ms}ms
  Pool Utilization: ${latest.database.connection_pool_utilization.toFixed(1)}%

System Metrics:
  Memory: ${latest.system.memory_usage_mb}MB (${latest.system.memory_pressure})
  CPU: ${latest.system.cpu_usage_percent.toFixed(1)}%

Resilience:
  Circuit Breaker Opens: ${latest.circuit_breaker_open_count}
  Request Shedding Events: ${latest.request_shedding_events}
  Recovery Events: ${latest.recovery_events}`;
  }
}

export const runtimeMetricsCollector = new RuntimeMetricsCollector();
