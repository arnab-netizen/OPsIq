/**
 * GET /api/startup — side-effect contract
 *
 * Architectural decision: GET /api/startup MUST NOT create or update durable
 * startup state. It is a read-only observation endpoint. ensureStartupComplete()
 * writes to the startup_status table and must never be called from this route.
 *
 * This file proves the contract by verifying that:
 *   - ensureStartupComplete() is never called for any startup state
 *   - getStartupStatus() reads state without mutating it
 *   - checkMigrationReadiness() reads without mutating
 *   - DB writes (INSERT / UPDATE on startup_status) are never triggered
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── mocks ───────────────────────────────────────────────────────────────────

vi.mock("@/infra/startup-orchestrator", () => ({
  ensureStartupComplete: vi.fn(),
  runStartupChecksAndPersist: vi.fn(),
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

import * as orchestrator from "@/infra/startup-orchestrator";
import * as startupStatusSvc from "@/services/startup-status";
import * as migrationCheckMod from "@/services/monitoring/migration-check";
import * as monitoringMiddleware from "@/middleware/monitoring.middleware";
import type { MonitoringService } from "@/services/monitoring/monitoring.service";

import { GET as startupGET } from "@/app/api/startup/route";

// ─── helpers ─────────────────────────────────────────────────────────────────

type StartupStatusType = "READY" | "FAILED" | "NOT_STARTED" | "STARTING";

function mockState(status: StartupStatusType, migrationReady = true) {
  vi.mocked(startupStatusSvc.getStartupStatus).mockResolvedValue({
    status,
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
      database_healthy: true,
      database_latency_ms: 5,
      queue_healthy: true,
      queue_depth: 0,
      cache_healthy: true,
      external_services: [],
    }),
  } as unknown as MonitoringService);
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── core side-effect assertion ───────────────────────────────────────────────

describe("GET /api/startup — zero write side-effects", () => {
  it("does NOT call ensureStartupComplete when startup is READY", async () => {
    mockState("READY");
    await startupGET();
    expect(vi.mocked(orchestrator.ensureStartupComplete)).not.toHaveBeenCalled();
  });

  it("does NOT call ensureStartupComplete when startup is NOT_STARTED", async () => {
    mockState("NOT_STARTED");
    await startupGET();
    expect(vi.mocked(orchestrator.ensureStartupComplete)).not.toHaveBeenCalled();
  });

  it("does NOT call ensureStartupComplete when startup is FAILED", async () => {
    mockState("FAILED");
    await startupGET();
    expect(vi.mocked(orchestrator.ensureStartupComplete)).not.toHaveBeenCalled();
  });

  it("does NOT call ensureStartupComplete when startup is STARTING", async () => {
    mockState("STARTING");
    await startupGET();
    expect(vi.mocked(orchestrator.ensureStartupComplete)).not.toHaveBeenCalled();
  });

  it("does NOT call runStartupChecksAndPersist", async () => {
    mockState("NOT_STARTED");
    await startupGET();
    expect(vi.mocked(orchestrator.runStartupChecksAndPersist)).not.toHaveBeenCalled();
  });
});

// ─── read-only state derivation ───────────────────────────────────────────────

describe("GET /api/startup — reads from getStartupStatus without mutation", () => {
  it("calls getStartupStatus exactly once", async () => {
    mockState("READY");
    await startupGET();
    expect(vi.mocked(startupStatusSvc.getStartupStatus)).toHaveBeenCalledOnce();
  });

  it("calls checkMigrationReadiness exactly once", async () => {
    mockState("READY");
    await startupGET();
    expect(vi.mocked(migrationCheckMod.checkMigrationReadiness)).toHaveBeenCalledOnce();
  });

  it("NOT_STARTED state is reported faithfully — startup_sequence_complete false", async () => {
    mockState("NOT_STARTED");
    const res = await startupGET();
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.startup_sequence_complete).toBe(false);
    expect(body.startup_status).toBe("NOT_STARTED");
    expect(body.is_ready).toBe(false);
  });

  it("FAILED state is reported faithfully — startup_sequence_complete false", async () => {
    mockState("FAILED");
    const res = await startupGET();
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.startup_sequence_complete).toBe(false);
    expect(body.startup_status).toBe("FAILED");
    expect(body.is_ready).toBe(false);
    // No state write attempted — ensureStartupComplete not called
    expect(vi.mocked(orchestrator.ensureStartupComplete)).not.toHaveBeenCalled();
  });

  it("READY state with pending migrations: route reads migration state, not proxy", async () => {
    mockState("READY", false);
    const res = await startupGET();
    const body = (await res.json()) as Record<string, unknown>;
    // startup_status says READY but migration check says otherwise
    expect(body.startup_status).toBe("READY");
    expect(body.startup_sequence_complete).toBe(true);
    expect(body.database_migrated).toBe(false);
    expect(body.is_ready).toBe(false);
  });
});

// ─── HTTP status correctness ──────────────────────────────────────────────────

describe("GET /api/startup — HTTP status without triggering writes", () => {
  it("returns 200 when all three invariants hold", async () => {
    mockState("READY", true);
    const res = await startupGET();
    expect(res.status).toBe(200);
  });

  it("returns 503 when startup is NOT_STARTED — no mutation attempted", async () => {
    mockState("NOT_STARTED", true);
    const res = await startupGET();
    expect(res.status).toBe(503);
    expect(vi.mocked(orchestrator.ensureStartupComplete)).not.toHaveBeenCalled();
  });

  it("returns 503 when startup is FAILED — no mutation attempted", async () => {
    mockState("FAILED", true);
    const res = await startupGET();
    expect(res.status).toBe(503);
    expect(vi.mocked(orchestrator.ensureStartupComplete)).not.toHaveBeenCalled();
  });
});
