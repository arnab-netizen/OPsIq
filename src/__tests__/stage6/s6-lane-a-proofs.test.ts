/**
 * Factory Stage 6 — LANE_A Proof Tests
 *
 * Non-DB assertions proving S6-I2, S6-I3, S6-I10.
 * No postgres service required. All db calls are mocked.
 *
 * S6-I2: deployment-preflight exits 1 when DATABASE_URL is absent
 * S6-I3: /api/readiness response does not expose startup_error
 * S6-I10: /api/health HTTP status reflects actual health (200/503)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";

// ─── Hoisted mock state ───────────────────────────────────────────────────────

const { mockQueryRaw, mockGetDbInstance } = vi.hoisted(() => {
  const mockQueryRaw = vi.fn();
  return {
    mockQueryRaw,
    mockGetDbInstance: vi.fn().mockResolvedValue({ $queryRawUnsafe: mockQueryRaw }),
  };
});

const { mockMonitoringService, mockEnsureStartup, mockGetStartupStatus } = vi.hoisted(() => ({
  mockMonitoringService: {
    checkReadiness: vi.fn().mockResolvedValue({
      database_healthy: true,
      database_latency_ms: 5,
      queue_healthy: true,
      queue_depth: 0,
      cache_healthy: true,
      external_services: {},
    }),
  },
  mockEnsureStartup: vi.fn().mockResolvedValue(undefined),
  mockGetStartupStatus: vi.fn().mockResolvedValue({
    status: "READY",
    started_at: new Date(),
    completed_at: new Date(),
    version: "test",
    instance_id: "test-instance",
  }),
}));

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  db: { $queryRawUnsafe: mockQueryRaw },
  getDbInstance: mockGetDbInstance,
}));

vi.mock("@/infra/startup-state", () => ({
  isStartupComplete: vi.fn().mockReturnValue(false),
}));

vi.mock("@/services/production/retention-cleanup", () => ({
  cleanupOldRecords: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/infra/error-tracking", () => ({
  classifyError: vi.fn().mockReturnValue({
    classification: "DATABASE_ERROR",
    statusCode: 503,
    message: "Server is having trouble connecting to the database",
    timestamp: new Date().toISOString(),
    context: {},
  }),
  reportError: vi.fn(),
}));

vi.mock("@/infra/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/middleware/monitoring.middleware", () => ({
  getMonitoringServiceInstance: vi.fn().mockReturnValue(mockMonitoringService),
}));

vi.mock("@/infra/startup-orchestrator", () => ({
  ensureStartupComplete: mockEnsureStartup,
}));

vi.mock("@/services/startup-status", () => ({
  getStartupStatus: mockGetStartupStatus,
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

import { GET as healthGET } from "@/app/api/health/route";
import { GET as readinessGET } from "@/app/api/readiness/route";
import { isProductionRuntime, IN_MEMORY_DEMO_WRITE_FEATURES } from "@/lib/demo-write-guard";
import { withErrorHandling } from "@/infra/error-handler";
import { NextRequest } from "next/server";

// ─── S6-I2: Preflight exit code ───────────────────────────────────────────────

describe("S6-I2: deployment-preflight exits 1 when DATABASE_URL absent", () => {
  it("exits 1 when DATABASE_URL is not in environment", () => {
    const env = { ...process.env };
    delete env.DATABASE_URL;
    delete env.DATABASE_URL_TEST;
    delete env.TEST_DATABASE_URL;

    const result = spawnSync(
      process.execPath,
      [path.join(process.cwd(), "scripts/deployment-preflight.mjs")],
      { env, encoding: "utf-8" }
    );

    expect(result.status, "preflight must exit 1 without DATABASE_URL").toBe(1);
  });

  it("stdout reports DATABASE_URL as a blocker when absent", () => {
    const env = { ...process.env };
    delete env.DATABASE_URL;
    delete env.DATABASE_URL_TEST;
    delete env.TEST_DATABASE_URL;

    const result = spawnSync(
      process.execPath,
      [path.join(process.cwd(), "scripts/deployment-preflight.mjs")],
      { env, encoding: "utf-8" }
    );

    expect(result.stdout).toContain("DATABASE_URL");
    expect(result.stdout).toMatch(/BLOCKED|Blockers/);
  });
});

// ─── S6-I3: Readiness response field safety ───────────────────────────────────

describe("S6-I3: /api/readiness does not expose startup_error", () => {
  it("response JSON does not contain startup_error field", async () => {
    const response = await readinessGET();
    const body = (await response.json()) as Record<string, unknown>;

    expect("startup_error" in body).toBe(false);
  });

  it("response contains only the declared public fields", async () => {
    const response = await readinessGET();
    const body = (await response.json()) as Record<string, unknown>;

    const allowedFields = new Set([
      "startup_complete",
      "startup_status",
      "database_healthy",
      "database_latency_ms",
      "queue_healthy",
      "queue_depth",
      "cache_healthy",
      "external_services",
      "is_ready",
      "status",
    ]);

    for (const key of Object.keys(body)) {
      expect(
        allowedFields.has(key),
        `Unexpected field in readiness response: "${key}"`
      ).toBe(true);
    }
  });

  it("startup_status READY does not expose internal error details", async () => {
    mockGetStartupStatus.mockResolvedValueOnce({
      status: "FAILED",
      started_at: new Date(),
      error: "OPSIQ_PRIVATE_WORKSPACE_ID=secret-uuid-here",
      version: "test",
      instance_id: "test-instance",
    });

    const response = await readinessGET();
    const text = await response.text();

    expect(text).not.toContain("OPSIQ_PRIVATE_WORKSPACE_ID");
    expect(text).not.toContain("secret-uuid-here");
  });
});

// ─── S6-I10: Health HTTP status reflects health ───────────────────────────────

describe("S6-I10: /api/health HTTP status reflects actual health", () => {
  beforeEach(() => {
    mockQueryRaw.mockReset();
  });

  it("returns HTTP 200 when database probe succeeds", async () => {
    mockQueryRaw.mockResolvedValueOnce([{ "?column?": 1 }]);

    const response = await healthGET();

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.status).toBe("healthy");
    expect((body.checks as Record<string, Record<string, unknown>>).database.status).toBe("healthy");
  });

  it("returns HTTP 503 when database probe throws ECONNREFUSED", async () => {
    mockQueryRaw.mockRejectedValueOnce(
      new Error("ECONNREFUSED: connect ECONNREFUSED 127.0.0.1:5432")
    );

    const response = await healthGET();

    expect(response.status).toBe(503);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.status).toBe("degraded");
    expect((body.checks as Record<string, Record<string, unknown>>).database.status).toBe("unhealthy");
  });

  it("DB error in health response does not expose connection string details", async () => {
    mockQueryRaw.mockRejectedValueOnce(
      new Error("password authentication failed for user 'postgres'")
    );

    const response = await healthGET();
    const body = (await response.json()) as {
      checks: { database: { error?: string; status: string } };
    };

    const dbEntry = body.checks.database;
    expect(dbEntry.status).toBe("unhealthy");

    const errorMsg = dbEntry.error ?? "";
    expect(errorMsg).not.toContain("postgres");
    expect(errorMsg).not.toContain("password");
    expect(errorMsg).not.toContain("authentication failed");
  });

  it("health response always includes timestamp and version fields", async () => {
    mockQueryRaw.mockResolvedValueOnce([{ "?column?": 1 }]);

    const response = await healthGET();
    const body = (await response.json()) as Record<string, unknown>;

    expect(typeof body.timestamp).toBe("string");
    expect(typeof body.version).toBe("string");
    expect(typeof body.environment).toBe("string");
  });
});

// ─── S6-I11: Production-safe feature controls ─────────────────────────────────

describe("S6-I11: production-safe feature controls", () => {
  let savedNodeEnv: string | undefined;

  beforeEach(() => {
    savedNodeEnv = process.env.NODE_ENV;
  });

  afterEach(() => {
    process.env.NODE_ENV = savedNodeEnv;
  });

  it("isProductionRuntime returns true when NODE_ENV=production", () => {
    process.env.NODE_ENV = "production";
    expect(isProductionRuntime()).toBe(true);
  });

  it("isProductionRuntime returns false when NODE_ENV=test", () => {
    process.env.NODE_ENV = "test";
    expect(isProductionRuntime()).toBe(false);
  });

  it("IN_MEMORY_DEMO_WRITE_FEATURES is empty — no demo-only write features remain", () => {
    // All growth write routes are now DB-backed with audit events.
    // This assertion ensures no future regression adds demo-only features silently.
    expect(IN_MEMORY_DEMO_WRITE_FEATURES).toHaveLength(0);
  });

  it("error handler hides details field in production", async () => {
    process.env.NODE_ENV = "production";
    const handler = vi.fn(async () => {
      throw new Error("ECONNREFUSED internal database details");
    });

    const wrapped = withErrorHandling(handler);
    const req = new NextRequest("http://localhost/api/test", { method: "GET" });
    const response = await wrapped(req);

    const body = (await response.json()) as Record<string, unknown>;
    expect(body.details).toBeUndefined();
  });
});
