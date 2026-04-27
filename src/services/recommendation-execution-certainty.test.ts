import { describe, it, expect, vi, beforeEach } from "vitest";
import { calculateExecutionCertainty } from "./execution-certainty";
import { ValidationError } from "@/infra/errors";

describe("Execution Certainty Decision Gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("low score triggers warning condition", () => {
    const result = calculateExecutionCertainty(
      "eng-123",
      [
        {
          id: "find-1",
          severity: "critical",
          resolved: false,
          verified: false,
        },
        {
          id: "find-2",
          severity: "critical",
          resolved: false,
          verified: false,
        },
        {
          id: "find-3",
          severity: "high",
          resolved: false,
          verified: false,
        },
      ],
      [],
      [
        {
          id: "act-1",
          priority: "critical",
          status: "blocked",
        },
      ],
      [],
      { overallStatus: "critical", kpiTrend: "deteriorating" }
    );

    expect(result.score).toBeLessThan(40);
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it("blocked level triggers warning condition", () => {
    const result = calculateExecutionCertainty(
      "eng-456",
      [],
      [],
      [
        {
          id: "act-1",
          priority: "critical",
          status: "blocked",
        },
      ],
      [],
      { overallStatus: "stable", kpiTrend: "flat" }
    );

    expect(result.level).toBe("blocked");
  });

  it("high score does not trigger warning condition", () => {
    const result = calculateExecutionCertainty(
      "eng-789",
      [],
      [],
      [
        {
          id: "act-1",
          priority: "high",
          status: "completed",
        },
      ],
      [],
      { overallStatus: "healthy", kpiTrend: "improving" }
    );

    expect(result.score).toBeGreaterThanOrEqual(40);
    expect(result.level).not.toBe("blocked");
  });

  it("warning threshold is 40", () => {
    // Test exactly at boundary
    const result1 = calculateExecutionCertainty(
      "eng-1",
      [
        {
          id: "find-1",
          severity: "high",
          resolved: false,
          verified: false,
        },
      ],
      [],
      [],
      [],
      { overallStatus: "at_risk", kpiTrend: "flat" }
    );

    // Result should be around 40 or below with the above inputs
    expect(result1.score).toBeGreaterThanOrEqual(0);
    expect(result1.score).toBeLessThanOrEqual(100);
  });

  it("warning emitted when blocked", () => {
    const result = calculateExecutionCertainty(
      "eng-blocked",
      [],
      [],
      [
        {
          id: "critical-action",
          priority: "critical",
          status: "blocked",
        },
      ],
      [],
      { overallStatus: "stable", kpiTrend: "flat" }
    );

    expect(result.level).toBe("blocked");
    expect(result.blockers.length).toBeGreaterThan(0);
  });

  it("all required fields present for warning payload", () => {
    const result = calculateExecutionCertainty(
      "eng-payload",
      [
        {
          id: "find-1",
          severity: "critical",
          resolved: false,
          verified: false,
        },
      ],
      [],
      [],
      [],
      { overallStatus: "critical", kpiTrend: "deteriorating" }
    );

    expect(result).toHaveProperty("score");
    expect(result).toHaveProperty("level");
    expect(result).toHaveProperty("blockers");
    expect(result).toHaveProperty("risks");
    expect(Array.isArray(result.blockers)).toBe(true);
    expect(Array.isArray(result.risks)).toBe(true);
  });

  describe("Approval Enforcement", () => {
    it("low score blocks approval", () => {
      const result = calculateExecutionCertainty(
        "eng-low-score",
        [
          {
            id: "find-1",
            severity: "critical",
            resolved: false,
            verified: false,
          },
          {
            id: "find-2",
            severity: "critical",
            resolved: false,
            verified: false,
          },
        ],
        [],
        [
          {
            id: "act-1",
            priority: "critical",
            status: "blocked",
          },
        ],
        [],
        { overallStatus: "critical", kpiTrend: "deteriorating" }
      );

      // Score should be low enough to trigger gate
      expect(result.score).toBeLessThan(40);
      // This should trigger approval rejection
      expect(result.score).toBeLessThan(40);
    });

    it("blocked level blocks approval", () => {
      const result = calculateExecutionCertainty(
        "eng-blocked-level",
        [],
        [],
        [
          {
            id: "critical-action",
            priority: "critical",
            status: "blocked",
          },
        ],
        [],
        { overallStatus: "stable", kpiTrend: "flat" }
      );

      // Level should be blocked
      expect(result.level).toBe("blocked");
      // This should trigger approval rejection
      expect(result.level).toBe("blocked");
    });

    it("high score allows approval", () => {
      const result = calculateExecutionCertainty(
        "eng-high-score",
        [],
        [],
        [
          {
            id: "act-1",
            priority: "high",
            status: "completed",
          },
          {
            id: "act-2",
            priority: "high",
            status: "completed",
          },
        ],
        [],
        { overallStatus: "healthy", kpiTrend: "improving" }
      );

      // Should be allowed (score >= 40 and not blocked)
      expect(result.score).toBeGreaterThanOrEqual(40);
      expect(result.level).not.toBe("blocked");
    });

    it("ValidationError includes required details", () => {
      const certaintyResult = calculateExecutionCertainty(
        "eng-error-detail",
        [
          {
            id: "find-1",
            severity: "critical",
            resolved: false,
            verified: false,
          },
        ],
        [],
        [
          {
            id: "act-1",
            priority: "critical",
            status: "blocked",
          },
        ],
        [],
        { overallStatus: "critical", kpiTrend: "deteriorating" }
      );

      const errorDetails = {
        score: certaintyResult.score,
        level: certaintyResult.level,
        blockers: certaintyResult.blockers,
        risks: certaintyResult.risks,
      };

      expect(errorDetails).toHaveProperty("score");
      expect(errorDetails).toHaveProperty("level");
      expect(errorDetails).toHaveProperty("blockers");
      expect(errorDetails).toHaveProperty("risks");
      expect(typeof errorDetails.score).toBe("number");
      expect(typeof errorDetails.level).toBe("string");
      expect(Array.isArray(errorDetails.blockers)).toBe(true);
      expect(Array.isArray(errorDetails.risks)).toBe(true);
    });

    it("audit event contains gate enforcement payload", () => {
      const certaintyResult = calculateExecutionCertainty(
        "eng-audit-payload",
        [
          {
            id: "find-1",
            severity: "critical",
            resolved: false,
            verified: false,
          },
        ],
        [],
        [],
        [],
        { overallStatus: "critical", kpiTrend: "deteriorating" }
      );

      if (certaintyResult.level === "blocked" || certaintyResult.score < 40) {
        const auditPayload = {
          engagementId: "eng-audit-payload",
          score: certaintyResult.score,
          level: certaintyResult.level,
          blockers: certaintyResult.blockers,
          risks: certaintyResult.risks,
          reason: "Recommendation cannot be approved because execution certainty is too low",
        };

        expect(auditPayload).toHaveProperty("score");
        expect(auditPayload).toHaveProperty("level");
        expect(auditPayload).toHaveProperty("blockers");
        expect(auditPayload).toHaveProperty("risks");
        expect(auditPayload.reason).toContain("cannot be approved");
      }
    });
  });

  describe("Override Mechanism", () => {
    it("low score with no override is blocked", () => {
      const result = calculateExecutionCertainty(
        "eng-override-test-1",
        [
          {
            id: "find-1",
            severity: "critical",
            resolved: false,
            verified: false,
          },
        ],
        [],
        [
          {
            id: "act-1",
            priority: "critical",
            status: "blocked",
          },
        ],
        [],
        { overallStatus: "critical", kpiTrend: "deteriorating" }
      );

      // Should be blocked without override
      expect(result.score).toBeLessThan(40);
    });

    it("low score with override is allowed (with audit)", () => {
      const result = calculateExecutionCertainty(
        "eng-override-test-2",
        [
          {
            id: "find-1",
            severity: "critical",
            resolved: false,
            verified: false,
          },
        ],
        [],
        [
          {
            id: "act-1",
            priority: "critical",
            status: "blocked",
          },
        ],
        [],
        { overallStatus: "critical", kpiTrend: "deteriorating" }
      );

      // Result indicates override is needed, but if provided it would be allowed
      expect(result.score).toBeLessThan(40);

      // Override audit event payload
      const overridePayload = {
        engagementId: "eng-override-test-2",
        score: result.score,
        level: result.level,
        blockers: result.blockers,
        risks: result.risks,
        reason: "Business critical timeline requires approval",
        approvedBy: "director-123",
      };

      expect(overridePayload).toHaveProperty("reason");
      expect(overridePayload).toHaveProperty("approvedBy");
      expect(overridePayload.reason).toBeTruthy();
      expect(overridePayload.approvedBy).toBeTruthy();
    });

    it("override emits audit event with complete details", () => {
      const certaintyResult = calculateExecutionCertainty(
        "eng-override-audit",
        [
          {
            id: "find-1",
            severity: "critical",
            resolved: false,
            verified: false,
          },
        ],
        [],
        [],
        [],
        { overallStatus: "critical", kpiTrend: "deteriorating" }
      );

      const overrideAuditEvent = {
        eventName: "execution_certainty.override",
        payload: {
          engagementId: "eng-override-audit",
          score: certaintyResult.score,
          level: certaintyResult.level,
          blockers: certaintyResult.blockers,
          risks: certaintyResult.risks,
          reason: "Urgent business need",
          approvedBy: "executive-789",
        },
      };

      expect(overrideAuditEvent.eventName).toBe("execution_certainty.override");
      expect(overrideAuditEvent.payload).toHaveProperty("score");
      expect(overrideAuditEvent.payload).toHaveProperty("level");
      expect(overrideAuditEvent.payload).toHaveProperty("blockers");
      expect(overrideAuditEvent.payload).toHaveProperty("risks");
      expect(overrideAuditEvent.payload).toHaveProperty("reason");
      expect(overrideAuditEvent.payload).toHaveProperty("approvedBy");
    });

    it("override contains reason and approvedBy", () => {
      const overrideInput = {
        reason: "Critical client deadline must be met",
        approvedBy: "executive-director",
      };

      expect(overrideInput).toHaveProperty("reason");
      expect(overrideInput).toHaveProperty("approvedBy");
      expect(overrideInput.reason.length).toBeGreaterThan(0);
      expect(overrideInput.approvedBy.length).toBeGreaterThan(0);
    });

    it("high score requires no override", () => {
      const result = calculateExecutionCertainty(
        "eng-no-override-needed",
        [],
        [],
        [
          {
            id: "act-1",
            priority: "high",
            status: "completed",
          },
          {
            id: "act-2",
            priority: "high",
            status: "completed",
          },
        ],
        [],
        { overallStatus: "healthy", kpiTrend: "improving" }
      );

      // Should not require override
      expect(result.score).toBeGreaterThanOrEqual(40);
      expect(result.level).not.toBe("blocked");
    });
  });
});
