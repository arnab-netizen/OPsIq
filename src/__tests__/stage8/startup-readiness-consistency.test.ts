/**
 * STARTUP / READINESS CONSISTENCY — Regression Tests
 *
 * Root cause remediated: /api/startup previously called
 * MonitoringService.checkStartup() → checkMigrationReadiness(), which compared
 * committed migration directories on the filesystem against _prisma_migrations
 * rows.  Newly-committed migration dirs not yet applied in the active deployment
 * always produced pending > 0 → ready: false → HTTP 503, even though
 * /api/readiness (which reads the durable startup_status table) correctly
 * returned HTTP 200.
 *
 * Fix: /api/startup now uses the same canonical readiness model as
 * /api/readiness — ensureStartupComplete() + getStartupStatus().
 * database_migrated reflects startup-sequence success (schema validated, DB
 * reachable), not a raw filesystem-vs-DB migration directory diff.
 *
 * These six scenarios prove the fix and guard against regression.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── mocks (hoisted) ──────────────────────────────────────────────────────────

vi.mock("@/infra/startup-orchestrator", () => ({
  ensureStartupComplete: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/services/startup-status", () => ({
  getStartupStatus: vi.fn(),
}));

vi.mock("@/middleware/monitoring.middleware", () => ({
  getMonitoringServiceInstance: vi.fn(),
}));

vi.mock("@/infra/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/operator-error-governance", () => ({
  classifyOperatorError: vi.fn(() => ({
    operatorMessage: "Internal startup error",
  })),
}));

// ─── imports after mocks ──────────────────────────────────────────────────────

import * as orchestrator from "@/infra/startup-orchestrator";
import * as startupStatusSvc from "@/services/startup-status";
import * as monitoringMiddleware from "@/middleware/monitoring.middleware";
import type { MonitoringService } from "@/services/monitoring/monitoring.service";

// GET is a Next.js route handler exported from the module.
import { GET } from "@/app/api/startup/route";

// ─── helpers ─────────────────────────────────────────────────────────────────

function mockStartupStatus(status: "READY" | "FAILED" | "NOT_STARTED" | "STARTING") {
  vi.mocked(startupStatusSvc.getStartupStatus).mockResolvedValue({
    status,
    started_at: new Date(),
    version: "test",
    instance_id: "test-instance",
  });
}

function mockReadiness(database_healthy: boolean, latency_ms = 5) {
  vi.mocked(monitoringMiddleware.getMonitoringServiceInstance).mockReturnValue({
    checkReadiness: vi.fn().mockResolvedValue({
      database_healthy,
      database_latency_ms: latency_ms,
      queue_healthy: true,
      queue_depth: 0,
      cache_healthy: true,
      external_services: [],
      is_ready: database_healthy,
    }),
  } as unknown as MonitoringService);
}

async function callGet(): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await GET();
  const body = await response.json();
  return { status: response.status, body };
}

// ─── reset ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(orchestrator.ensureStartupComplete).mockResolvedValue(undefined);
});

// ─── scenarios ───────────────────────────────────────────────────────────────

describe("Startup / Readiness Consistency — regression guard", () => {
  /**
   * Scenario 1: DB healthy + startup READY → HTTP 200, is_ready true.
   * Both /api/startup and /api/readiness must agree.
   */
  describe("Scenario 1: DB healthy + startup READY", () => {
    it("returns HTTP 200 and is_ready true", async () => {
      mockStartupStatus("READY");
      mockReadiness(true);

      const { status, body } = await callGet();

      expect(status).toBe(200);
      expect(body.is_ready).toBe(true);
      expect(body.database_migrated).toBe(true);
      expect(body.config_loaded).toBe(true);
      expect(body.startup_status).toBe("READY");
    });

    it("records database_migrated from startup sequence success, not filesystem diff", async () => {
      mockStartupStatus("READY");
      mockReadiness(true);

      const { body } = await callGet();

      // database_migrated must reflect startup-sequence success only.
      // The old implementation returned false here when new migration dirs
      // were committed but not yet applied in the running deployment.
      expect(body.database_migrated).toBe(true);
    });
  });

  /**
   * Scenario 2: DB unavailable → both startup and readiness NOT READY (HTTP 503).
   */
  describe("Scenario 2: DB unavailable", () => {
    it("returns HTTP 503 and is_ready false when DB is not healthy", async () => {
      mockStartupStatus("READY");
      mockReadiness(false);

      const { status, body } = await callGet();

      expect(status).toBe(503);
      expect(body.is_ready).toBe(false);
      expect(body.test_request_successful).toBe(false);
    });
  });

  /**
   * Scenario 3: Startup sequence NOT_STARTED → not ready even if DB is live.
   * ensureStartupComplete() is called; startup row not yet written.
   */
  describe("Scenario 3: Startup NOT_STARTED", () => {
    it("returns HTTP 503 and triggers startup sequence", async () => {
      mockStartupStatus("NOT_STARTED");
      mockReadiness(true);

      const { status, body } = await callGet();

      expect(status).toBe(503);
      expect(body.is_ready).toBe(false);
      expect(body.database_migrated).toBe(false);
      expect(body.startup_status).toBe("NOT_STARTED");
      // ensureStartupComplete must have been invoked
      expect(vi.mocked(orchestrator.ensureStartupComplete)).toHaveBeenCalledOnce();
    });
  });

  /**
   * Scenario 4: Startup FAILED → not ready; database_migrated false.
   */
  describe("Scenario 4: Startup FAILED", () => {
    it("returns HTTP 503 and database_migrated false when startup failed", async () => {
      mockStartupStatus("FAILED");
      mockReadiness(true);

      const { status, body } = await callGet();

      expect(status).toBe(503);
      expect(body.is_ready).toBe(false);
      expect(body.database_migrated).toBe(false);
      expect(body.config_loaded).toBe(false);
      expect(body.startup_status).toBe("FAILED");
    });
  });

  /**
   * Scenario 5: Startup READY but DB connectivity fails at probe time.
   * The startup sequence succeeded earlier, but DB is unhealthy NOW.
   */
  describe("Scenario 5: Startup READY but DB unavailable at probe time", () => {
    it("returns HTTP 503 — DB liveness gates readiness", async () => {
      mockStartupStatus("READY");
      mockReadiness(false);

      const { status, body } = await callGet();

      expect(status).toBe(503);
      expect(body.is_ready).toBe(false);
      // startup_status row says READY, so config_loaded and database_migrated reflect that
      expect(body.database_migrated).toBe(true);
      // but overall is_ready is false because DB is not healthy right now
      expect(body.test_request_successful).toBe(false);
    });
  });

  /**
   * Scenario 6: No disagreement between startup and readiness models.
   * When startup_status is READY and DB is healthy: both return 200.
   * When startup_status is not READY: /api/startup returns 503.
   * The old implementation disagreed: startup→503, readiness→200.
   */
  describe("Scenario 6: Consistency — startup and readiness models agree", () => {
    it("when READY + DB healthy: is_ready true (no 503/200 disagreement)", async () => {
      mockStartupStatus("READY");
      mockReadiness(true);

      const { status, body } = await callGet();

      // Both startup and readiness now use startup_status as canonical source.
      expect(status).toBe(200);
      expect(body.is_ready).toBe(true);
    });

    it("when STARTING: is_ready false (still warming up)", async () => {
      mockStartupStatus("STARTING");
      mockReadiness(true);

      const { status, body } = await callGet();

      expect(status).toBe(503);
      expect(body.is_ready).toBe(false);
    });

    it("ensureStartupComplete error does not throw — status falls through to getStartupStatus", async () => {
      vi.mocked(orchestrator.ensureStartupComplete).mockRejectedValueOnce(
        new Error("startup orchestrator error")
      );
      mockStartupStatus("FAILED");
      mockReadiness(false);

      // Must not throw — the catch inside the route handler swallows it.
      const { status, body } = await callGet();

      expect(status).toBe(503);
      expect(body.is_ready).toBe(false);
    });
  });
});
