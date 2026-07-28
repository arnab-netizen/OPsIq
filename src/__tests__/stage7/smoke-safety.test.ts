/**
 * S7-DC7: Smoke Safety Prevention Tests
 *
 * Proves that:
 * 1. assertDeterministicSmokeIdentity() rejects timestamp-based emails
 * 2. SMOKE_EMAIL is deterministic (no timestamp component)
 * 3. Pattern correctly identifies production contamination risk
 */

import { describe, it, expect } from "vitest";
import {
  SMOKE_EMAIL,
  TIMESTAMP_SMOKE_EMAIL_PATTERN,
  assertDeterministicSmokeIdentity,
} from "@/lib/smoke-identity";

describe("S7-DC7: Smoke safety — deterministic identity", () => {
  it("rejects timestamp-based email (production contamination vector)", () => {
    const timestampEmail = `opsiq-smoke+${Date.now()}@example.com`;
    expect(() => assertDeterministicSmokeIdentity(timestampEmail)).toThrow(
      /S7-DC7/
    );
  });

  it("rejects timestamp-based email from any recent Date.now() value", () => {
    const samples = [
      "opsiq-smoke+1719000000000@example.com",
      "opsiq-smoke+1700000000000@domain.com",
      "opsiq-smoke+1000000@test.com",
    ];
    for (const email of samples) {
      expect(() => assertDeterministicSmokeIdentity(email)).toThrow();
    }
  });

  it("allows deterministic smoke email", () => {
    expect(() => assertDeterministicSmokeIdentity(SMOKE_EMAIL)).not.toThrow();
  });

  it("allows non-smoke emails", () => {
    expect(() =>
      assertDeterministicSmokeIdentity("user@example.com")
    ).not.toThrow();
  });

  it("SMOKE_EMAIL has no timestamp component", () => {
    expect(TIMESTAMP_SMOKE_EMAIL_PATTERN.test(SMOKE_EMAIL)).toBe(false);
  });

  it("SMOKE_EMAIL is a valid email format", () => {
    expect(SMOKE_EMAIL).toMatch(/^[^@]+@[^@]+\.[^@]+$/);
  });

  it("timestamp pattern is correct", () => {
    expect(TIMESTAMP_SMOKE_EMAIL_PATTERN.test("opsiq-smoke+123456789@example.com")).toBe(true);
    expect(TIMESTAMP_SMOKE_EMAIL_PATTERN.test("opsiq-smoke@internal.opsiq.dev")).toBe(false);
    expect(TIMESTAMP_SMOKE_EMAIL_PATTERN.test("other+123@example.com")).toBe(false);
  });
});
