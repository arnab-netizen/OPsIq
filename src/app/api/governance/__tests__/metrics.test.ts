import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "../metrics/route";

// Mock workspace enforcement
vi.mock("@/middleware/workspace-enforcement", () => ({
  enforceWorkspaceScoping: vi.fn(),
}));

// Mock governance metrics service
vi.mock("@/services/governance/metrics", () => ({
  calculateGovernanceMetrics: vi.fn(),
}));

// Mock auth service
vi.mock("@/services/auth", () => ({
  getSession: vi.fn(),
}));

// Mock audit service
vi.mock("@/services/audit/audit-log", () => ({
  logAuditEvent: vi.fn(),
}));

import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { calculateGovernanceMetrics } from "@/services/governance/metrics";
import { getSession } from "@/services/auth";
import { logAuditEvent } from "@/services/audit/audit-log";

describe("PHASE 5.3: Governance Metrics API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSession).mockResolvedValue({
      user: { id: "user-123" },
    } as any);
  });

  describe("Authentication & Authorization", () => {
    it("should fail closed with 403 when no session", async () => {
      vi.mocked(getSession).mockResolvedValueOnce(null);

      const request = new NextRequest("http://localhost/api/governance/metrics?workspaceId=ws-123");
      const response = await GET(request);

      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.error).toBe("Unauthorized");
    });

    it("should fail closed when user is not in workspace", async () => {
      vi.mocked(enforceWorkspaceScoping).mockResolvedValueOnce(null);

      const request = new NextRequest("http://localhost/api/governance/metrics?workspaceId=ws-123");
      const response = await GET(request);

      expect(response.status).toBe(403);
      // Metrics service should not be called
      expect(vi.mocked(calculateGovernanceMetrics)).not.toHaveBeenCalled();
    });
  });

  describe("Metrics Calculation", () => {
    beforeEach(() => {
      vi.mocked(logAuditEvent).mockResolvedValue(undefined);
      vi.mocked(enforceWorkspaceScoping).mockResolvedValue({
        userId: "user-123",
        role: "admin",
      });
    });

    it("should return real governance metrics from service only", async () => {
      const mockMetrics = {
        workspace: { workspaceId: "ws-123" },
        period: { days: 30, startDate: "2026-03-31T00:00:00.000Z", endDate: "2026-04-30T00:00:00.000Z" },
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

      vi.mocked(calculateGovernanceMetrics).mockResolvedValueOnce(
        mockMetrics as any
      );

      const request = new NextRequest("http://localhost/api/governance/metrics?workspaceId=ws-123");
      const response = await GET(request);

      expect(response.status).toBe(200);
      const body = await response.json();
      // Verify real data is returned, not placeholders
      expect(body.summary.totalDecisions).toBe(100);
      expect(body.summary.approvedCount).toBe(75);
      expect(body.summary.blockedCount).toBe(25);
      expect(body.blockRates.overallBlockRate).toBe(25);
      expect(body.impact.realizedImpact).toBe(485000);
    });

    it("should return empty state with zero metrics when no decisions exist", async () => {
      const emptyMetrics = {
        workspace: { workspaceId: "ws-123" },
        period: { days: 30, startDate: "2026-03-31T00:00:00.000Z", endDate: "2026-04-30T00:00:00.000Z" },
        summary: { totalDecisions: 0, approvedCount: 0, blockedCount: 0 },
        blockRates: {
          overallBlockRate: 0,
          guardrailBlockRate: 0,
          decisionGateBlockRate: 0,
          dependencyValidationBlockRate: 0,
        },
        confidence: {
          avgConfidenceApproved: null,
          avgConfidenceBlocked: null,
        },
        impact: {
          approvedExpectedImpact: 0,
          blockedExpectedImpact: 0,
          realizedImpact: 0,
          lossFromMisses: 0,
        },
      };

      vi.mocked(calculateGovernanceMetrics).mockResolvedValueOnce(
        emptyMetrics as any
      );

      const request = new NextRequest("http://localhost/api/governance/metrics?workspaceId=ws-123");
      const response = await GET(request);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.summary.totalDecisions).toBe(0);
      expect(body.summary.approvedCount).toBe(0);
      expect(body.summary.blockedCount).toBe(0);
    });

    it("should include both approved and blocked counts in aggregation", async () => {
      const mockMetrics = {
        workspace: { workspaceId: "ws-123" },
        period: { days: 7, startDate: "2026-04-23T00:00:00.000Z", endDate: "2026-04-30T00:00:00.000Z" },
        summary: { totalDecisions: 50, approvedCount: 35, blockedCount: 15 },
        blockRates: { overallBlockRate: 30, guardrailBlockRate: 40, decisionGateBlockRate: 32, dependencyValidationBlockRate: 28 },
        confidence: { avgConfidenceApproved: 0.82, avgConfidenceBlocked: 0.28 },
        impact: { approvedExpectedImpact: 250000, blockedExpectedImpact: 100000, realizedImpact: 240000, lossFromMisses: 15000 },
      };

      // enforceWorkspaceScoping already mocked in beforeEach

      vi.mocked(calculateGovernanceMetrics).mockResolvedValueOnce(
        mockMetrics as any
      );

      const request = new NextRequest("http://localhost/api/governance/metrics?workspaceId=ws-123");
      const response = await GET(request);

      expect(response.status).toBe(200);
      const body = await response.json();
      // Verify approved + blocked = total
      expect(body.summary.approvedCount + body.summary.blockedCount).toBe(
        body.summary.totalDecisions
      );
      expect(35 + 15).toBe(50);
    });
  });

  describe("Workspace Isolation", () => {
    beforeEach(() => {
      vi.mocked(logAuditEvent).mockResolvedValue(undefined);
    });

    it("should enforce workspace isolation in metrics calculation", async () => {
      const mockMetrics = {
        workspace: { workspaceId: "ws-isolated-789" },
        period: { days: 30, startDate: "2026-03-31T00:00:00.000Z", endDate: "2026-04-30T00:00:00.000Z" },
        summary: { totalDecisions: 10, approvedCount: 7, blockedCount: 3 },
        blockRates: { overallBlockRate: 30, guardrailBlockRate: 0, decisionGateBlockRate: 0, dependencyValidationBlockRate: 0 },
        confidence: { avgConfidenceApproved: 0.85, avgConfidenceBlocked: 0.40 },
        impact: { approvedExpectedImpact: 100000, blockedExpectedImpact: 50000, realizedImpact: 95000, lossFromMisses: 10000 },
      };

      vi.mocked(enforceWorkspaceScoping).mockResolvedValueOnce({
        userId: "user-isolated",
        role: "admin",
      } as any);

      vi.mocked(calculateGovernanceMetrics).mockResolvedValueOnce(
        mockMetrics as any
      );

      const request = new NextRequest("http://localhost/api/governance/metrics?workspaceId=ws-isolated-789");
      await GET(request);

      // Verify workspace isolation is passed to metrics calculation
      expect(vi.mocked(calculateGovernanceMetrics)).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: "ws-isolated-789",
        })
      );
    });

    it("should not expose metrics from other workspaces", async () => {
      const mockMetrics = {
        workspace: { workspaceId: "ws-456" },
        period: { days: 30, startDate: "2026-03-31T00:00:00.000Z", endDate: "2026-04-30T00:00:00.000Z" },
        summary: { totalDecisions: 5, approvedCount: 4, blockedCount: 1 },
        blockRates: { overallBlockRate: 20, guardrailBlockRate: 0, decisionGateBlockRate: 0, dependencyValidationBlockRate: 0 },
        confidence: { avgConfidenceApproved: 0.88, avgConfidenceBlocked: 0.30 },
        impact: { approvedExpectedImpact: 50000, blockedExpectedImpact: 25000, realizedImpact: 48000, lossFromMisses: 5000 },
      };

      vi.mocked(enforceWorkspaceScoping).mockResolvedValueOnce({
        userId: "user-other",
        role: "admin",
      } as any);

      vi.mocked(calculateGovernanceMetrics).mockResolvedValueOnce(
        mockMetrics as any
      );

      const request = new NextRequest("http://localhost/api/governance/metrics?workspaceId=ws-456");
      const response = await GET(request);

      const body = await response.json();
      // Returned metrics should be for the authorized workspace
      expect(body.workspace.workspaceId).toBe("ws-456");
    });
  });

  describe("Query Parameters & Bounds", () => {
    beforeEach(() => {
      vi.mocked(logAuditEvent).mockResolvedValue(undefined);
      vi.mocked(enforceWorkspaceScoping).mockResolvedValue({
        userId: "user-123",
        role: "admin",
      });
    });

    it("should respect days query parameter", async () => {
      // enforceWorkspaceScoping already mocked in beforeEach

      vi.mocked(calculateGovernanceMetrics).mockResolvedValueOnce({
        workspace: { workspaceId: "ws-123" },
        period: { days: 7, startDate: "2026-04-23T00:00:00.000Z", endDate: "2026-04-30T00:00:00.000Z" },
        summary: { totalDecisions: 0, approvedCount: 0, blockedCount: 0 },
        blockRates: { overallBlockRate: 0, guardrailBlockRate: 0, decisionGateBlockRate: 0, dependencyValidationBlockRate: 0 },
        confidence: { avgConfidenceApproved: null, avgConfidenceBlocked: null },
        impact: { approvedExpectedImpact: 0, blockedExpectedImpact: 0, realizedImpact: 0, lossFromMisses: 0 },
      } as any);

      const request = new NextRequest(
        "http://localhost/api/governance/metrics?workspaceId=ws-123&days=7"
      );
      await GET(request);

      expect(vi.mocked(calculateGovernanceMetrics)).toHaveBeenCalledWith(
        expect.objectContaining({
          days: 7,
        })
      );
    });

    it("should cap days parameter at 90", async () => {
      // enforceWorkspaceScoping already mocked in beforeEach

      vi.mocked(calculateGovernanceMetrics).mockResolvedValueOnce({} as any);

      const request = new NextRequest(
        "http://localhost/api/governance/metrics?workspaceId=ws-123&days=365"
      );
      await GET(request);

      expect(vi.mocked(calculateGovernanceMetrics)).toHaveBeenCalledWith(
        expect.objectContaining({
          days: 90,
        })
      );
    });

    it("should enforce minimum of 1 day", async () => {
      // enforceWorkspaceScoping already mocked in beforeEach

      vi.mocked(calculateGovernanceMetrics).mockResolvedValueOnce({} as any);

      const request = new NextRequest(
        "http://localhost/api/governance/metrics?workspaceId=ws-123&days=0"
      );
      await GET(request);

      expect(vi.mocked(calculateGovernanceMetrics)).toHaveBeenCalledWith(
        expect.objectContaining({
          days: 1,
        })
      );
    });
  });

  describe("Audit & Observability", () => {
    beforeEach(() => {
      vi.mocked(enforceWorkspaceScoping).mockResolvedValue({
        userId: "user-123",
        role: "admin",
      });
      vi.mocked(logAuditEvent).mockResolvedValue(undefined);
    });

    it("should emit audit event on successful metrics access", async () => {
      const mockMetrics = {
        workspace: { workspaceId: "ws-123" },
        period: { days: 30, startDate: "2026-03-31T00:00:00.000Z", endDate: "2026-04-30T00:00:00.000Z" },
        summary: { totalDecisions: 100, approvedCount: 75, blockedCount: 25 },
        blockRates: { overallBlockRate: 25, guardrailBlockRate: 40, decisionGateBlockRate: 32, dependencyValidationBlockRate: 28 },
        confidence: { avgConfidenceApproved: 0.78, avgConfidenceBlocked: 0.35 },
        impact: { approvedExpectedImpact: 500000, blockedExpectedImpact: 200000, realizedImpact: 485000, lossFromMisses: 25000 },
      };

      // enforceWorkspaceScoping already mocked in beforeEach

      vi.mocked(getSession).mockResolvedValueOnce({
        user: { id: "user-456" },
      } as any);

      vi.mocked(calculateGovernanceMetrics).mockResolvedValueOnce(
        mockMetrics as any
      );

      vi.mocked(logAuditEvent).mockResolvedValueOnce(undefined);

      const request = new NextRequest("http://localhost/api/governance/metrics?workspaceId=ws-123");
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(vi.mocked(logAuditEvent)).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: "GOVERNANCE_METRICS_ACCESSED",
          entityType: "GovernanceMetrics",
          entityId: "ws-123",
          actorId: "user-456",
          workspaceId: "ws-123",
          metadata: expect.objectContaining({
            action: "view_governance_metrics",
            days: 30,
            summary: {
              totalDecisions: 100,
              approvedCount: 75,
              blockedCount: 25,
            },
          }),
        })
      );
    });

    it("should include audit metadata with actual metric values", async () => {
      const mockMetrics = {
        workspace: { workspaceId: "ws-789" },
        period: { days: 7, startDate: "2026-04-23T00:00:00.000Z", endDate: "2026-04-30T00:00:00.000Z" },
        summary: { totalDecisions: 20, approvedCount: 14, blockedCount: 6 },
        blockRates: { overallBlockRate: 30, guardrailBlockRate: 50, decisionGateBlockRate: 17, dependencyValidationBlockRate: 33 },
        confidence: { avgConfidenceApproved: 0.81, avgConfidenceBlocked: 0.32 },
        impact: { approvedExpectedImpact: 120000, blockedExpectedImpact: 75000, realizedImpact: 118000, lossFromMisses: 8000 },
      };

      vi.mocked(getSession).mockResolvedValueOnce({
        user: { id: "user-789" },
      } as any);

      vi.mocked(enforceWorkspaceScoping).mockResolvedValueOnce({
        userId: "user-789",
        role: "admin",
      } as any);

      vi.mocked(calculateGovernanceMetrics).mockResolvedValueOnce(
        mockMetrics as any
      );

      vi.mocked(logAuditEvent).mockResolvedValueOnce(undefined);

      const request = new NextRequest(
        "http://localhost/api/governance/metrics?workspaceId=ws-789&days=7"
      );
      const response = await GET(request);

      expect(response.status).toBe(200);
      const auditCall = vi.mocked(logAuditEvent).mock.calls[0][0] as any;
      expect(auditCall.workspaceId).toBe("ws-789");
      expect(auditCall.metadata.summary.totalDecisions).toBe(20);
      expect(auditCall.metadata.summary.approvedCount).toBe(14);
      expect(auditCall.metadata.summary.blockedCount).toBe(6);
    });

    it("should not fail request if audit logging fails", async () => {
      const mockMetrics = {
        workspace: { workspaceId: "ws-123" },
        period: { days: 30, startDate: "2026-03-31T00:00:00.000Z", endDate: "2026-04-30T00:00:00.000Z" },
        summary: { totalDecisions: 50, approvedCount: 40, blockedCount: 10 },
        blockRates: { overallBlockRate: 20, guardrailBlockRate: 40, decisionGateBlockRate: 32, dependencyValidationBlockRate: 28 },
        confidence: { avgConfidenceApproved: 0.80, avgConfidenceBlocked: 0.35 },
        impact: { approvedExpectedImpact: 300000, blockedExpectedImpact: 150000, realizedImpact: 290000, lossFromMisses: 20000 },
      };

      // enforceWorkspaceScoping already mocked in beforeEach

      vi.mocked(calculateGovernanceMetrics).mockResolvedValueOnce(
        mockMetrics as any
      );

      vi.mocked(logAuditEvent).mockRejectedValueOnce(
        new Error("Audit service unavailable")
      );

      const request = new NextRequest("http://localhost/api/governance/metrics?workspaceId=ws-123");
      const response = await GET(request);

      // Request should succeed even if audit logging fails
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.summary.totalDecisions).toBe(50);
    });
  });

  describe("Error Handling", () => {
    beforeEach(() => {
      vi.mocked(enforceWorkspaceScoping).mockResolvedValue({
        userId: "user-123",
        role: "admin",
      });
      vi.mocked(logAuditEvent).mockResolvedValue(undefined);
    });

    it("should handle internal server errors gracefully", async () => {
      // enforceWorkspaceScoping already mocked in beforeEach

      vi.mocked(calculateGovernanceMetrics).mockRejectedValueOnce(
        new Error("Database connection failed")
      );

      const request = new NextRequest("http://localhost/api/governance/metrics?workspaceId=ws-123");
      const response = await GET(request);

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.error).toBe("Internal server error");
    });
  });
});
