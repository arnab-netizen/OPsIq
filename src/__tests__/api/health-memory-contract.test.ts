/**
 * /api/health memory contract.
 *
 * Production defect this pins: /api/health returned HTTP 503 persistently
 * because the memory sub-check used heapUsed/heapTotal (committed-heap packing,
 * bounded at 100%) as a saturation signal. It read 94–98% on an instance with
 * healthy database latency, flat request latency and no OOM.
 *
 * Corrected contract:
 *   - availability is decided by blocking checks only (database, and memory
 *     only at CRITICAL headroom exhaustion);
 *   - HIGH pressure is a warning and must not change the HTTP status;
 *   - unmeasurable memory never marks the service unavailable;
 *   - diagnostic memory fields remain present;
 *   - readiness / startup semantics are unaffected by memory.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockQueryRaw, mockGetDbInstance } = vi.hoisted(() => {
  const mockQueryRaw = vi.fn();
  return {
    mockQueryRaw,
    mockGetDbInstance: vi.fn().mockResolvedValue({ $queryRawUnsafe: mockQueryRaw }),
  };
});

const { mockGetMemoryPressure } = vi.hoisted(() => ({
  mockGetMemoryPressure: vi.fn(),
}));

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
    classification: "INTERNAL_ERROR",
    statusCode: 503,
    message: "Server is having trouble",
    timestamp: new Date().toISOString(),
    context: {},
  }),
  reportError: vi.fn(),
}));

vi.mock("@/infra/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/middleware/monitoring.middleware", () => ({
  getMonitoringServiceInstance: vi.fn().mockReturnValue({
    checkReadiness: vi.fn().mockResolvedValue({
      database_healthy: true,
      database_latency_ms: 5,
      queue_healthy: true,
      queue_depth: 0,
      cache_healthy: true,
      external_services: {},
    }),
    checkStartup: vi.fn().mockResolvedValue({
      is_ready: true,
      config_loaded: true,
      database_migrated: true,
      routes_registered: 91,
      test_request_successful: true,
    }),
  }),
}));

vi.mock("@/infra/startup-orchestrator", () => ({
  ensureStartupComplete: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/services/startup-status", () => ({
  getStartupStatus: vi.fn().mockResolvedValue({
    status: "READY",
    started_at: new Date(),
    completed_at: new Date(),
    version: "test",
    instance_id: "test-instance",
  }),
}));

vi.mock("@/infra/memory-pressure", async () => {
  const actual = await vi.importActual<typeof import("@/infra/memory-pressure")>(
    "@/infra/memory-pressure"
  );
  return { ...actual, getMemoryPressure: mockGetMemoryPressure };
});

import { GET as healthGET } from "@/app/api/health/route";
import { GET as readinessGET } from "@/app/api/readiness/route";
import { GET as startupGET } from "@/app/api/startup/route";
import type { MemoryPressureSnapshot } from "@/infra/memory-pressure";

const MB = 1024 * 1024;

function snapshot(over: Partial<MemoryPressureSnapshot> = {}): MemoryPressureSnapshot {
  return {
    available: true,
    heapHeadroomUsedPercent: 3,
    heapUtilizationPercent: 60,
    heapUsedBytes: 60 * MB,
    heapTotalBytes: 100 * MB,
    heapLimitBytes: 2000 * MB,
    rssBytes: 220 * MB,
    externalBytes: 5 * MB,
    arrayBuffersBytes: 1 * MB,
    level: "LOW",
    ...over,
  };
}

type HealthBody = {
  status: string;
  timestamp: string;
  version: string;
  environment: string;
  checks: Record<string, Record<string, unknown>>;
};

beforeEach(() => {
  mockQueryRaw.mockReset();
  mockGetMemoryPressure.mockReset();
  mockGetMemoryPressure.mockReturnValue(snapshot());
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("(1) healthy startup and database with normal memory", () => {
  it("returns HTTP 200 and status healthy", async () => {
    mockQueryRaw.mockResolvedValueOnce([{ "?column?": 1 }]);

    const res = await healthGET();
    const body = (await res.json()) as HealthBody;

    expect(res.status).toBe(200);
    expect(body.status).toBe("healthy");
    expect(body.checks.database.status).toBe("healthy");
    expect(body.checks.memory.status).toBe("healthy");
  });
});

describe("(2) high heapUsed/heapTotal but low actual process pressure", () => {
  it("returns HTTP 200 — the production false positive is gone", async () => {
    mockQueryRaw.mockResolvedValueOnce([{ "?column?": 1 }]);
    // Exactly the production reading: 97% committed-heap packing, negligible
    // real headroom consumption.
    mockGetMemoryPressure.mockReturnValue(
      snapshot({
        heapUtilizationPercent: 97,
        heapHeadroomUsedPercent: 2.7,
        heapUsedBytes: 61 * MB,
        heapTotalBytes: 63 * MB,
        level: "LOW",
      })
    );

    const res = await healthGET();
    const body = (await res.json()) as HealthBody;

    expect(res.status).toBe(200);
    expect(body.status).toBe("healthy");
    expect(body.checks.memory.status).toBe("healthy");
    // The legacy ratio is still reported, it just no longer gates availability.
    expect(body.checks.memory.heapUtilizationPercent).toBe(97);
  });
});

describe("(3) genuine process-memory pressure", () => {
  it("returns HTTP 503 when heap headroom is exhausted", async () => {
    mockQueryRaw.mockResolvedValueOnce([{ "?column?": 1 }]);
    mockGetMemoryPressure.mockReturnValue(
      snapshot({ heapHeadroomUsedPercent: 97, level: "CRITICAL" })
    );

    const res = await healthGET();
    const body = (await res.json()) as HealthBody;

    expect(res.status).toBe(503);
    expect(body.status).toBe("degraded");
    expect(body.checks.memory.status).toBe("unhealthy");
  });
});

describe("(4) warning versus blocking status", () => {
  it("HIGH pressure reports a warning but keeps HTTP 200", async () => {
    mockQueryRaw.mockResolvedValueOnce([{ "?column?": 1 }]);
    mockGetMemoryPressure.mockReturnValue(
      snapshot({ heapHeadroomUsedPercent: 88, level: "HIGH" })
    );

    const res = await healthGET();
    const body = (await res.json()) as HealthBody;

    expect(res.status).toBe(200);
    expect(body.checks.memory.status).toBe("warning");
    // Warning is still visible in the aggregate status for operators.
    expect(body.status).toBe("degraded");
  });

  it("database failure remains blocking regardless of memory", async () => {
    mockQueryRaw.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const res = await healthGET();
    const body = (await res.json()) as HealthBody;

    expect(res.status).toBe(503);
    expect(body.checks.database.status).toBe("unhealthy");
  });
});

describe("(5) correct HTTP status mapping", () => {
  it.each([
    ["LOW", 0.5, 200],
    ["MEDIUM", 75, 200],
    ["HIGH", 88, 200],
    ["CRITICAL", 96, 503],
  ] as const)("level %s -> HTTP %i", async (level, pct, expected) => {
    mockQueryRaw.mockResolvedValueOnce([{ "?column?": 1 }]);
    mockGetMemoryPressure.mockReturnValue(
      snapshot({ level, heapHeadroomUsedPercent: pct })
    );

    const res = await healthGET();
    expect(res.status).toBe(expected);
  });
});

describe("(6) diagnostic fields remain present", () => {
  it("exposes both ratios plus byte-level diagnostics", async () => {
    mockQueryRaw.mockResolvedValueOnce([{ "?column?": 1 }]);

    const res = await healthGET();
    const body = (await res.json()) as HealthBody;
    const mem = body.checks.memory;

    expect(mem).toHaveProperty("usage");
    expect(mem).toHaveProperty("heapUsedPercentOfLimit");
    expect(mem).toHaveProperty("heapUtilizationPercent");
    expect(mem).toHaveProperty("heapUsedMb");
    expect(mem).toHaveProperty("heapTotalMb");
    expect(mem).toHaveProperty("heapLimitMb");
    expect(mem).toHaveProperty("rssMb");
    expect(mem).toHaveProperty("externalMb");
    expect(mem).toHaveProperty("arrayBuffersMb");
    expect(mem).toHaveProperty("level");
    expect(body.checks.uptime).toHaveProperty("uptimeSeconds");
    expect(body.checks.runtime).toHaveProperty("nodeVersion");
  });
});

describe("(8) unavailable memory metrics fail safe at the route", () => {
  it("reports unknown without taking the service down", async () => {
    mockQueryRaw.mockResolvedValueOnce([{ "?column?": 1 }]);
    mockGetMemoryPressure.mockReturnValue(
      snapshot({
        available: false,
        heapHeadroomUsedPercent: 0,
        heapUtilizationPercent: 0,
        heapUsedBytes: 0,
        heapTotalBytes: 0,
        heapLimitBytes: 0,
        rssBytes: 0,
        externalBytes: 0,
        arrayBuffersBytes: 0,
        level: "LOW",
      })
    );

    const res = await healthGET();
    const body = (await res.json()) as HealthBody;

    expect(res.status).toBe(200);
    expect(body.checks.memory.status).toBe("unknown");
  });
});

describe("(7) readiness and startup semantics remain independent of memory", () => {
  it("readiness stays 200/READY under CRITICAL memory pressure", async () => {
    mockGetMemoryPressure.mockReturnValue(
      snapshot({ heapHeadroomUsedPercent: 99, level: "CRITICAL" })
    );

    const res = await readinessGET();
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body.is_ready).toBe(true);
    // Readiness is a dependency gate — memory is not one of its inputs.
    expect(body).not.toHaveProperty("memory");
  });

  it("startup stays 200/ready under CRITICAL memory pressure", async () => {
    mockGetMemoryPressure.mockReturnValue(
      snapshot({ heapHeadroomUsedPercent: 99, level: "CRITICAL" })
    );

    const res = await startupGET();
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body.is_ready).toBe(true);
    expect(body).not.toHaveProperty("memory");
  });
});

describe("(10) no secret or internal identifier exposure", () => {
  it("memory diagnostics contain no environment values or connection details", async () => {
    mockQueryRaw.mockResolvedValueOnce([{ "?column?": 1 }]);

    const res = await healthGET();
    const text = JSON.stringify(((await res.json()) as HealthBody).checks.memory);

    expect(text).not.toMatch(/postgres|password|secret|token|@|:\/\//i);
    expect(text).not.toContain("DATABASE_URL");
    expect(text).not.toContain("CRON_SECRET");
    expect(text).not.toContain("OPSIQ_PRIVATE_WORKSPACE_ID");
  });

  it("database failure detail stays governed", async () => {
    mockQueryRaw.mockRejectedValueOnce(
      new Error("password authentication failed for user 'postgres'")
    );

    const res = await healthGET();
    const body = (await res.json()) as HealthBody;
    const err = String(body.checks.database.error ?? "");

    expect(err).not.toContain("postgres");
    expect(err).not.toContain("password");
  });
});
