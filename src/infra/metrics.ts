/**
 * Metrics Collection Infrastructure (Phase 13 Slice 4)
 *
 * Provides observability for error rates, latency, and dependency health.
 * CloudWatch/DataDog integration contracts + mock-backed collection.
 *
 * Mock-backed for non-DB environments; production uses CloudWatch/DataDog.
 */

export enum MetricType {
  COUNTER = "counter",
  GAUGE = "gauge",
  HISTOGRAM = "histogram",
  TIMER = "timer",
}

export interface MetricValue {
  name: string;
  value: number;
  unit?: string;
  timestamp: Date;
  tags?: Record<string, string>;
}

export interface MetricCounter {
  name: string;
  count: number;
  lastIncremented: Date;
  tags?: Record<string, string>;
}

export interface MetricHistogram {
  name: string;
  values: number[];
  min: number;
  max: number;
  avg: number;
  p50: number;
  p95: number;
  p99: number;
  count: number;
}

export interface MetricTimerResult {
  name: string;
  duration: number;
  timestamp: Date;
  tags?: Record<string, string>;
}

/**
 * Mock-backed metrics store for development/testing
 * In production, metrics are sent to CloudWatch or DataDog
 */
class MetricsStore {
  private counters = new Map<string, MetricCounter>();
  private histograms = new Map<string, number[]>();
  private timers = new Map<string, MetricTimerResult[]>();
  private errorMetrics = new Map<
    string,
    { count: number; lastOccurred: Date }
  >();

  /**
   * Increment a counter metric
   */
  incrementCounter(name: string, tags?: Record<string, string>): void {
    const key = this.getKey(name, tags);

    if (!this.counters.has(key)) {
      this.counters.set(key, {
        name,
        count: 0,
        lastIncremented: new Date(),
        tags,
      });
    }

    const counter = this.counters.get(key)!;
    counter.count++;
    counter.lastIncremented = new Date();
  }

  /**
   * Record a histogram value (latency, size, etc.)
   */
  recordHistogram(name: string, value: number): void {
    if (!this.histograms.has(name)) {
      this.histograms.set(name, []);
    }

    this.histograms.get(name)!.push(value);
  }

  /**
   * Record a timer result
   */
  recordTimer(
    name: string,
    duration: number,
    tags?: Record<string, string>
  ): void {
    if (!this.timers.has(name)) {
      this.timers.set(name, []);
    }

    this.timers.get(name)!.push({
      name,
      duration,
      timestamp: new Date(),
      tags,
    });

    // Keep only last 1000 samples per metric
    const samples = this.timers.get(name)!;
    if (samples.length > 1000) {
      samples.shift();
    }
  }

  /**
   * Record error metric by classification
   */
  recordError(classification: string): void {
    const key = `error_${classification}`;

    if (!this.errorMetrics.has(key)) {
      this.errorMetrics.set(key, { count: 0, lastOccurred: new Date() });
    }

    const metric = this.errorMetrics.get(key)!;
    metric.count++;
    metric.lastOccurred = new Date();
  }

  /**
   * Get all counters
   */
  getCounters(): MetricCounter[] {
    return Array.from(this.counters.values());
  }

  /**
   * Get counter by name
   */
  getCounter(name: string): MetricCounter | undefined {
    return this.counters.get(name);
  }

  /**
   * Get histogram stats
   */
  getHistogram(name: string): MetricHistogram | undefined {
    const values = this.histograms.get(name);
    if (!values || values.length === 0) {
      return undefined;
    }

    const sorted = [...values].sort((a, b) => a - b);
    const sum = values.reduce((a, b) => a + b, 0);
    const avg = sum / values.length;

    return {
      name,
      values: sorted,
      min: sorted[0]!,
      max: sorted[sorted.length - 1]!,
      avg,
      p50: sorted[Math.floor(sorted.length * 0.5)]!,
      p95: sorted[Math.floor(sorted.length * 0.95)]!,
      p99: sorted[Math.floor(sorted.length * 0.99)]!,
      count: values.length,
    };
  }

  /**
   * Get error metrics
   */
  getErrorMetrics(): Record<
    string,
    { count: number; lastOccurred: Date }
  > {
    return Object.fromEntries(this.errorMetrics);
  }

  /**
   * Clear all metrics (for testing)
   */
  clear(): void {
    this.counters.clear();
    this.histograms.clear();
    this.timers.clear();
    this.errorMetrics.clear();
  }

