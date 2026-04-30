import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "../control-effectiveness/route";

// Mock database
vi.mock("@/lib/db", () => ({
  db: {
    operatorItem: {
      findMany: vi.fn(),
    },
  },
}));

// Mock workspace context
vi.mock("@/services/workspace/context", () => ({
  requireWorkspaceContext: vi.fn(),
}));

import { db } from "@/lib/db";
import { requireWorkspaceContext } from "@/services/workspace/context";

describe("PHASE 5: Control Layer Effectiveness Metrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should return unauthorized when workspace context missing", async () => {
    vi.mocked(requireWorkspaceContext).mockRejectedValueOnce(
      new Error("Unauthorized")
    );

    const request = new NextRequest("http://localhost/api/metrics/control-effectiveness");
    const response = await GET(request);

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("should return empty metrics when no decisions in period", async () => {
    vi.mocked(requireWorkspaceContext).mockResolvedValueOnce({
      workspaceId: "ws-123",
    } as any);

    vi.mocked(db.operatorItem.findMany).mockResolvedValueOnce([]);

    const request = new NextRequest("http://localhost/api/metrics/control-effectiveness");
    const response = await GET(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.summary.totalDecisions).toBe(0);
    expect(body.summary.totalBlocked).toBe(0);
    expect(body.stageBreakdown).toEqual([]);
  });

  it("should calculate overall block rate correctly", async () => {
    vi.mocked(requireWorkspaceContext).mockResolvedValueOnce({
      workspaceId: "ws-123",
    } as any);

    const now = new Date();
    vi.mocked(db.operatorItem.findMany).mockResolvedValueOnce([
      {
        id: "d1",
        status: "done",
        blockStage: null,
        blockReason: null,
        confidence: 0.9,
        guardrailResult: null,
      },
      {
        id: "d2",
        status: "blocked",
        blockStage: "guardrails",
        blockReason: "high_impact",
        confidence: 0.3,
        guardrailResult: JSON.stringify({
          violations: [{ ruleId: "rule-1" }],
        }),
      },
    ] as any);

    const request = new NextRequest("http://localhost/api/metrics/control-effectiveness");
    const response = await GET(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.summary.totalDecisions).toBe(2);
    expect(body.summary.totalBlocked).toBe(1);
    expect(body.summary.overallBlockRate).toBe(50);
  });

  it("should break down blocks by stage", async () => {
    vi.mocked(requireWorkspaceContext).mockResolvedValueOnce({
      workspaceId: "ws-123",
    } as any);

    vi.mocked(db.operatorItem.findMany).mockResolvedValueOnce([
      {
        id: "d1",
        status: "blocked",
        blockStage: "dependency_validation",
        blockReason: "missing_data",
        confidence: 0.8,
        guardrailResult: null,
      },
      {
        id: "d2",
        status: "blocked",
        blockStage: "guardrails",
        blockReason: "high_impact",
        confidence: 0.3,
        guardrailResult: JSON.stringify({
          violations: [{ ruleId: "rule-1" }],
        }),
      },
      {
        id: "d3",
        status: "blocked",
        blockStage: "guardrails",
        blockReason: "high_impact",
        confidence: 0.25,
        guardrailResult: JSON.stringify({
          violations: [{ ruleId: "rule-1" }],
        }),
      },
    ] as any);

    const request = new NextRequest("http://localhost/api/metrics/control-effectiveness");
    const response = await GET(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.stageBreakdown).toHaveLength(2);

    const guardrailStage = body.stageBreakdown.find((s: any) => s.stage === "guardrails");
    expect(guardrailStage.blockCount).toBe(2);
    expect(guardrailStage.topReasons).toContainEqual(
      expect.objectContaining({ reason: "high_impact", count: 2 })
    );
  });

  it("should track guardrail rule effectiveness", async () => {
    vi.mocked(requireWorkspaceContext).mockResolvedValueOnce({
      workspaceId: "ws-123",
    } as any);

    vi.mocked(db.operatorItem.findMany).mockResolvedValueOnce([
      {
        id: "d1",
        status: "blocked",
        blockStage: "guardrails",
        blockReason: "rule_violation",
        confidence: 0.4,
        guardrailResult: JSON.stringify({
          violations: [
            { ruleId: "high-impact-rule" },
            { ruleId: "audit-rule" },
          ],
        }),
      },
      {
        id: "d2",
        status: "blocked",
        blockStage: "guardrails",
        blockReason: "rule_violation",
        confidence: 0.35,
        guardrailResult: JSON.stringify({
          violations: [{ ruleId: "high-impact-rule" }],
        }),
      },
      {
        id: "d3",
        status: "done",
        blockStage: null,
        blockReason: null,
        confidence: 0.7,
        guardrailResult: null,
      },
    ] as any);

    const request = new NextRequest("http://localhost/api/metrics/control-effectiveness");
    const response = await GET(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.topGuardrailRules).toHaveLength(2);

    const highImpactRule = body.topGuardrailRules.find(
      (r: any) => r.ruleId === "high-impact-rule"
    );
    expect(highImpactRule.triggerCount).toBe(2);
    expect(highImpactRule.blockPercentage).toBe(100);
  });

  it("should handle malformed guardrail results gracefully", async () => {
    vi.mocked(requireWorkspaceContext).mockResolvedValueOnce({
      workspaceId: "ws-123",
    } as any);

    vi.mocked(db.operatorItem.findMany).mockResolvedValueOnce([
      {
        id: "d1",
        status: "blocked",
        blockStage: "guardrails",
        blockReason: "rule_violation",
        confidence: 0.4,
        guardrailResult: "invalid json {",
      },
      {
        id: "d2",
        status: "done",
        blockStage: null,
        blockReason: null,
        confidence: 0.7,
        guardrailResult: null,
      },
    ] as any);

    const request = new NextRequest("http://localhost/api/metrics/control-effectiveness");
    const response = await GET(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.summary.totalDecisions).toBe(2);
    expect(body.topGuardrailRules).toEqual([]);
  });

  it("should calculate average confidence correctly per stage", async () => {
    vi.mocked(requireWorkspaceContext).mockResolvedValueOnce({
      workspaceId: "ws-123",
    } as any);

    vi.mocked(db.operatorItem.findMany).mockResolvedValueOnce([
      {
        id: "d1",
        status: "blocked",
        blockStage: "decision_gate",
        blockReason: "reason1",
        confidence: 0.6,
        guardrailResult: null,
      },
      {
        id: "d2",
        status: "blocked",
        blockStage: "decision_gate",
        blockReason: "reason2",
        confidence: 0.8,
        guardrailResult: null,
      },
    ] as any);

    const request = new NextRequest("http://localhost/api/metrics/control-effectiveness");
    const response = await GET(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    const gateStage = body.stageBreakdown.find((s: any) => s.stage === "decision_gate");
    expect(gateStage.avgConfidenceWhenBlocked).toBe(0.7);
  });

  it("should respect days parameter with max bounds", async () => {
    vi.mocked(requireWorkspaceContext).mockResolvedValueOnce({
      workspaceId: "ws-123",
    } as any);

    vi.mocked(db.operatorItem.findMany).mockResolvedValueOnce([]);

    const request = new NextRequest(
      "http://localhost/api/metrics/control-effectiveness?days=120"
    );
    const response = await GET(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.period.days).toBe(90); // Capped at 90
  });

  it("should include workspace isolation in query", async () => {
    vi.mocked(requireWorkspaceContext).mockResolvedValueOnce({
      workspaceId: "ws-123",
    } as any);

    vi.mocked(db.operatorItem.findMany).mockResolvedValueOnce([]);

    const request = new NextRequest("http://localhost/api/metrics/control-effectiveness");
    await GET(request);

    expect(vi.mocked(db.operatorItem.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: "ws-123",
        }),
      })
    );
  });
});
