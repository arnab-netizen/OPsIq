/**
 * parseBusinessIdFromTaskKey — pure unit tests (process-execution-bridge.ts).
 *
 * Added alongside the fresh-cockpit-priority-materialisation fix: this is the function
 * POST /api/owner/process-execution now uses to recover the businessId a PROCESS_CORRECTION/
 * CASH_PROFIT taskKey was minted for, when the client didn't otherwise supply one. It must be the
 * exact inverse of bridgeCorrection/bridgeCashSignal's own taskKey construction.
 */
import { describe, it, expect } from "vitest";
import { randomUUID } from "crypto";
import { parseBusinessIdFromTaskKey } from "@/domain/owner-mode/process-execution-bridge";

describe("parseBusinessIdFromTaskKey", () => {
  it("recovers the businessId from a business-scoped CASH_PROFIT taskKey", () => {
    const biz = randomUUID();
    expect(parseBusinessIdFromTaskKey(`cp:${biz}:CASH_SAFETY_RISK`)).toBe(biz);
  });

  it("recovers the businessId from a business-scoped PROCESS_CORRECTION taskKey", () => {
    const biz = randomUUID();
    expect(parseBusinessIdFromTaskKey(`pc:${biz}:some-correction-id-with-colons:extra`)).toBe(biz);
  });

  it("returns null for the workspace-level (no-businessId) CASH_PROFIT taskKey shape", () => {
    expect(parseBusinessIdFromTaskKey("cp:MISSING_UNIT_ECONOMICS")).toBeNull();
  });

  it("returns null for the workspace-level (no-businessId) PROCESS_CORRECTION taskKey shape", () => {
    expect(parseBusinessIdFromTaskKey("pc:some-correction-id")).toBeNull();
  });

  it("returns null for every genuinely workspace-level family prefix", () => {
    expect(parseBusinessIdFromTaskKey("wl:overload")).toBeNull();
    expect(parseBusinessIdFromTaskKey("cap:missing_integration")).toBeNull();
    expect(parseBusinessIdFromTaskKey("sop:correction-1")).toBeNull();
    expect(parseBusinessIdFromTaskKey("tr:correction-1:role_gap")).toBeNull();
    expect(parseBusinessIdFromTaskKey("eff:correction-1")).toBeNull();
  });

  it("returns null for a STARTUP_MODE taskKey (businessId is a column there, never embedded in the key)", () => {
    expect(parseBusinessIdFromTaskKey("startup_12345678_task_1")).toBeNull();
  });

  it("returns null when the segment after the prefix is not a real UUID (never fabricates a match)", () => {
    expect(parseBusinessIdFromTaskKey("cp:not-a-uuid:CASH_SAFETY_RISK")).toBeNull();
    expect(parseBusinessIdFromTaskKey("pc:12345:corr")).toBeNull();
  });

  it("returns null for an empty or unrecognised taskKey", () => {
    expect(parseBusinessIdFromTaskKey("")).toBeNull();
    expect(parseBusinessIdFromTaskKey("implement-pricing-strategy")).toBeNull();
  });

  it("is case-insensitive on the UUID segment (matches Prisma's own uuid formatting)", () => {
    const biz = randomUUID().toUpperCase();
    expect(parseBusinessIdFromTaskKey(`cp:${biz}:CASH_SAFETY_RISK`)).toBe(biz);
  });
});
