import { describe, it, expect, beforeEach, vi } from "vitest";
import { mapDriftToRequiredAction, deriveCommitmentStatus, type RequiredAction } from "../next-action.service";
import type { DriftDetectionResult } from "../execution-drift.service";

vi.mock("@/lib/db", () => ({
  db: {
    action: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

describe("NextActionService", () => {
  let mockDb: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const { db } = await import("@/lib/db");
    mockDb = db;
  });

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

  describe("mapDriftToRequiredAction", () => {
    it("returns null when no drift detected", () => {
      const drift = createMockDrift({ driftDetected: false });
      const action = mapDriftToRequiredAction(drift);
      expect(action).toBeNull();
    });

    it("prioritizes overdue critical actions (highest score: 95)", () => {
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
    });

    it("prioritizes blockers (score: 85)", () => {
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
    });

    it("prioritizes critically low execution certainty (score: 80)", () => {
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
    });

    it("prioritizes critical health status (score: 85)", () => {
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
    });

    it("handles low execution certainty (score: 70)", () => {
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
    });

    it("handles critical findings (score: 75)", () => {
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
    });

    it("handles at-risk health (score: 65)", () => {
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
    });

    it("handles inactivity (score: 50)", () => {
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
    });

    it("uses case-insensitive reason matching", () => {
      const drift = createMockDrift({
        driftDetected: true,
        severity: "high",
        reasons: ["Execution Certainty Low (45/100)"], // Uppercase
        affectedActions: [],
      });

      const action = mapDriftToRequiredAction(drift);

      expect(action).toBeDefined();
      expect(action?.type).toBe("review");
    });

    it("selects highest score when multiple conditions present", () => {
      const drift = createMockDrift({
        driftDetected: true,
        severity: "critical",
        reasons: [
          "1 critical action(s) are overdue", // Score: 95
          "Engagement health is critical", // Score: 85
          "1 critical blocker(s) present", // Score: 85
        ],
        affectedActions: ["act-1"],
      });

      const action = mapDriftToRequiredAction(drift);

      // Should pick overdue action (score 95) over others
      expect(action?.type).toBe("action");
      expect(action?.entityId).toBe("act-1");
    });
  });

  describe("deriveCommitmentStatus", () => {
    const mockAction: RequiredAction = {
      type: "action",
      entityId: "act-1",
      label: "Test action",
      urgency: "critical",
      reason: "Test reason",
    };

    it("returns pending by default", async () => {
      mockDb.action.findFirst.mockResolvedValue(null);

      const commitment = await deriveCommitmentStatus(mockAction, "workspace-1");

      expect(commitment.status).toBe("pending");
    });

    it("returns completed for completed actions", async () => {
      mockDb.action.findFirst.mockResolvedValue({
        status: "completed",
        startedAt: new Date("2026-01-01"),
        updatedAt: new Date("2026-01-05"),
      });

      const commitment = await deriveCommitmentStatus(mockAction, "workspace-1");

      expect(commitment.status).toBe("completed");
      expect(commitment.completedAt).toBeDefined();
    });

    it("returns in_progress for in_progress actions", async () => {
      mockDb.action.findFirst.mockResolvedValue({
        status: "in_progress",
        startedAt: new Date("2026-01-01"),
        updatedAt: new Date("2026-01-03"),
      });

      const commitment = await deriveCommitmentStatus(mockAction, "workspace-1");

      expect(commitment.status).toBe("in_progress");
      expect(commitment.startedAt).toBeDefined();
    });

    it("returns pending for pending actions", async () => {
      mockDb.action.findFirst.mockResolvedValue({
        status: "pending",
        startedAt: null,
        updatedAt: new Date("2026-01-01"),
      });

      const commitment = await deriveCommitmentStatus(mockAction, "workspace-1");

      expect(commitment.status).toBe("pending");
    });

    it("handles blocked actions as pending", async () => {
      mockDb.action.findFirst.mockResolvedValue({
        status: "blocked",
        startedAt: null,
        updatedAt: new Date("2026-01-01"),
      });

      const commitment = await deriveCommitmentStatus(mockAction, "workspace-1");

      expect(commitment.status).toBe("pending");
    });

    it("handles verified actions as completed", async () => {
      mockDb.action.findFirst.mockResolvedValue({
        status: "verified",
        startedAt: new Date("2026-01-01"),
        updatedAt: new Date("2026-01-05"),
      });

      const commitment = await deriveCommitmentStatus(mockAction, "workspace-1");

      expect(commitment.status).toBe("completed");
    });

    it("handles non-action types gracefully", async () => {
      const nonActionType: RequiredAction = {
        type: "blocker",
        entityId: "blocker-1",
        label: "Resolve blocker",
        urgency: "critical",
        reason: "Blocker present",
      };

      const commitment = await deriveCommitmentStatus(nonActionType);

      expect(commitment.status).toBe("pending");
    });

    it("handles DB errors gracefully", async () => {
      // Reset any previous mock returns
      mockDb.action.findFirst.mockReset();
      mockDb.action.findFirst.mockRejectedValue(new Error("DB error"));

      const commitment = await deriveCommitmentStatus(mockAction, "workspace-1");

      expect(commitment.status).toBe("pending");
    });

    it("extracts timestamps from DB", async () => {
      const startedTime = new Date("2026-01-01T10:00:00Z");
      const updatedTime = new Date("2026-01-03T14:30:00Z");

      mockDb.action.findFirst.mockResolvedValue({
        status: "in_progress",
        startedAt: startedTime,
        updatedAt: updatedTime,
      });

      const commitment = await deriveCommitmentStatus(mockAction, "workspace-1");

      expect(commitment.startedAt).toBe(startedTime.toISOString());
    });
  });

  describe("Scoring accuracy", () => {
    it("correctly scores multiple overdue actions", () => {
      const driftWith2Overdue = createMockDrift({
        driftDetected: true,
        severity: "high",
        reasons: ["2 critical action(s) are overdue"],
        affectedActions: ["act-1", "act-2"],
      });

      const driftWith5Overdue = createMockDrift({
        driftDetected: true,
        severity: "high",
        reasons: ["5 critical action(s) are overdue"],
        affectedActions: ["act-1", "act-2", "act-3", "act-4", "act-5"],
      });

      // Both should pick action type, but different scores
      const action2 = mapDriftToRequiredAction(driftWith2Overdue);
      const action5 = mapDriftToRequiredAction(driftWith5Overdue);

      expect(action2?.type).toBe("action");
      expect(action5?.type).toBe("action");
    });
  });
});
