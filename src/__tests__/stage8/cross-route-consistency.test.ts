/**
 * Cross-route consistency — /api/startup vs /api/readiness
 *
 * Verifies that both probe endpoints agree on readiness under five canonical
 * state combinations. The production defect this guards against: startup route
 * returned HTTP 200 (READY) while readiness returned HTTP 503 because they
 * derived "database_migrated" differently.
 *
 * Cases:
 *   A — all green   → both 200, both is_ready true
 *   B — migrations pending  → both 503, both is_ready false
 *   C — startup NOT_STARTED → both 503, both is_ready false
 *   D — startup FAILED      → both 503, both is_ready false
 *   E — DB unhealthy        → both 503, both is_ready false
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── mocks ───────────────────────────────────────────────────────────────────

vi.mock("@/infra/startup-orchestrator", () => ({
  ensureStartupComplete: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/services/startup-status", () => ({
  getStartupStatus: vi.fn(),
}));

vi.mock("@/services/monitoring/migration-check", () => ({
  checkMigrationReadiness: vi.fn(),
}));

vi.mock("@/middleware/monitoring.middleware", () => ({
  getMonitoringServiceInstance: vi.fn(),
}));

vi.mock("@/infra/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/operator-error-governance", () => ({
  classifyOperatorError: vi.fn(() => ({ operatorMessage: "Internal startup error" })),
}));

// ─── imports ─────────────────────────────────────────────────────────────────

import * as startupStatusSvc from "@/services/startup-status";
import * as migrationCheckMod from "@/services/monitoring/migration-check";
import * as monitoringMiddleware from "@/middleware/monitoring.middleware";
import type { MonitoringService } from "@/services/monitoring/monitoring.service";

import { GET as startupGET } from "@/app/api/startup/route";
import { GET as readinessGET } from "@/app/api/readiness/route";

// ─── helpers ─────────────────────────────────────────────────────────────────

type StartupStatusType = "READY" | "FAILED" | "NOT_STARTED" | "STARTING";

interface StateConfig {
  startupStatus: StartupStatusType;
  migrationReady: boolean;
  dbHealthy: boolean;
  queueHealthy?: boolean;
}

function applyState({ startupStatus, migrationReady, dbHealthy, queueHealthy = true }: StateConfig) {
  vi.mocked(startupStatusSvc.getStartupStatus).mockResolvedValue({
    status: startupStatus,
    started_at: new Date(),
    version: "test",
    instance_id: "test-instance",
  });
  vi.mocked(migrationCheckMod.checkMigrationReadiness).mockResolvedValue({
    ready: migrationReady,
    totalCommitted: 3,
    applied: migrationReady ? 3 : 1,
    pending: migrationReady ? 0 : 2,
    failed: 0,
  });
  vi.mocked(monitoringMiddleware.getMonitoringServiceInstance).mockReturnValue({
    checkReadiness: vi.fn().mockResolvedValue({
      database_healthy: dbHealthy,
      database_latency_ms: dbHealthy ? 5 : undefined,
      queue_healthy: queueHealthy,
      queue_depth: 0,
      cache_healthy: true,
      external_services: [],
    }),
  } as unknown as MonitoringService);
}

async function probe() {
  const [startupRes, readinessRes] = await Promise.all([startupGET(), readinessGET()]);
  const [startupBody, readinessBody] = await Promise.all([
    startupRes.json() as Promise<Record<string, unknown>>,
    readinessRes.json() as Promise<Record<string, unknown>>,
  ]);
  return {
    startup: { status: startupRes.status, body: startupBody },
    readiness: { status: readinessRes.status, body: readinessBody },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(startupStatusSvc.getStartupStatus).mockResolvedValue({
    status: "READY",
    started_at: new Date(),
    version: "test",
    instance_id: "test-instance",
  });
});

// ─── Case A ──────────────────────────────────────────────────────────────────

describe("Case A: all green → both routes agree on READY", () => {
  it("both return HTTP 200", async () => {
    applyState({ startupStatus: "READY", migrationReady: true, dbHealthy: true });

    const { startup, readiness } = await probe();

    expect(startup.status).toBe(200);
    expect(readiness.status).toBe(200);
  });

  it("both report is_ready true", async () => {
    applyState({ startupStatus: "READY", migrationReady: true, dbHealthy: true });

    const { startup, readiness } = await probe();

    expect(startup.body.is_ready).toBe(true);
    expect(readiness.body.is_ready).toBe(true);
  });
});

// ─── Case B ──────────────────────────────────────────────────────────────────

describe("Case B: migrations pending → both routes agree on NOT READY", () => {
  it("both return HTTP 503", async () => {
    applyState({ startupStatus: "READY", migrationReady: false, dbHealthy: true });

    const { startup, readiness } = await probe();

    expect(startup.status).toBe(503);
    expect(readiness.status).toBe(503);
  });

  it("both report is_ready false", async () => {
    applyState({ startupStatus: "READY", migrationReady: false, dbHealthy: true });

    const { startup, readiness } = await probe();

    expect(startup.body.is_ready).toBe(false);
    expect(readiness.body.is_ready).toBe(false);
  });

  it("startup route reports migration pending count in database_migrated", async () => {
    applyState({ startupStatus: "READY", migrationReady: false, dbHealthy: true });

    const { startup } = await probe();

    expect(startup.body.database_migrated).toBe(false);
    expect(startup.body.migration_pending).toBe(2);
  });
});

// ─── Case C ──────────────────────────────────────────────────────────────────

describe("Case C: startup NOT_STARTED → both routes agree on NOT READY", () => {
  it("both return HTTP 503", async () => {
    applyState({ startupStatus: "NOT_STARTED", migrationReady: true, dbHealthy: true });

    const { startup, readiness } = await probe();

    expect(startup.status).toBe(503);
    expect(readiness.status).toBe(503);
  });

  it("both report is_ready false", async () => {
    applyState({ startupStatus: "NOT_STARTED", migrationReady: true, dbHealthy: true });

    const { startup, readiness } = await probe();

    expect(startup.body.is_ready).toBe(false);
    expect(readiness.body.is_ready).toBe(false);
  });
});

// ─── Case D ──────────────────────────────────────────────────────────────────

describe("Case D: startup FAILED → both routes agree on NOT READY", () => {
  it("both return HTTP 503", async () => {
    applyState({ startupStatus: "FAILED", migrationReady: true, dbHealthy: true });

    const { startup, readiness } = await probe();

    expect(startup.status).toBe(503);
    expect(readiness.status).toBe(503);
  });

  it("both report is_ready false", async () => {
    applyState({ startupStatus: "FAILED", migrationReady: true, dbHealthy: true });

    const { startup, readiness } = await probe();

    expect(startup.body.is_ready).toBe(false);
    expect(readiness.body.is_ready).toBe(false);
  });
});

// ─── Case E ──────────────────────────────────────────────────────────────────

describe("Case E: DB unhealthy → both routes agree on NOT READY", () => {
  it("both return HTTP 503", async () => {
    applyState({ startupStatus: "READY", migrationReady: true, dbHealthy: false });

    const { startup, readiness } = await probe();

    expect(startup.status).toBe(503);
    expect(readiness.status).toBe(503);
  });

  it("both report is_ready false", async () => {
    applyState({ startupStatus: "READY", migrationReady: true, dbHealthy: false });

    const { startup, readiness } = await probe();

    expect(startup.body.is_ready).toBe(false);
    expect(readiness.body.is_ready).toBe(false);
  });

  it("startup route reflects database_connected false", async () => {
    applyState({ startupStatus: "READY", migrationReady: true, dbHealthy: false });

    const { startup } = await probe();

    expect(startup.body.database_connected).toBe(false);
  });
});

// ─── Disagreement protection ──────────────────────────────────────────────────

describe("No READY/503 disagreement between routes", () => {
  const cases: Array<[string, StateConfig, boolean]> = [
    ["all green", { startupStatus: "READY", migrationReady: true, dbHealthy: true }, true],
    ["pending migrations", { startupStatus: "READY", migrationReady: false, dbHealthy: true }, false],
    ["NOT_STARTED", { startupStatus: "NOT_STARTED", migrationReady: true, dbHealthy: true }, false],
    ["FAILED", { startupStatus: "FAILED", migrationReady: true, dbHealthy: true }, false],
    ["DB unhealthy", { startupStatus: "READY", migrationReady: true, dbHealthy: false }, false],
  ];

  it.each(cases)("%s — startup and readiness agree on is_ready=%s", async (_label, state, expected) => {
    applyState(state);
    const { startup, readiness } = await probe();
    expect(startup.body.is_ready).toBe(expected);
    expect(readiness.body.is_ready).toBe(expected);
    expect(startup.body.is_ready).toBe(readiness.body.is_ready);
  });
});
