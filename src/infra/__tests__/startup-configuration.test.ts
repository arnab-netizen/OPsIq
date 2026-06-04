/**
 * Bootable Production — Startup Configuration + FAILED-State Recovery
 *
 * Proves:
 *  1. Startup configuration succeeds with only DATABASE_URL (NODE_ENV=production,
 *     no Stripe vars present) — Stripe is NOT required to boot.
 *  2. Startup configuration fails (fail-closed) when DATABASE_URL is absent.
 *  3. Missing Stripe is a non-blocking warning (billing disabled), never a
 *     startup failure.
 *  4. A previously persisted FAILED startup state caused by configuration can be
 *     re-evaluated and recover to READY once config is valid, WITHOUT manual DB
 *     deletion — while a real database failure still fails again (no silent pass).
 *
 * These exercise the active startup path (startup-orchestrator), which is the
 * module driven by instrumentation.register() and /api/readiness.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mutable, hoisted test state shared with the module mocks below.
const h = vi.hoisted(() => ({
  dbFails: false,
  persistedStatus: "FAILED" as "NOT_STARTED" | "STARTING" | "READY" | "FAILED",
  persistedError: "Configuration is invalid" as string | null,
  setStartupStatus: vi.fn(async () => {}),
}));

vi.mock("@/lib/db", () => ({
  getDbInstance: vi.fn(async () => ({
    $queryRawUnsafe: vi.fn(async () => {
      if (h.dbFails) throw new Error("Connection refused");
      return [{ result: 1 }];
    }),
  })),
}));

vi.mock("@/services/startup-status", () => ({
  getStartupStatus: vi.fn(async () => ({
    status: h.persistedStatus,
    started_at: new Date(),
    completed_at: null,
    error: h.persistedError,
    version: "test",
    instance_id: "test",
  })),
  setStartupStatus: h.setStartupStatus,
}));

import {
  checkStartupConfiguration,
  ensureStartupComplete,
} from "@/infra/startup-orchestrator";

describe("Bootable Production: startup configuration", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    h.dbFails = false;
    h.persistedStatus = "FAILED";
    h.persistedError = "Configuration is invalid";
    h.setStartupStatus.mockClear();
    // Start from a clean Stripe-free environment for each test.
    delete process.env.STRIPE_API_KEY;
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    process.env.NODE_ENV = "production";
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/db?schema=public";
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("succeeds with only DATABASE_URL present and no Stripe vars (Stripe not required to boot)", () => {
    const result = checkStartupConfiguration();
    expect(result.valid).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.billingEnabled).toBe(false);
    // Missing Stripe must surface as a warning, not a failure.
    expect(result.warnings.join(" ").toLowerCase()).toContain("billing");
  });

  it("fails (fail-closed) when DATABASE_URL is absent", () => {
    delete process.env.DATABASE_URL;
    const result = checkStartupConfiguration();
    expect(result.valid).toBe(false);
    expect(result.missing).toContain("DATABASE_URL");
  });

  it("marks billing enabled and emits no Stripe warning when a Stripe key is present", () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_example";
    const result = checkStartupConfiguration();
    expect(result.valid).toBe(true);
    expect(result.billingEnabled).toBe(true);
    expect(result.warnings.join(" ").toLowerCase()).not.toContain("billing");
  });

  it("treats missing Stripe as non-blocking: configuration is still valid without any Stripe var", () => {
    // No STRIPE_* set (cleared in beforeEach).
    const result = checkStartupConfiguration();
    expect(result.valid).toBe(true);
  });
});

describe("Bootable Production: FAILED-state recovery", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    h.dbFails = false;
    h.persistedStatus = "FAILED"; // simulate a previously poisoned instance
    h.persistedError = "Configuration is invalid";
    h.setStartupStatus.mockClear();
    delete process.env.STRIPE_API_KEY;
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    process.env.NODE_ENV = "production";
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/db?schema=public";
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("re-evaluates a persisted FAILED state and recovers to READY when config is now valid (no manual DB deletion)", async () => {
    await expect(ensureStartupComplete()).resolves.toBeUndefined();
    const transitions = h.setStartupStatus.mock.calls.map((c) => c[0]);
    expect(transitions).toContain("READY");
  });

  it("does not silently pass a real database failure: re-evaluation still fails and persists FAILED", async () => {
    h.dbFails = true;
    await expect(ensureStartupComplete()).rejects.toBeTruthy();
    const transitions = h.setStartupStatus.mock.calls.map((c) => c[0]);
    expect(transitions).toContain("FAILED");
    expect(transitions).not.toContain("READY");
  });
});
