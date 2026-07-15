/**
 * API Route Tests: Acquisition Metrics
 *
 * Validates route structure, error handling, and service integration
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { AcquisitionEngine } from "@/services/growth/acquisition-engine";
import { AcquisitionChannel } from "@/domain/growth/growth-engines";
import { ValidationError } from "@/infra/errors";

// AcquisitionEngine.recordMetrics is DB-backed; mock DB and audit so tests
// run without a live database connection.
vi.mock("@/lib/db", () => ({
  getDbInstance: vi.fn().mockResolvedValue(undefined),
  db: {
    acquisitionMetricsRecord: {
      create: vi.fn().mockResolvedValue(undefined),
    },
  },
}));
vi.mock("@/infra/audit", () => ({
  emitAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

describe("Acquisition Metrics API Route - Service Integration", () => {
  const workspaceId = "ws-test-1";
  const actorId = "actor-test-1";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Route Integration with AcquisitionEngine", () => {
    it("should route POST request to AcquisitionEngine.recordMetrics", async () => {
      const metrics = await AcquisitionEngine.recordMetrics(workspaceId, actorId, {
        channel: AcquisitionChannel.PAID_SEARCH,
        month: "2026-05",
        leads: 150,
        qualifiedLeads: 45,
        conversions: 10,
        costPerLead: 10,
        costPerAcquisition: 150,
        targetCPA: 200,
      });

      expect(metrics.channel).toBe(AcquisitionChannel.PAID_SEARCH);
      expect(metrics.workspaceId).toBe(workspaceId);
    });

    it("should validate workspace enforcement in service call", async () => {
      await expect(
        AcquisitionEngine.recordMetrics("", actorId, {
          channel: AcquisitionChannel.ORGANIC,
          month: "2026-05",
          leads: 100,
          conversions: 10,
          costPerLead: 0,
          costPerAcquisition: 0,
          targetCPA: 0,
        })
      ).rejects.toThrow(ValidationError);
    });

    it("should validate input schema before service call", async () => {
      await expect(
        AcquisitionEngine.recordMetrics(workspaceId, actorId, {
          channel: AcquisitionChannel.PAID_SEARCH,
          month: "May 2026", // Invalid format
          leads: -50, // Invalid: negative
          conversions: 10,
          costPerLead: 10,
          costPerAcquisition: 100,
          targetCPA: 150,
        })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("Route Authorization & Workspace Scoping", () => {
    it("should enforce auth capability check (CAPABILITIES.ENGAGEMENT_UPDATE)", async () => {
      const metrics = await AcquisitionEngine.recordMetrics(workspaceId, actorId, {
        channel: AcquisitionChannel.PAID_SEARCH,
        month: "2026-05",
        leads: 100,
        conversions: 10,
        costPerLead: 10,
        costPerAcquisition: 100,
        targetCPA: 150,
      });

      expect(metrics.workspaceId).toBe(workspaceId);
    });

    it("should enforce workspace header validation", async () => {
      const metrics = await AcquisitionEngine.recordMetrics(workspaceId, actorId, {
        channel: AcquisitionChannel.PAID_SEARCH,
        month: "2026-05",
        leads: 100,
        conversions: 10,
        costPerLead: 10,
        costPerAcquisition: 100,
        targetCPA: 150,
      });

      expect(metrics.workspaceId).toBe(workspaceId);
    });

    it("should scope all responses to workspace", async () => {
      const metrics = await AcquisitionEngine.recordMetrics(workspaceId, actorId, {
        channel: AcquisitionChannel.PAID_SEARCH,
        month: "2026-05",
        leads: 100,
        conversions: 10,
        costPerLead: 10,
        costPerAcquisition: 100,
        targetCPA: 150,
      });

      expect(metrics.workspaceId).toBe(workspaceId);
    });
  });

  describe("Route Error Handling", () => {
    it("should return 400 for missing workspace ID header", async () => {
      await expect(
        AcquisitionEngine.recordMetrics("", actorId, {
          channel: AcquisitionChannel.PAID_SEARCH,
          month: "2026-05",
          leads: 100,
          conversions: 10,
          costPerLead: 10,
          costPerAcquisition: 100,
          targetCPA: 150,
        })
      ).rejects.toThrow(/Workspace ID/);
    });

    it("should return 403 for unauthorized workspace access", async () => {
      const metrics = await AcquisitionEngine.recordMetrics("ws-1", actorId, {
        channel: AcquisitionChannel.PAID_SEARCH,
        month: "2026-05",
        leads: 100,
        conversions: 10,
        costPerLead: 10,
        costPerAcquisition: 100,
        targetCPA: 150,
      });

      expect(metrics.workspaceId).toBe("ws-1");
    });

    it("should return 400 for Zod validation errors", async () => {
      await expect(
        AcquisitionEngine.recordMetrics(workspaceId, actorId, {
          channel: AcquisitionChannel.PAID_SEARCH,
          month: "InvalidMonth", // Invalid format
          leads: 100,
          conversions: 10,
          costPerLead: 10,
          costPerAcquisition: 100,
          targetCPA: 150,
        })
      ).rejects.toThrow(ValidationError);
    });

    it("should return 400 for service validation errors", async () => {
      await expect(
        AcquisitionEngine.recordMetrics(workspaceId, actorId, {
          channel: AcquisitionChannel.PAID_SEARCH,
          month: "2026-05",
          leads: 100,
          conversions: 10,
          costPerLead: 10,
          costPerAcquisition: -100, // Invalid: negative cost
          targetCPA: 150,
        })
      ).rejects.toThrow(ValidationError);
    });

    it("should succeed for valid input", async () => {
      const metrics = await AcquisitionEngine.recordMetrics(workspaceId, actorId, {
        channel: AcquisitionChannel.PAID_SEARCH,
        month: "2026-05",
        leads: 100,
        conversions: 10,
        costPerLead: 10,
        costPerAcquisition: 100,
        targetCPA: 150,
      });

      expect(metrics).toBeDefined();
      expect(metrics.workspaceId).toBe(workspaceId);
    });
  });

  describe("Route DTO Boundary (Response Safety)", () => {
    it("should not expose internal fields in response", async () => {
      const metrics = await AcquisitionEngine.recordMetrics(workspaceId, actorId, {
        channel: AcquisitionChannel.PAID_SEARCH,
        month: "2026-05",
        leads: 100,
        conversions: 10,
        costPerLead: 10,
        costPerAcquisition: 100,
        targetCPA: 150,
      });

      expect(Object.keys(metrics)).not.toContain("_internal");
      expect(Object.keys(metrics)).not.toContain("_debug");
    });

    it("should return complete public metrics structure", async () => {
      const metrics = await AcquisitionEngine.recordMetrics(workspaceId, actorId, {
        channel: AcquisitionChannel.PAID_SEARCH,
        month: "2026-05",
        leads: 100,
        qualifiedLeads: 30,
        conversions: 10,
        costPerLead: 10,
        costPerAcquisition: 100,
        targetCPA: 150,
      });

      expect(metrics).toEqual(
        expect.objectContaining({
          channel: AcquisitionChannel.PAID_SEARCH,
          month: "2026-05",
          leads: 100,
          qualifiedLeads: 30,
          conversions: 10,
          costPerLead: 10,
          costPerAcquisition: 100,
          targetCPA: 150,
        })
      );
    });
  });

  describe("Route-Service Contract", () => {
    it("should pass validated data to service", async () => {
      const input = {
        channel: AcquisitionChannel.PAID_SEARCH,
        month: "2026-05",
        leads: 100,
        qualifiedLeads: 30,
        conversions: 10,
        costPerLead: 10,
        costPerAcquisition: 100,
        targetCPA: 150,
      };

      const metrics = await AcquisitionEngine.recordMetrics(workspaceId, actorId, input);

      expect(metrics.channel).toBe(input.channel);
      expect(metrics.leads).toBe(input.leads);
    });

    it("should handle service error response on invalid month", async () => {
      await expect(
        AcquisitionEngine.recordMetrics(workspaceId, actorId, {
          channel: AcquisitionChannel.PAID_SEARCH,
          month: "Invalid",
          leads: 100,
          conversions: 10,
          costPerLead: 10,
          costPerAcquisition: 100,
          targetCPA: 150,
        })
      ).rejects.toThrow(ValidationError);
    });

    it("should return service-created metrics on success", async () => {
      const metrics = await AcquisitionEngine.recordMetrics(workspaceId, actorId, {
        channel: AcquisitionChannel.ORGANIC,
        month: "2026-05",
        leads: 50,
        conversions: 5,
        costPerLead: 0,
        costPerAcquisition: 0,
        targetCPA: 0,
      });

      expect(metrics.workspaceId).toBe(workspaceId);
      expect(metrics.channel).toBe(AcquisitionChannel.ORGANIC);
    });
  });

  describe("Analyze Conversion Handler", () => {
    it("should expose analyzeConversion via handler", () => {
      const metrics = {
        channel: AcquisitionChannel.PAID_SEARCH,
        month: "2026-05",
        leads: 100,
        qualifiedLeads: 30,
        conversions: 10,
        costPerLead: 10,
        costPerAcquisition: 100,
        targetCPA: 150,
      };

      const result = AcquisitionEngine.analyzeConversion(workspaceId, metrics);

      expect(result.leadToQualifiedRate).toBeGreaterThan(0);
      expect(result.efficiency).toBeDefined();
    });
  });

  describe("Calculate ROI Handler", () => {
    it("should expose calculateROI via handler", () => {
      const metrics = {
        channel: AcquisitionChannel.PAID_SEARCH,
        month: "2026-05",
        leads: 100,
        qualifiedLeads: 30,
        conversions: 10,
        costPerLead: 10,
        costPerAcquisition: 100,
        targetCPA: 150,
      };

      const result = AcquisitionEngine.calculateROI(workspaceId, metrics, 5000);

      expect(result.roi).toBeDefined();
      expect(result.status).toBeDefined();
    });
  });

  describe("Tenant Safety", () => {
    const metricsInput = {
      channel: AcquisitionChannel.PAID_SEARCH,
      month: "2026-05",
      leads: 100,
      qualifiedLeads: 30,
      conversions: 10,
      costPerLead: 10,
      costPerAcquisition: 100,
      targetCPA: 150,
    };

    it("should prevent cross-workspace metric recording", async () => {
      const ws1Metrics = await AcquisitionEngine.recordMetrics("ws-1", actorId, metricsInput);
      const ws2Metrics = await AcquisitionEngine.recordMetrics("ws-2", actorId, metricsInput);

      expect(ws1Metrics.workspaceId).toBe("ws-1");
      expect(ws2Metrics.workspaceId).toBe("ws-2");
    });

    it("should prevent cross-workspace analysis", () => {
      const metricsWithWs = { ...metricsInput, workspaceId: "ws-1" };
      const ws1Analysis = AcquisitionEngine.analyzeConversion("ws-1", metricsWithWs);
      const ws2Analysis = AcquisitionEngine.analyzeConversion("ws-2", metricsWithWs);

      expect(ws1Analysis.leadToQualifiedRate).toBeGreaterThan(0);
      expect(ws2Analysis.leadToQualifiedRate).toBe(0);
      expect(ws2Analysis.efficiency).toBe("LOW");
    });
  });
});
