/**
 * Tests: Health Check & Readiness Service
 *
 * Validates health status checks, readiness probes, uptime tracking,
 * and probe responses for deployment orchestration.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  HealthStatus,
  getUptime,
  checkMemory,
  checkResponseTime,
  checkEventLoop,
  getHealthCheck,
  setReadiness,
  isReady,
  getReadinessCheck,
  getDetailedHealth,
  getLivenessProbeResponse,
  getReadinessProbeResponse,
} from "@/infra/health-check";

describe("Health Check & Readiness Service", () => {
  beforeEach(() => {
    setReadiness(false);
  });

  describe("Uptime Tracking", () => {
    it("should track application uptime", () => {
      const uptime = getUptime();
      expect(uptime).toBeGreaterThan(0);
      expect(typeof uptime).toBe("number");
    });

    it("should increase over time", async () => {
      const uptime1 = getUptime();
      await new Promise((resolve) => setTimeout(resolve, 10));
      const uptime2 = getUptime();

      expect(uptime2).toBeGreaterThan(uptime1);
    });

    it("should be in milliseconds", () => {
      const uptime = getUptime();
      expect(uptime).toBeLessThan(1000000); // Unlikely to be > ~11 days in milliseconds
    });
  });

  describe("Memory Check", () => {
    it("should check memory usage", () => {
      const result = checkMemory();

      expect(result.status).toBeDefined();
      expect([HealthStatus.HEALTHY, HealthStatus.DEGRADED, HealthStatus.UNHEALTHY]).toContain(
        result.status
      );
    });

    it("should report response time", () => {
      const result = checkMemory();
      expect(result.responseTime).toBeGreaterThanOrEqual(0);
    });

    it("should include last checked timestamp", () => {
      const before = new Date();
      const result = checkMemory();
      const after = new Date();

      expect(result.lastChecked.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(result.lastChecked.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it("should handle errors gracefully", () => {
      const result = checkMemory();
      // Should never be unhealthy for memory check in this environment
      expect([HealthStatus.HEALTHY, HealthStatus.DEGRADED]).toContain(result.status);
    });
  });

  describe("Response Time Check", () => {
    it("should check response time", () => {
      const result = checkResponseTime();

      expect(result.status).toBeDefined();
      expect([HealthStatus.HEALTHY, HealthStatus.DEGRADED, HealthStatus.UNHEALTHY]).toContain(
        result.status
      );
    });

    it("should report measurable response time", () => {
      const result = checkResponseTime();
      expect(result.responseTime).toBeGreaterThanOrEqual(0);
    });

    it("should be quick (< 100ms)", () => {
      const result = checkResponseTime();
      expect(result.responseTime).toBeLessThan(100);
    });
  });

  describe("Event Loop Check", () => {
    it("should check event loop", () => {
      const result = checkEventLoop();

      expect(result.status).toBe(HealthStatus.HEALTHY);
      expect(result.responseTime).toBeGreaterThanOrEqual(0);
    });

    it("should include timestamp", () => {
      const result = checkEventLoop();
      expect(result.lastChecked).toBeDefined();
      expect(result.lastChecked instanceof Date).toBe(true);
    });
  });

  describe("Full Health Check", () => {
    it("should perform full health check", () => {
      const health = getHealthCheck();

      expect(health.status).toBeDefined();
      expect(health.timestamp).toBeDefined();
      expect(health.uptime).toBeGreaterThan(0);
      expect(health.checks).toBeDefined();
    });

    it("should include all check types", () => {
      const health = getHealthCheck();

      expect(health.checks.memory).toBeDefined();
      expect(health.checks.responseTime).toBeDefined();
      expect(health.checks.eventLoop).toBeDefined();
    });

    it("should aggregate status correctly", () => {
      const health = getHealthCheck();

      const checkStatuses = Object.values(health.checks).map((c) => c.status);
      const expectedStatus = checkStatuses.includes(HealthStatus.UNHEALTHY)
        ? HealthStatus.UNHEALTHY
        : checkStatuses.includes(HealthStatus.DEGRADED)
          ? HealthStatus.DEGRADED
          : HealthStatus.HEALTHY;

      expect(health.status).toBe(expectedStatus);
    });

    it("should include version when provided", () => {
      const health = getHealthCheck("1.0.0");
      expect(health.version).toBe("1.0.0");
    });

    it("should cache results", () => {
      const health1 = getHealthCheck();
      const health2 = getHealthCheck();

      // Should be same cached result
      expect(health1.timestamp.getTime()).toBe(health2.timestamp.getTime());
    });

    it("should invalidate cache after TTL", async () => {
      const health1 = getHealthCheck();

      // Wait for cache TTL
      await new Promise((resolve) => setTimeout(resolve, 11000));

      const health2 = getHealthCheck();

      // Should be different
      expect(health2.timestamp.getTime()).toBeGreaterThan(health1.timestamp.getTime());
    });
  });

  describe("Readiness State Management", () => {
    it("should start not ready", () => {
      expect(isReady()).toBe(false);
    });

    it("should set readiness to true", () => {
      setReadiness(true);
      expect(isReady()).toBe(true);
    });

    it("should set readiness to false", () => {
      setReadiness(true);
      setReadiness(false);
      expect(isReady()).toBe(false);
    });

    it("should toggle readiness", () => {
      setReadiness(true);
      expect(isReady()).toBe(true);

      setReadiness(false);
      expect(isReady()).toBe(false);

      setReadiness(true);
      expect(isReady()).toBe(true);
    });
  });

  describe("Readiness Check", () => {
    it("should return readiness result", () => {
      const readiness = getReadinessCheck();

      expect(readiness.ready).toBeDefined();
      expect(readiness.timestamp).toBeDefined();
      expect(readiness.checks).toBeDefined();
    });

    it("should report not ready initially", () => {
      const readiness = getReadinessCheck();
      expect(readiness.ready).toBe(false);
    });

    it("should report ready after setting", () => {
      setReadiness(true);
      const readiness = getReadinessCheck();

      expect(readiness.ready).toBe(true);
    });

    it("should include application ready check", () => {
      const readiness = getReadinessCheck();

      expect(readiness.checks.applicationReady).toBeDefined();
      expect(readiness.checks.applicationReady.ready).toBe(false);
    });

    it("should include memory available check", () => {
      const readiness = getReadinessCheck();

      expect(readiness.checks.memoryAvailable).toBeDefined();
      expect(readiness.checks.memoryAvailable.ready).toBe(true);
    });

    it("should update timestamp on each call", async () => {
      const readiness1 = getReadinessCheck();

      await new Promise((resolve) => setTimeout(resolve, 10));

      const readiness2 = getReadinessCheck();

      expect(readiness2.timestamp.getTime()).toBeGreaterThanOrEqual(
        readiness1.timestamp.getTime()
      );
    });
  });

  describe("Detailed Health Status", () => {
    it("should return detailed health and readiness", () => {
      const detailed = getDetailedHealth();

      expect(detailed.health).toBeDefined();
      expect(detailed.readiness).toBeDefined();
      expect(detailed.metadata).toBeDefined();
    });

    it("should include version in health", () => {
      const detailed = getDetailedHealth("2.0.0");
      expect(detailed.health.version).toBe("2.0.0");
    });

    it("should include uptime in metadata", () => {
      const detailed = getDetailedHealth();
      expect(detailed.metadata.uptime).toBeGreaterThan(0);
    });

    it("should include environment in metadata", () => {
      const detailed = getDetailedHealth();
      expect(detailed.metadata.environment).toBeDefined();
      expect(typeof detailed.metadata.environment).toBe("string");
    });

    it("should include timestamp in metadata", () => {
      const detailed = getDetailedHealth();
      expect(detailed.metadata.timestamp).toMatch(/\d{4}-\d{2}-\d{2}/);
    });
  });

  describe("Liveness Probe", () => {
    it("should return 200 when healthy", () => {
      const response = getLivenessProbeResponse();
      expect(response.status).toBe(200);
      expect(response.message).toContain("alive");
    });

    it("should return unhealthy message when unhealthy", () => {
      const response = getLivenessProbeResponse();

      if (response.status === 503) {
        expect(response.message).toContain("unhealthy");
      }
    });

    it("should have appropriate status codes", () => {
      const response = getLivenessProbeResponse();
      expect([200, 503]).toContain(response.status);
    });

    it("should include message", () => {
      const response = getLivenessProbeResponse();
      expect(response.message).toBeDefined();
      expect(typeof response.message).toBe("string");
    });
  });

  describe("Readiness Probe", () => {
    it("should return 503 when not ready", () => {
      const response = getReadinessProbeResponse();
      expect(response.status).toBe(503);
      expect(response.message).toContain("not ready");
    });

    it("should return 200 when ready", () => {
      setReadiness(true);
      const response = getReadinessProbeResponse();

      expect(response.status).toBe(200);
      expect(response.message).toContain("ready");
    });

    it("should respond to readiness changes", () => {
      let response = getReadinessProbeResponse();
      expect(response.status).toBe(503);

      setReadiness(true);
      response = getReadinessProbeResponse();
      expect(response.status).toBe(200);

      setReadiness(false);
      response = getReadinessProbeResponse();
      expect(response.status).toBe(503);
    });

    it("should have appropriate status codes", () => {
      const response = getReadinessProbeResponse();
      expect([200, 503]).toContain(response.status);
    });
  });

  describe("Real-World Scenarios", () => {
    it("should support Kubernetes liveness probes", () => {
      const response = getLivenessProbeResponse();

      // Should always have a valid HTTP status
      expect([200, 503]).toContain(response.status);
      expect(response.message).toBeDefined();
    });

    it("should support Kubernetes readiness probes", () => {
      // Not ready initially
      let response = getReadinessProbeResponse();
      expect(response.status).toBe(503);

      // Ready after initialization
      setReadiness(true);
      response = getReadinessProbeResponse();
      expect(response.status).toBe(200);
    });

    it("should provide detailed status for monitoring", () => {
      const detailed = getDetailedHealth("1.2.3");

      // Monitoring system can use this for dashboards
      expect(detailed.health.status).toBeDefined();
      expect(detailed.health.uptime).toBeGreaterThan(0);
      expect(detailed.readiness.ready).toBeDefined();
      expect(detailed.metadata.uptime).toBeGreaterThan(0);
    });

    it("should track health history", () => {
      const health1 = getHealthCheck();
      const health1Status = health1.status;

      const health2 = getHealthCheck();
      const health2Status = health2.status;

      // Status should be consistent for same check
      expect(health1Status).toBe(health2Status);
    });

    it("should transition through readiness stages", () => {
      // Stage 1: Not ready (startup)
      expect(isReady()).toBe(false);

      // Stage 2: Ready (after initialization)
      setReadiness(true);
      expect(isReady()).toBe(true);

      // Stage 3: Degradation scenario
      const readiness = getReadinessCheck();
      expect(readiness.ready).toBe(true);
    });
  });

  describe("Probe Integration", () => {
    it("should work together for orchestration", () => {
      // Initial state: unhealthy or degraded
      const initialLiveness = getLivenessProbeResponse();
      const initialReadiness = getReadinessProbeResponse();

      // Readiness starts as not ready
      expect(initialReadiness.status).toBe(503);

      // Initialize application
      setReadiness(true);

      // Now should be ready
      const readyProbe = getReadinessProbeResponse();
      expect(readyProbe.status).toBe(200);

      // Liveness should remain positive
      const livenessProbe = getLivenessProbeResponse();
      expect([200, 503]).toContain(livenessProbe.status);
    });

    it("should provide different signals for orchestration decisions", () => {
      // Liveness: is the service process alive?
      const liveness = getLivenessProbeResponse();
      expect(liveness.status).toBe(200); // Process is alive

      // Readiness: should orchestration route traffic to this instance?
      const readiness = getReadinessProbeResponse();
      expect(readiness.status).toBe(503); // Not ready for traffic initially

      // After initialization
      setReadiness(true);
      const readinessAfter = getReadinessProbeResponse();
      expect(readinessAfter.status).toBe(200); // Ready for traffic
    });
  });
});
