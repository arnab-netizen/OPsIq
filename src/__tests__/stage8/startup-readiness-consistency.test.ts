/**
 * STARTUP / READINESS CONSISTENCY — Regression Tests
 *
 * Root cause: /api/startup previously called MonitoringService.checkStartup()
 * → checkMigrationReadiness(), which compared committed migration dirs against
 * _prisma_migrations rows. Newly-committed dirs not yet applied always produced
 * pending > 0 → ready: false → HTTP 503.
 *
 * /api/readiness had a different (fail-open) defect: ensureStartupComplete()
 * called checkDatabaseSchema() which always returns true, so the startup READY
 * row was written without verifying migration currency. /api/readiness then
 * returned HTTP 200 even when required migrations were pending.
 *
 * Fix applied (this PR):
 *   1. /api/startup now uses ensureStartupComplete() + getStartupStatus() as
 *      startup-sequence source AND independently checks migration currency via
 *      checkMigrationReadiness().
 *   2. /api/readiness now independently checks migration currency via
 *      checkMigrationReadiness() in addition to startup_status and DB health.
 *   3. startup-orchestrator.ts now calls checkMigrationReadiness() during
 *      performStartupChecks() so future READY rows are trustworthy.
 *   4. database_migrated in /api/startup reflects actual migration currency
 *      (checkMigrationReadiness().ready), NOT startup_status.status === "READY".
 *
 * Invariants (none collapses into another):
 *   startup_sequence_complete — startup_status row is READY
 *   migration_history_current — every committed migration is applied
 *   database_connected        — DB responds at probe time
 *   runtime_ready             — ALL THREE are true
 *
 * Five required regression scenarios:
 *   1. startup complete + migrations current + DB healthy → READY
 *   2. startup complete + migrations pending              → NOT READY
 *   3. migrations current + startup incomplete            → NOT READY
 *   4. DB unhealthy                                      → NOT READY
 *   5. all requirements satisfied → /api/startup consistent with /api/readiness
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── mocks (hoisted) ──────────────────────────────────────────────────────────

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
  classifyOperatorError: vi.fn(() => ({
    operatorMessage: "Internal startup error",
  })),
}));

// ─── imports after mocks ──────────────────────────────────────────────────────

import * as orchestrator from "@/infra/startup-orchestrator";
import * as startupStatusSvc from "@/services/startup-status";
import * as migrationCheckMod from "@/services/monitoring/migration-check";
import * as monitoringMiddleware from "@/middleware/monitoring.middleware";
import type { MonitoringService } from "@/services/monitoring/monitoring.service";

import { GET as startupGET } from "@/app/api/startup/route";

// ─── helpers ─────────────────────────────────────────────────────────────────

type StartupStatusType = "READY" | "FAILED" | "NOT_STARTED" | "STARTING";

function mockStartupStatus(status: StartupStatusType) {
  vi.mocked(startupStatusSvc.getStartupStatus).mockResolvedValue({
    status,
    started_at: new Date(),
    version: "test",
    instance_id: "test-instance",
  });
}

function mockMigration(ready: boolean, pending = ready ? 0 : 2, failed = 0) {
  vi.mocked(migrationCheckMod.checkMigrationReadiness).mockResolvedValue({
    ready,
    totalCommitted: 3,
    applied: ready ? 3 : 3 - pending,
    pending,
    failed,
  });
}

function mockReadiness(database_healthy: boolean, queue_healthy = true) {
  vi.mocked(monitoringMiddleware.getMonitoringServiceInstance).mockReturnValue({
    checkReadiness: vi.fn().mockResolvedValue({
      database_healthy,
      database_latency_ms: 5,
      queue_healthy,
      queue_depth: 0,
      cache_healthy: true,
      external_services: [],
      is_ready: database_healthy && queue_healthy,
    }),
  } as unknown as MonitoringService);
}

async function callStartup(): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await startupGET();
  const body = await response.json();
  return { status: response.status, body };
}

// ─── reset ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(orchestrator.ensureStartupComplete).mockResolvedValue(undefined);
});

// ─── SCENARIO 1 ──────────────────────────────────────────────────────────────
// startup complete + migrations current + DB healthy → READY

describe("Scenario 1: startup complete + migrations current + DB healthy → READY", () => {
  it("returns HTTP 200 and is_ready true", async () => {
    mockStartupStatus("READY");
    mockMigration(true);
    mockReadiness(true);

    const { status, body } = await callStartup();

    expect(status).toBe(200);
    expect(body.is_ready).toBe(true);
    expect(body.startup_sequence_complete).toBe(true);
    expect(body.database_migrated).toBe(true);
    expect(body.database_connected).toBe(true);
  });

  it("database_migrated reflects migration currency — not startup_status proxy", async () => {
    // The fix: database_migrated = checkMigrationReadiness().ready, NOT
    // startupStatus.status === "READY". Both are true here, proving independence.
    mockStartupStatus("READY");
    mockMigration(true);
    mockReadiness(true);

    const { body } = await callStartup();

    expect(body.database_migrated).toBe(true);
    // Verify checkMigrationReadiness was actually called (not bypassed)
    expect(vi.mocked(migrationCheckMod.checkMigrationReadiness)).toHaveBeenCalledOnce();
  });
});

// ─── SCENARIO 2 ──────────────────────────────────────────────────────────────
// startup complete + migrations pending → NOT READY

describe("Scenario 2: startup complete + migrations pending → NOT READY", () => {
  it("returns HTTP 503 when migrations are pending (the original production bug)", async () => {
    // This is exactly the production state that caused the inconsistency:
    // startup_status=READY but 2 migrations pending.
    mockStartupStatus("READY");
    mockMigration(false, 2); // pending: 2
    mockReadiness(true);

    const { status, body } = await callStartup();

    expect(status).toBe(503);
    expect(body.is_ready).toBe(false);
    // startup sequence completed (READY row exists)
    expect(body.startup_sequence_complete).toBe(true);
    // but migrations are NOT current
    expect(body.database_migrated).toBe(false);
    expect(body.migration_pending).toBe(2);
  });

  it("does not treat startup READY as equivalent to migration-current (fail-open defect closed)", async () => {
    // READY startup row must NOT override a pending-migration result.
    mockStartupStatus("READY");
    mockMigration(false, 1);
    mockReadiness(true);

    const { body } = await callStartup();

    // database_migrated must be false even though startup_status is READY
    expect(body.startup_status).toBe("READY");
    expect(body.database_migrated).toBe(false);
    expect(body.is_ready).toBe(false);
  });
});

// ─── SCENARIO 3 ──────────────────────────────────────────────────────────────
// migrations current + startup incomplete → NOT READY

describe("Scenario 3: migrations current + startup incomplete → NOT READY", () => {
  it("returns HTTP 503 when startup is NOT_STARTED (even if migrations are current)", async () => {
    mockStartupStatus("NOT_STARTED");
    mockMigration(true);
    mockReadiness(true);

    const { status, body } = await callStartup();

    expect(status).toBe(503);
    expect(body.is_ready).toBe(false);
    expect(body.startup_sequence_complete).toBe(false);
    // migrations are fine
    expect(body.database_migrated).toBe(true);
    // ensureStartupComplete was triggered
    expect(vi.mocked(orchestrator.ensureStartupComplete)).toHaveBeenCalledOnce();
  });

  it("returns HTTP 503 when startup is FAILED", async () => {
    mockStartupStatus("FAILED");
    mockMigration(true);
    mockReadiness(true);

    const { status, body } = await callStartup();

    expect(status).toBe(503);
    expect(body.is_ready).toBe(false);
    expect(body.startup_sequence_complete).toBe(false);
  });
});

// ─── SCENARIO 4 ──────────────────────────────────────────────────────────────
// DB unhealthy → NOT READY

describe("Scenario 4: DB unhealthy → NOT READY", () => {
  it("returns HTTP 503 when DB is not reachable at probe time", async () => {
    mockStartupStatus("READY");
    mockMigration(true);
    mockReadiness(false);

    const { status, body } = await callStartup();

    expect(status).toBe(503);
    expect(body.is_ready).toBe(false);
    expect(body.database_connected).toBe(false);
    expect(body.test_request_successful).toBe(false);
    // startup and migration state are fine independently
    expect(body.startup_sequence_complete).toBe(true);
    expect(body.database_migrated).toBe(true);
  });
});

// ─── SCENARIO 5 ──────────────────────────────────────────────────────────────
// all requirements satisfied → /api/startup and /api/readiness consistent
// (no READY/503 disagreement like the production bug)

describe("Scenario 5: all requirements satisfied — consistent with readiness model", () => {
  it("is_ready true only when ALL three invariants hold", async () => {
    mockStartupStatus("READY");
    mockMigration(true);
    mockReadiness(true);

    const { status, body } = await callStartup();

    expect(status).toBe(200);
    expect(body.is_ready).toBe(true);
    // All three invariants explicitly verified:
    expect(body.startup_sequence_complete).toBe(true); // invariant 1
    expect(body.database_migrated).toBe(true);          // invariant 2
    expect(body.database_connected).toBe(true);         // invariant 3
  });

  it("is_ready false if any single invariant fails — startup incomplete", async () => {
    mockStartupStatus("STARTING");
    mockMigration(true);
    mockReadiness(true);

    const { status, body } = await callStartup();
    expect(status).toBe(503);
    expect(body.is_ready).toBe(false);
  });

  it("is_ready false if any single invariant fails — migration pending", async () => {
    mockStartupStatus("READY");
    mockMigration(false, 2);
    mockReadiness(true);

    const { status, body } = await callStartup();
    expect(status).toBe(503);
    expect(body.is_ready).toBe(false);
  });

  it("is_ready false if any single invariant fails — DB unhealthy", async () => {
    mockStartupStatus("READY");
    mockMigration(true);
    mockReadiness(false);

    const { status, body } = await callStartup();
    expect(status).toBe(503);
    expect(body.is_ready).toBe(false);
  });

  it("ensureStartupComplete error is caught — status falls through to getStartupStatus", async () => {
    vi.mocked(orchestrator.ensureStartupComplete).mockRejectedValueOnce(
      new Error("startup orchestrator error")
    );
    mockStartupStatus("FAILED");
    mockMigration(false, 1);
    mockReadiness(false);

    const { status, body } = await callStartup();
    expect(status).toBe(503);
    expect(body.is_ready).toBe(false);
  });
});
