import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "../metrics/route";

// Mock workspace context
vi.mock("@/services/workspace/context", () => ({
  requireWorkspaceContext: vi.fn(),
}));

// Mock governance metrics service
vi.mock("@/services/governance/metrics", () => ({
  calculateGovernanceMetrics: vi.fn(),
}));

import { requireWorkspaceContext } from "@/services/workspace/context";
import { calculateGovernanceMetrics } from "@/services/governance/metrics";

describe("PHASE 5.2: Governance Metrics API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return unauthorized when workspace context missing", async () => {
    vi.mocked(requireWorkspaceContext).mockRejectedValueOnce(
      new Error("Unauthorized")
    );

    const request = new NextRequest("http://localhost/api/governance/metrics");
    const response = await GET(request);

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("should return governance metrics for workspace", async () => {
    const mockMetrics = {
      workspace: { workspaceId: "ws-123" },
      period: { days: 30, startDate: "2026-03-31", endDate: "2026-04-30" },
      summary: { totalDecisions: 100, approvedCount: 75, blockedCount: 25 },
      blockRates: {
        overallBlockRate: 25,
        guardrailBlockRate: 40,
        decisionGateBlockRate: 32,
        dependencyValidationBlockRate: 28,
      },
      confidence: {
        avgConfidenceApproved: 0.78,
        avgConfidenceBlocked: 0.35,
      },
      impact: {
        approvedExpectedImpact: 500000,
        blockedExpectedImpact: 200000,
        realizedImpact: 485000,
        lossFromMisses: 25000,
      },
    };

    vi.mocked(requireWorkspaceContext).mockResolvedValueOnce({
      workspaceId: "ws-123",
    } as any);

    vi.mocked(calculateGovernanceMetrics).mockResolvedValueOnce(
      mockMetrics as any
    );

    const request = new NextRequest("http://localhost/api/governance/metrics");
    const response = await GET(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.workspace.workspaceId).toBe("ws-123");
    expect(body.summary.totalDecisions).toBe(100);
    expect(body.summary.approvedCount).toBe(75);
    expect(body.summary.blockedCount).toBe(25);
  });

  it("should respect days query parameter", async () => {
    const mockMetrics = {
      workspace: { workspaceId: "ws-123" },
      period: { days: 7, startDate: "2026-04-23", endDate: "2026-04-30" },
      summary: { totalDecisions: 20, approvedCount: 15, blockedCount: 5 },
      blockRates: { overallBlockRate: 25, guardrailBlockRate: 40, decisionGateBlockRate: 32, dependencyValidationBlockRate: 28 },
      confidence: { avgConfidenceApproved: 0.78, avgConfidenceBlocked: 0.35 },
      impact: { approvedExpectedImpact: 100000, blockedExpectedImpact: 50000, realizedImpact: 98000, lossFromMisses: 5000 },
    };

    vi.mocked(requireWorkspaceContext).mockResolvedValueOnce({
      workspaceId: "ws-123",
    } as any);

    vi.mocked(calculateGovernanceMetrics).mockResolvedValueOnce(
      mockMetrics as any
    );

    const request = new NextRequest(
      "http://localhost/api/governance/metrics?days=7"
    );
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(vi.mocked(calculateGovernanceMetrics)).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-123",
        days: 7,
      })
    );
  });

  it("should cap days parameter at 90", async () => {
    vi.mocked(requireWorkspaceContext).mockResolvedValueOnce({
      workspaceId: "ws-123",
    } as any);

    vi.mocked(calculateGovernanceMetrics).mockResolvedValueOnce({} as any);

    const request = new NextRequest(
      "http://localhost/api/governance/metrics?days=365"
    );
    await GET(request);

    expect(vi.mocked(calculateGovernanceMetrics)).toHaveBeenCalledWith(
      expect.objectContaining({
        days: 90,
      })
    );
  });

  it("should enforce minimum of 1 day", async () => {
    vi.mocked(requireWorkspaceContext).mockResolvedValueOnce({
      workspaceId: "ws-123",
    } as any);

    vi.mocked(calculateGovernanceMetrics).mockResolvedValueOnce({} as any);

    const request = new NextRequest(
      "http://localhost/api/governance/metrics?days=0"
    );
    await GET(request);

    expect(vi.mocked(calculateGovernanceMetrics)).toHaveBeenCalledWith(
      expect.objectContaining({
        days: 1,
      })
    );
  });

  it("should enforce workspace isolation", async () => {
    vi.mocked(requireWorkspaceContext).mockResolvedValueOnce({
      workspaceId: "ws-test-456",
    } as any);

    vi.mocked(calculateGovernanceMetrics).mockResolvedValueOnce({} as any);

    const request = new NextRequest("http://localhost/api/governance/metrics");
    await GET(request);

    expect(vi.mocked(calculateGovernanceMetrics)).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-test-456",
      })
    );
  });

  it("should handle internal server errors", async () => {
    vi.mocked(requireWorkspaceContext).mockResolvedValueOnce({
      workspaceId: "ws-123",
    } as any);

    vi.mocked(calculateGovernanceMetrics).mockRejectedValueOnce(
      new Error("Database connection failed")
    );

    const request = new NextRequest("http://localhost/api/governance/metrics");
    const response = await GET(request);

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe("Internal server error");
  });
});
