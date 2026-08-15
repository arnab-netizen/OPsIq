import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * P0-03 (production trust/governance closure) — unit tests.
 *
 * evaluateEngagementKPIHealth() previously fabricated a "perfectly healthy,
 * low risk" score (healthScore: 1, riskLevel: "low") whenever
 * getKPIsForEngagement() threw for ANY reason — a DB error, schema drift, a
 * malformed row, a transient failure. That value was persisted directly onto
 * the Recommendation row an owner/consultant reads to judge whether to trust
 * the recommendation. These tests prove the failure path now reports UNKNOWN
 * (healthScore: null, riskLevel: "unknown") instead, and that healthy/normal
 * paths are unaffected.
 */

const mockGetKPIsForEngagement = vi.fn();
vi.mock("@/services/kpi", () => ({
  getKPIsForEngagement: (...args: unknown[]) => mockGetKPIsForEngagement(...args),
}));

vi.mock("@/infra/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { evaluateEngagementKPIHealth } from "@/services/recommendation";

const ENGAGEMENT_ID = "engagement-kpi-health-test";
const WORKSPACE_ID = "ws-kpi-health-test";

describe("P0-03: evaluateEngagementKPIHealth fail-closed semantics", () => {
  beforeEach(() => {
    mockGetKPIsForEngagement.mockReset();
  });

  it("DB query throws: reports UNKNOWN, never the previous fabricated healthScore:1/riskLevel:low", async () => {
    mockGetKPIsForEngagement.mockRejectedValue(new Error("connection terminated unexpectedly"));

    const result = await evaluateEngagementKPIHealth(ENGAGEMENT_ID, WORKSPACE_ID);

    expect(result.healthScore).toBeNull();
    expect(result.riskLevel).toBe("unknown");
    expect(result.kpiCount).toBe(0);
    // The exact defect this closes: these values must never appear together
    // as the OUTPUT of a failure path.
    expect(result).not.toMatchObject({ healthScore: 1, riskLevel: "low" });
  });

  it("malformed data (non-array / throws during processing): reports UNKNOWN, not healthy", async () => {
    // getKPIsForEngagement() resolving to something that blows up the
    // downstream .filter()/.length logic (e.g. null) must be caught by the
    // same fail-closed path, not crash the caller or fabricate health.
    mockGetKPIsForEngagement.mockImplementation(() => {
      throw new TypeError("Cannot read properties of null (reading 'filter')");
    });

    const result = await evaluateEngagementKPIHealth(ENGAGEMENT_ID, WORKSPACE_ID);

    expect(result.healthScore).toBeNull();
    expect(result.riskLevel).toBe("unknown");
  });

  it("engagement not found (NotFoundError thrown upstream): reports UNKNOWN, not healthy", async () => {
    class NotFoundError extends Error {}
    mockGetKPIsForEngagement.mockRejectedValue(new NotFoundError("Engagement not found"));

    const result = await evaluateEngagementKPIHealth(ENGAGEMENT_ID, WORKSPACE_ID);

    expect(result.healthScore).toBeNull();
    expect(result.riskLevel).toBe("unknown");
  });

  it("valid healthy KPI data: computes a real score, not UNKNOWN", async () => {
    mockGetKPIsForEngagement.mockResolvedValue([
      { status: "on_track" },
      { status: "on_track" },
      { status: "on_track" },
      { status: "on_track" },
    ]);

    const result = await evaluateEngagementKPIHealth(ENGAGEMENT_ID, WORKSPACE_ID);

    expect(result.healthScore).toBe(1);
    expect(result.riskLevel).toBe("low");
    expect(result.kpiCount).toBe(4);
    expect(result.degradedKPICount).toBe(0);
  });

  it("valid unhealthy KPI data: computes a real degraded score, not UNKNOWN and not fabricated-healthy", async () => {
    mockGetKPIsForEngagement.mockResolvedValue([
      { status: "degraded" },
      { status: "degraded" },
      { status: "degraded" },
      { status: "on_track" },
    ]);

    const result = await evaluateEngagementKPIHealth(ENGAGEMENT_ID, WORKSPACE_ID);

    expect(result.healthScore).toBe(0.25);
    expect(result.riskLevel).toBe("critical");
    expect(result.degradedKPICount).toBe(3);
  });

  it("empty but legitimate data (no KPIs defined yet): healthScore is 1 by the existing 'no KPIs = no degradation' convention, distinct from UNKNOWN", async () => {
    mockGetKPIsForEngagement.mockResolvedValue([]);

    const result = await evaluateEngagementKPIHealth(ENGAGEMENT_ID, WORKSPACE_ID);

    // This is a genuine measurement (zero KPIs tracked), not a failure —
    // it must remain distinguishable in kind from the UNKNOWN failure path
    // even though the numeric healthScore happens to coincide with the
    // "all healthy" case. riskLevel is a real "low", not "unknown".
    expect(result.kpiCount).toBe(0);
    expect(result.healthScore).toBe(1);
    expect(result.riskLevel).toBe("low");
  });

  it("partial data (some KPIs missing a status field): does not throw, computes from what's present", async () => {
    mockGetKPIsForEngagement.mockResolvedValue([
      { status: "degraded" },
      {}, // missing status — filtered as "not degraded", not a crash
      { status: "on_track" },
    ]);

    const result = await evaluateEngagementKPIHealth(ENGAGEMENT_ID, WORKSPACE_ID);

    expect(result.riskLevel).not.toBe("unknown");
    expect(result.healthScore).not.toBeNull();
    expect(result.degradedKPICount).toBe(1);
  });
});