  /**
   * Get summary of all metrics
   */
  getSummary() {
    return {
      counters: Array.from(this.counters.values()),
      histograms: Array.from(this.histograms.entries()).map(([name, values]) => ({
        name,
        count: values.length,
        avg: values.reduce((a, b) => a + b, 0) / values.length,
      })),
      errorMetrics: Object.fromEntries(this.errorMetrics),
    };
  }

  /**
   * Helper: Create cache key from name and tags
   */
  private getKey(name: string, tags?: Record<string, string>): string {
    if (!tags || Object.keys(tags).length === 0) {
      return name;
    }

    const tagStr = Object.entries(tags)
      .sort()
      .map(([k, v]) => `${k}=${v}`)
      .join(",");
    return `${name}[${tagStr}]`;
  }
}

// Singleton metrics store
const metricsStore = new MetricsStore();

/**
 * Core metrics API
 */
export const metrics = {
  /**
   * Increment error count by classification
   */
  recordError(classification: string): void {
    metricsStore.recordError(classification);
  },

  /**
   * Record API latency (milliseconds)
   */
  recordLatency(endpoint: string, duration: number): void {
    metricsStore.recordHistogram(`api_latency_${endpoint}`, duration);
    metricsStore.incrementCounter("api_requests", {
      endpoint,
      status: duration > 1000 ? "slow" : "normal",
    });
  },

  /**
   * Record request count by endpoint
   */
  recordRequest(endpoint: string, statusCode: number): void {
    metricsStore.incrementCounter("http_requests", {
      endpoint,
      status: String(statusCode),
    });
  },

  /**
   * Record database operation latency
   */
  recordDatabaseLatency(operation: string, duration: number): void {
    metricsStore.recordHistogram(`db_${operation}_latency`, duration);
    metricsStore.incrementCounter("db_operations", {
      operation,
      speed: duration > 5000 ? "slow" : "normal",
    });

    if (duration > 5000) {
      metricsStore.incrementCounter("db_slow_queries", {
        operation,
      });
    }
  },

  /**
   * Record queue depth
   */
  recordQueueDepth(queueName: string, depth: number): void {
    metricsStore.recordHistogram(`queue_depth_${queueName}`, depth);
  },

  /**
   * Record memory usage percentage
   */
  recordMemoryUsage(percentUsed: number): void {
    metricsStore.recordHistogram("memory_usage_percent", percentUsed);

    if (percentUsed > 90) {
      metricsStore.incrementCounter("memory_high_usage_alerts", {});
    }
  },

  /**
   * Get metric for monitoring
   */
  getMetrics() {
    return {
      counters: metricsStore.getCounters(),
      errorMetrics: metricsStore.getErrorMetrics(),
      latencyMetrics: {
        apiLatency: metricsStore.getHistogram("api_latency"),
        dbLatency: metricsStore.getHistogram("db_latency"),
      },
      summary: metricsStore.getSummary(),
    };
  },

  /**
   * Get specific error metrics
   */
  getErrorMetrics() {
    return metricsStore.getErrorMetrics();
  },

  /**
   * Get specific latency metric
   */
  getLatencyMetric(name: string) {
    return metricsStore.getHistogram(name);
  },

  /**
   * Clear metrics (testing only)
   */
  clear(): void {
    metricsStore.clear();
  },
};

/**
 * CloudWatch/DataDog integration contracts
 * (In production with proper env vars, these would send to actual services)
 */
export const monitoringConfig = {
  cloudwatch: {
    namespace: "OpsIQ",
    region: process.env.AWS_REGION || "us-east-1",
    enabled: !!(process.env.CLOUDWATCH_ENABLED && process.env.AWS_ACCESS_KEY_ID),
  },
  datadog: {
    apiKey: process.env.DATADOG_API_KEY || "",
    appKey: process.env.DATADOG_APP_KEY || "",
    site: process.env.DATADOG_SITE || "datadoghq.com",
    enabled: !!process.env.DATADOG_API_KEY,
  },
  environment: process.env.NODE_ENV || "development",
  version: process.env.npm_package_version || "0.1.0",
};

/**
 * Production export metric (would be called by monitoring integration)
 */
export async function exportMetrics(): Promise<Record<string, unknown>> {
  if (monitoringConfig.cloudwatch.enabled) {
    // CloudWatch integration would go here
    // import { CloudWatchClient, PutMetricDataCommand } from "@aws-sdk/client-cloudwatch";
    // This is stubbed for non-DB build
  }

  if (monitoringConfig.datadog.enabled) {
    // DataDog integration would go here
    // import { Client } from "datadog-api-client";
    // This is stubbed for non-DB build
  }

  return metricsStore.getSummary();
}
