import { describe, it, expect } from "vitest";
import { mapDriftToRequiredAction } from "./next-action.service";
import type { DriftDetectionResult } from "./execution-drift.service";

describe("NextActionService", () => {
  const createMockDrift = (overrides?: Partial<DriftDetectionResult>): DriftDetectionResult => ({
    engagementId: "eng-123",
    driftDetected: false,
    severity: "low",
    reasons: [],
    affectedActions: [],
    requiredAttention: false,
    requiredAction: null,
    detectedAt: new Date().toISOString(),
    ...overrides,
  });

  it("returns null when no drift detected", () => {
    const drift = createMockDrift({ driftDetected: false });
    const action = mapDriftToRequiredAction(drift);
    expect(action).toBeNull();
  });

  it("prioritizes overdue critical actions (priority 1)", () => {
    const drift = createMockDrift({
      driftDetected: true,
      severity: "high",
      reasons: ["2 critical action(s) are overdue"],
      affectedActions: ["act-1", "act-2"],
    });

    const action = mapDriftToRequiredAction(drift);

    expect(action).toBeDefined();
    expect(action?.type).toBe("action");
    expect(action?.entityId).toBe("act-1");
    expect(action?.urgency).toBe("critical");
    expect(action?.label).toContain("Resume");
  });

  it("prioritizes blockers (priority 2)", () => {
    const drift = createMockDrift({
      driftDetected: true,
      severity: "high",
      reasons: ["1 critical blocker(s) present"],
      affectedActions: [],
    });

    const action = mapDriftToRequiredAction(drift);

    expect(action).toBeDefined();
    expect(action?.type).toBe("blocker");
    expect(action?.urgency).toBe("critical");
    expect(action?.label.toLowerCase()).toContain("resolve");
  });

  it("prioritizes critically low execution certainty (priority 3)", () => {
    const drift = createMockDrift({
      driftDetected: true,
      severity: "critical",
      reasons: ["Execution certainty critically low (25/100)"],
      affectedActions: [],
    });

    const action = mapDriftToRequiredAction(drift);

    expect(action).toBeDefined();
    expect(action?.type).toBe("review");
    expect(action?.urgency).toBe("critical");
    expect(action?.label).toContain("execution plan");
  });

  it("prioritizes critical health (priority 4)", () => {
    const drift = createMockDrift({
      driftDetected: true,
      severity: "critical",
      reasons: ["Engagement health is critical"],
      affectedActions: [],
    });

    const action = mapDriftToRequiredAction(drift);

    expect(action).toBeDefined();
    expect(action?.type).toBe("intervention");
    expect(action?.urgency).toBe("critical");
    expect(action?.label).toContain("intervention");
  });

  it("handles low execution certainty (priority 5)", () => {
    const drift = createMockDrift({
      driftDetected: true,
      severity: "medium",
      reasons: ["Execution certainty low (45/100)"],
      affectedActions: [],
    });

    const action = mapDriftToRequiredAction(drift);

    expect(action).toBeDefined();
    expect(action?.type).toBe("review");
    expect(action?.urgency).toBe("high");
    expect(action?.label).toContain("execution plan");
  });

  it("handles blocked recommendations (priority 6)", () => {
    const drift = createMockDrift({
      driftDetected: true,
      severity: "high",
      reasons: ["1 recommendation(s) blocked"],
      affectedActions: [],
    });

    const action = mapDriftToRequiredAction(drift);

    expect(action).toBeDefined();
    expect(action?.type).toBe("recommendation");
    expect(action?.urgency).toBe("high");
    expect(action?.label).toContain("Unblock");
  });

  it("handles unresolved critical findings (priority 7)", () => {
    const drift = createMockDrift({
      driftDetected: true,
      severity: "high",
      reasons: ["1 unresolved critical finding(s)"],
      affectedActions: [],
    });

    const action = mapDriftToRequiredAction(drift);

    expect(action).toBeDefined();
    expect(action?.type).toBe("finding");
    expect(action?.urgency).toBe("high");
    expect(action?.label).toContain("Create");
  });

  it("handles stale recommendations (priority 8)", () => {
    const drift = createMockDrift({
      driftDetected: true,
      severity: "high",
      reasons: ["2 recommendation(s) in progress for 14+ days"],
      affectedActions: [],
    });

    const action = mapDriftToRequiredAction(drift);

    expect(action).toBeDefined();
    expect(action?.type).toBe("recommendation");
    expect(action?.urgency).toBe("high");
    expect(action?.label).toContain("Complete");
  });

  it("handles at-risk health (priority 9)", () => {
    const drift = createMockDrift({
      driftDetected: true,
      severity: "medium",
      reasons: ["Engagement health is at risk"],
      affectedActions: [],
    });

    const action = mapDriftToRequiredAction(drift);

    expect(action).toBeDefined();
    expect(action?.type).toBe("checkin");
    expect(action?.urgency).toBe("high");
    expect(action?.label).toContain("health check-in");
  });

  it("handles inactivity (priority 10)", () => {
    const drift = createMockDrift({
      driftDetected: true,
      severity: "medium",
      reasons: ["No updates for 8 days"],
      affectedActions: [],
    });

    const action = mapDriftToRequiredAction(drift);

    expect(action).toBeDefined();
    expect(action?.type).toBe("checkin");
    expect(action?.urgency).toBe("high");
    expect(action?.label).toContain("check-in");
  });

  it("uses correct entityId for different action types", () => {
    const driftWithAction = createMockDrift({
      driftDetected: true,
      severity: "high",
      reasons: ["1 critical action(s) are overdue"],
      affectedActions: ["specific-action-id"],
    });

    const action = mapDriftToRequiredAction(driftWithAction);
    expect(action?.entityId).toBe("specific-action-id");

    const driftWithoutAction = createMockDrift({
      driftDetected: true,
      severity: "high",
      reasons: ["1 critical blocker(s) present"],
      affectedActions: [],
    });

    const action2 = mapDriftToRequiredAction(driftWithoutAction);
    expect(action2?.entityId).toContain("eng-123");
  });

  it("prefers overdue actions even if other conditions exist", () => {
    const drift = createMockDrift({
      driftDetected: true,
      severity: "critical",
      reasons: [
        "1 critical action(s) are overdue",
        "Engagement health is critical",
        "1 critical blocker(s) present",
      ],
      affectedActions: ["priority-action"],
    });

    const action = mapDriftToRequiredAction(drift);

    expect(action?.type).toBe("action");
    expect(action?.entityId).toBe("priority-action");
  });

  it("sets appropriate urgency levels", () => {
    const criticalDrift = createMockDrift({
      driftDetected: true,
      severity: "critical",
      reasons: ["Engagement health is critical"],
      affectedActions: [],
    });

    const criticalAction = mapDriftToRequiredAction(criticalDrift);
    expect(criticalAction?.urgency).toBe("critical");

    const highDrift = createMockDrift({
      driftDetected: true,
      severity: "medium",
      reasons: ["Engagement health is at risk"],
      affectedActions: [],
    });

    const highAction = mapDriftToRequiredAction(highDrift);
    expect(highAction?.urgency).toBe("high");
  });

  it("includes reason in required action", () => {
    const drift = createMockDrift({
      driftDetected: true,
      severity: "critical",
      reasons: ["2 critical action(s) are overdue"],
      affectedActions: ["act-1"],
    });

    const action = mapDriftToRequiredAction(drift);

    expect(action?.reason).toBeDefined();
    expect(action?.reason.length).toBeGreaterThan(0);
  });
});
