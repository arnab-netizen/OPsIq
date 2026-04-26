import { describe, it, expect } from "vitest";
import {
  calculateExecutionCertainty,
  type Finding,
  type Recommendation,
  type Action,
  type Evidence,
  type EngagementHealth,
} from "./execution-certainty";

describe("calculateExecutionCertainty", () => {
  const defaultHealth: EngagementHealth = {
    overallStatus: "stable",
    kpiTrend: "flat",
  };

  it("critical unresolved finding reduces score", () => {
    const findings: Finding[] = [
      {
        id: "find-1",
        severity: "critical",
        resolved: false,
        verified: true,
      },
    ];

    const result = calculateExecutionCertainty(
      "eng-123",
      findings,
      [],
      [],
      [],
      defaultHealth
    );

    expect(result.score).toBeLessThan(100);
    expect(result.reasons).toContain("1 unresolved critical finding(s)");
  });

  it("blocked critical action creates blocker", () => {
    const actions: Action[] = [
      {
        id: "act-1",
        priority: "critical",
        status: "blocked",
      },
    ];

    const result = calculateExecutionCertainty(
      "eng-123",
      [],
      [],
      actions,
      [],
      defaultHealth
    );

    expect(result.blockers.length).toBeGreaterThan(0);
    expect(result.blockers).toContain("Critical action blocked: act-1");
    expect(result.level).toBe("blocked");
  });

  it("missing evidence reduces score", () => {
    const evidence: Evidence[] = [
      { id: "ev-1", type: "metric", verified: true, strength: "strong" },
      { id: "ev-2", type: "metric", verified: false, strength: "weak" },
      { id: "ev-3", type: "metric", verified: false, strength: "weak" },
    ];

    const result = calculateExecutionCertainty(
      "eng-123",
      [],
      [],
      [],
      evidence,
      defaultHealth
    );

    expect(result.score).toBeLessThan(100);
    expect(result.reasons.some((r) => r.includes("% of evidence not verified"))).toBe(true);
  });

  it("completed verified actions increase score", () => {
    const actions: Action[] = [
      {
        id: "act-1",
        priority: "high",
        status: "completed",
      },
      {
        id: "act-2",
        priority: "high",
        status: "verified",
      },
    ];

    const result = calculateExecutionCertainty(
      "eng-123",
      [],
      [],
      actions,
      [],
      defaultHealth
    );

    // Score should be boosted by completed actions
    expect(result.reasons.some((r) => r.includes("completed action(s)"))).toBe(true);
  });

  it("healthy engagement with evidence gives high/certain score", () => {
    const findings: Finding[] = [
      {
        id: "find-1",
        severity: "low",
        resolved: true,
        verified: true,
      },
    ];

    const evidence: Evidence[] = [
      { id: "ev-1", type: "metric", verified: true, strength: "strong" },
      { id: "ev-2", type: "metric", verified: true, strength: "strong" },
    ];

    const actions: Action[] = [
      {
        id: "act-1",
        priority: "high",
        status: "completed",
      },
    ];

    const health: EngagementHealth = {
      overallStatus: "healthy",
      kpiTrend: "improving",
    };

    const result = calculateExecutionCertainty(
      "eng-123",
      findings,
      [],
      actions,
      evidence,
      health
    );

    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(["high", "certain"]).toContain(result.level);
  });

  it("score is clamped between 0 and 100", () => {
    const manyBlockedActions: Action[] = Array.from({ length: 20 }, (_, i) => ({
      id: `act-${i}`,
      priority: "critical" as const,
      status: "blocked" as const,
    }));

    const result = calculateExecutionCertainty(
      "eng-123",
      [],
      [],
      manyBlockedActions,
      [],
      defaultHealth
    );

    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("returns correct shape with all fields", () => {
    const result = calculateExecutionCertainty("eng-123");

    expect(result).toHaveProperty("engagementId", "eng-123");
    expect(result).toHaveProperty("generatedAt");
    expect(result).toHaveProperty("score");
    expect(result).toHaveProperty("level");
    expect(result).toHaveProperty("blockers");
    expect(result).toHaveProperty("risks");
    expect(result).toHaveProperty("reasons");
    expect(Array.isArray(result.blockers)).toBe(true);
    expect(Array.isArray(result.risks)).toBe(true);
    expect(Array.isArray(result.reasons)).toBe(true);
  });

  it("critical health state creates risk and reduces score", () => {
    const health: EngagementHealth = {
      overallStatus: "critical",
      kpiTrend: "deteriorating",
    };

    const result = calculateExecutionCertainty(
      "eng-123",
      [],
      [],
      [],
      [],
      health
    );

    expect(result.risks.some((r) => r.includes("critical"))).toBe(true);
    expect(result.score).toBeLessThan(100);
  });
});
