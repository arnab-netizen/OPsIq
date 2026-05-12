/**
 * Tests: Metrics Collection Service
 *
 * Validates metrics recording, aggregation, and monitoring integration.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  metrics,
  monitoringConfig,
  exportMetrics,
  type MetricCounter,
} from "@/infra/metrics";

describe("Phase 13 Slice 4: Metrics Collection", () => {
  beforeEach(() => {
    metrics.clear();
  });

  describe("Error Metrics", () => {
    it("should record error classification counts", () => {
      metrics.recordError("AUTH_ERROR");
      metrics.recordError("AUTH_ERROR");
      metrics.recordError("VALIDATION_ERROR");

      const errorMetrics = metrics.getErrorMetrics();
      expect(errorMetrics["error_AUTH_ERROR"].count).toBe(2);
      expect(errorMetrics["error_VALIDATION_ERROR"].count).toBe(1);
    });

    it("should track last error occurrence", () => {
      metrics.recordError("DATABASE_ERROR");
      const errorMetrics = metrics.getErrorMetrics();

      const dbError = errorMetrics["error_DATABASE_ERROR"];
      expect(dbError.lastOccurred).toBeInstanceOf(Date);
      expect(dbError.lastOccurred.getTime()).toBeGreaterThan(
        Date.now() - 1000
      );
    });

    it("should aggregate errors by type", () => {
      const errors = [
        "AUTH_ERROR",
        "AUTH_ERROR",
        "VALIDATION_ERROR",
        "DATABASE_ERROR",
        "INTERNAL_ERROR",
      ];

      errors.forEach((err) => metrics.recordError(err));

      const errorMetrics = metrics.getErrorMetrics();
      expect(Object.keys(errorMetrics).length).toBe(4); // 4 unique error types
    });

    it("should return empty error metrics initially", () => {
      const errorMetrics = metrics.getErrorMetrics();
      expect(Object.keys(errorMetrics).length).toBe(0);
    });
  });

  describe("Request Latency Metrics", () => {
    it("should record API endpoint latency", () => {
      metrics.recordLatency("/api/actions", 150);
      metrics.recordLatency("/api/actions", 200);
      metrics.recordLatency("/api/recommendations", 300);

      const allMetrics = metrics.getMetrics();
      expect(allMetrics.counters.length).toBeGreaterThan(0);
    });

    it("should track normal vs slow requests", () => {
      metrics.recordLatency("/api/actions", 500); // normal
      metrics.recordLatency("/api/actions", 1500); // slow

      const allMetrics = metrics.getMetrics();
      const counters = allMetrics.counters;

      const normalRequests = counters.find(
        (c) =>
          c.name === "api_requests" &&
          c.tags?.status === "normal"
      );
      const slowRequests = counters.find(
        (c) =>
          c.name === "api_requests" &&
          c.tags?.status === "slow"
      );

      expect(normalRequests?.count).toBe(1);
      expect(slowRequests?.count).toBe(1);
    });

    it("should record large latencies", () => {
      metrics.recordLatency("/api/heavy-operation", 5000);
      metrics.recordLatency("/api/heavy-operation", 5500);

      const allMetrics = metrics.getMetrics();
      expect(allMetrics.counters.length).toBeGreaterThan(0);
    });
  });

  describe("HTTP Request Metrics", () => {
    it("should record request counts by endpoint and status", () => {
      metrics.recordRequest("/api/actions", 200);
      metrics.recordRequest("/api/actions", 200);
      metrics.recordRequest("/api/actions", 400);
      metrics.recordRequest("/api/recommendations", 201);

      const allMetrics = metrics.getMetrics();
      const counters = allMetrics.counters.filter(
        (c) => c.name === "http_requests"
      );

      expect(counters.length).toBe(3); // 3 unique endpoint/status combinations
    });

    it("should track successful vs error responses", () => {
      metrics.recordRequest("/api/test", 200);
      metrics.recordRequest("/api/test", 201);
      metrics.recordRequest("/api/test", 400);
      metrics.recordRequest("/api/test", 500);

      const allMetrics = metrics.getMetrics();
      const counters = allMetrics.counters.filter(
        (c) => c.name === "http_requests"
      );

      const status200 = counters.find((c) => c.tags?.status === "200");
      const status400 = counters.find((c) => c.tags?.status === "400");
      const status500 = counters.find((c) => c.tags?.status === "500");

      expect(status200?.count).toBe(1);
      expect(status400?.count).toBe(1);
      expect(status500?.count).toBe(1);
    });
  });

  describe("Database Performance Metrics", () => {
    it("should record database operation latency", () => {
      metrics.recordDatabaseLatency("create", 100);
      metrics.recordDatabaseLatency("create", 150);
      metrics.recordDatabaseLatency("query", 50);

      const allMetrics = metrics.getMetrics();
      expect(allMetrics.counters.length).toBeGreaterThan(0);
    });

    it("should flag slow queries (> 5s)", () => {
      metrics.recordDatabaseLatency("complex_query", 100);
      metrics.recordDatabaseLatency("complex_query", 6000); // slow

      const allMetrics = metrics.getMetrics();
      const slowQueries = allMetrics.counters.find(
        (c) => c.name === "db_slow_queries"
      );

      expect(slowQueries?.count).toBe(1);
    });

    it("should track queries within normal range", () => {
      const latencies = [50, 100, 150, 200, 300, 400, 500];
      latencies.forEach((lat) => {
        metrics.recordDatabaseLatency("normal_queries", lat);
      });

      const allMetrics = metrics.getMetrics();
      const slowQueries = allMetrics.counters.find(
        (c) => c.name === "db_slow_queries"
      );

      // Should have no slow queries
      expect(slowQueries?.count || 0).toBe(0);
    });
  });

  describe("Queue Depth Metrics", () => {
    it("should record queue depth", () => {
      metrics.recordQueueDepth("email-queue", 5);
      metrics.recordQueueDepth("email-queue", 10);
      metrics.recordQueueDepth("job-queue", 2);

      const allMetrics = metrics.getMetrics();
      expect(allMetrics.summary).toBeDefined();
    });

    it("should track queue growth", () => {
      metrics.recordQueueDepth("notification-queue", 1);
      metrics.recordQueueDepth("notification-queue", 3);
      metrics.recordQueueDepth("notification-queue", 5);

      const allMetrics = metrics.getMetrics();
      expect(allMetrics.summary).toBeDefined();
    });
  });

  describe("Memory Usage Metrics", () => {
    it("should record memory usage percentage", () => {
      metrics.recordMemoryUsage(50);
      metrics.recordMemoryUsage(75);
      metrics.recordMemoryUsage(60);

      const allMetrics = metrics.getMetrics();
      expect(allMetrics.summary).toBeDefined();
    });

    it("should flag high memory usage (> 90%)", () => {
      metrics.recordMemoryUsage(50);
      metrics.recordMemoryUsage(95); // high

      const allMetrics = metrics.getMetrics();
      const memoryAlerts = allMetrics.counters.find(
        (c) => c.name === "memory_high_usage_alerts"
      );

      expect(memoryAlerts?.count).toBe(1);
    });

    it("should not flag normal memory usage", () => {
      metrics.recordMemoryUsage(50);
      metrics.recordMemoryUsage(75);
      metrics.recordMemoryUsage(85);

      const allMetrics = metrics.getMetrics();
      const memoryAlerts = allMetrics.counters.find(
        (c) => c.name === "memory_high_usage_alerts"
      );

      expect(memoryAlerts?.count || 0).toBe(0);
    });
  });

  describe("Metrics Aggregation", () => {
    it("should aggregate all metric types", () => {
      metrics.recordError("AUTH_ERROR");
      metrics.recordLatency("/api/test", 150);
      metrics.recordRequest("/api/test", 200);
      metrics.recordDatabaseLatency("query", 100);
      metrics.recordMemoryUsage(75);

      const allMetrics = metrics.getMetrics();
      expect(allMetrics.counters).toBeDefined();
      expect(allMetrics.errorMetrics).toBeDefined();
      expect(allMetrics.summary).toBeDefined();
    });

    it("should return empty metrics initially", () => {
      const allMetrics = metrics.getMetrics();
      expect(allMetrics.counters.length).toBe(0);
      expect(Object.keys(allMetrics.errorMetrics).length).toBe(0);
    });

    it("should provide summary statistics", () => {
      metrics.recordError("VALIDATION_ERROR");
      metrics.recordLatency("/api/test", 200);
      metrics.recordRequest("/api/test", 400);

      const allMetrics = metrics.getMetrics();
      const summary = allMetrics.summary;

      expect(summary.counters).toBeDefined();
      expect(summary.errorMetrics).toBeDefined();
      expect(Array.isArray(summary.counters)).toBe(true);
    });
  });

  describe("Monitoring Configuration", () => {
    it("should have monitoring config for current environment", () => {
      expect(monitoringConfig.environment).toBeDefined();
      expect(monitoringConfig.version).toBeDefined();
    });

    it("should detect CloudWatch availability", () => {
      expect(monitoringConfig.cloudwatch.namespace).toBe("OpsIQ");
      expect(typeof monitoringConfig.cloudwatch.enabled).toBe("boolean");
    });

    it("should detect DataDog availability", () => {
      expect(typeof monitoringConfig.datadog.enabled).toBe("boolean");
      expect(monitoringConfig.datadog.site).toBeDefined();
    });

    it("should have default region for CloudWatch", () => {
      expect(monitoringConfig.cloudwatch.region).toBeTruthy();
    });
  });

  describe("Export Metrics", () => {
    it("should export collected metrics", async () => {
      metrics.recordError("AUTH_ERROR");
      metrics.recordLatency("/api/test", 150);

      const exported = await exportMetrics();

      expect(exported).toBeDefined();
      expect(exported.counters || exported.errorMetrics).toBeDefined();
    });

    it("should export summary when monitoring available", async () => {
      metrics.recordRequest("/api/test", 200);
      const exported = await exportMetrics();

      expect(exported).toBeDefined();
    });
  });

  describe("Real-World Scenarios", () => {
    it("should handle burst of errors", () => {
      const errorTypes = [
        "AUTH_ERROR",
        "VALIDATION_ERROR",
        "DATABASE_ERROR",
        "INTERNAL_ERROR",
      ];

      for (let i = 0; i < 10; i++) {
        errorTypes.forEach((type) => {
          metrics.recordError(type);
        });
      }

      const errorMetrics = metrics.getErrorMetrics();
      expect(Object.keys(errorMetrics).length).toBe(4);
      Object.values(errorMetrics).forEach((metric) => {
        expect(metric.count).toBe(10);
      });
    });

    it("should track performance degradation pattern", () => {
      // Simulate normal then degraded performance
      for (let i = 0; i < 5; i++) {
        metrics.recordLatency("/api/actions", 100);
      }
      for (let i = 0; i < 5; i++) {
        metrics.recordLatency("/api/actions", 2000); // degraded
      }

      const allMetrics = metrics.getMetrics();
      expect(allMetrics.counters.length).toBeGreaterThan(0);
    });

    it("should maintain separate metrics per endpoint", () => {
      const endpoints = ["/api/actions", "/api/decisions", "/api/experiments"];

      endpoints.forEach((endpoint) => {
        metrics.recordRequest(endpoint, 200);
        metrics.recordRequest(endpoint, 201);
        metrics.recordLatency(endpoint, 100);
      });

      const allMetrics = metrics.getMetrics();
      const httpRequestCounters = allMetrics.counters.filter(
        (c) => c.name === "http_requests"
      );

      // Should have 3 counters (one per endpoint with 200 status, one per endpoint with 201, etc.)
      expect(httpRequestCounters.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("Metrics Clear", () => {
    it("should reset all metrics", () => {
      metrics.recordError("AUTH_ERROR");
      metrics.recordLatency("/api/test", 150);
      metrics.recordRequest("/api/test", 200);

      metrics.clear();

      const allMetrics = metrics.getMetrics();
      expect(allMetrics.counters.length).toBe(0);
      expect(Object.keys(allMetrics.errorMetrics).length).toBe(0);
    });

    it("should allow recording after clear", () => {
      metrics.recordError("AUTH_ERROR");
      metrics.clear();
      metrics.recordError("VALIDATION_ERROR");

      const errorMetrics = metrics.getErrorMetrics();
      expect(errorMetrics["error_VALIDATION_ERROR"].count).toBe(1);
      expect(errorMetrics["error_AUTH_ERROR"]).toBeUndefined();
    });
  });
});
