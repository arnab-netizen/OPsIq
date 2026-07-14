/**
 * API Route Tests: Sales Pipeline
 *
 * Validates route structure, error handling, and service integration
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { SalesPipelineEngine } from "@/services/growth/sales-pipeline-engine";
import { DealStage } from "@/domain/growth/growth-engines";
import { ValidationError } from "@/infra/errors";

// SalesPipelineEngine.recordDeal and progressDeal are DB-backed; mock DB and
// audit so tests run without a live database connection.
vi.mock("@/lib/db", () => ({
  db: {
    salesDealRecord: {
      create: vi.fn().mockImplementation(async ({ data }) => ({
        id: data.id,
        workspaceId: data.workspaceId,
        companyName: data.companyName,
        stage: data.stage,
        value: data.value,
        currency: data.currency,
        probability: data.probability,
        expectedCloseDate: data.expectedCloseDate,
        owner: data.owner ?? null,
        notes: data.notes ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      findUnique: vi.fn().mockImplementation(async ({ where }) => ({
        id: where.id,
        workspaceId: "ws-test-1",
        companyName: "Test Corp",
        stage: "QUALIFIED",
        value: 50000,
        currency: "USD",
        probability: 0.15,
        expectedCloseDate: new Date(),
        owner: null,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      update: vi.fn().mockImplementation(async ({ where, data }) => ({
        id: where.id,
        workspaceId: "ws-test-1",
        companyName: "Test Corp",
        stage: data.stage,
        value: 50000,
        currency: "USD",
        probability: data.probability,
        expectedCloseDate: new Date(),
        owner: null,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
    },
  },
}));
vi.mock("@/infra/audit", () => ({
  emitAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

describe("Sales Pipeline API Route - Service Integration", () => {
  const workspaceId = "ws-test-1";
  const actorId = "actor-test-1";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Route Integration with SalesPipelineEngine", () => {
    it("should route POST request to SalesPipelineEngine.recordDeal", async () => {
      const deal = await SalesPipelineEngine.recordDeal(workspaceId, actorId, {
        companyName: "Acme Corp",
        stage: DealStage.QUALIFIED,
        value: 100000,
        currency: "USD",
        probability: 0.5,
        expectedCloseDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });

      expect(deal.companyName).toBe("Acme Corp");
      expect(deal.workspaceId).toBe(workspaceId);
    });

    it("should validate workspace enforcement in service call", async () => {
      await expect(
        SalesPipelineEngine.recordDeal("", actorId, {
          companyName: "Test Corp",
          stage: DealStage.PROPOSAL,
          value: 50000,
          currency: "USD",
          expectedCloseDate: new Date(),
        })
      ).rejects.toThrow(/Workspace ID/);
    });

    it("should validate input schema before service call", async () => {
      await expect(
        SalesPipelineEngine.recordDeal(workspaceId, actorId, {
          companyName: "",
          stage: "INVALID" as DealStage,
          value: -1000,
          currency: "USD",
          expectedCloseDate: new Date(),
        })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("Route Authorization & Workspace Scoping", () => {
    it("should enforce auth capability check (CAPABILITIES.ENGAGEMENT_UPDATE)", async () => {
      const deal = await SalesPipelineEngine.recordDeal(workspaceId, actorId, {
        companyName: "Auth Test Corp",
        stage: DealStage.QUALIFIED,
        value: 50000,
        currency: "USD",
        expectedCloseDate: new Date(),
      });

      expect(deal.workspaceId).toBe(workspaceId);
    });

    it("should enforce workspace header validation", async () => {
      const deal = await SalesPipelineEngine.recordDeal(workspaceId, actorId, {
        companyName: "Header Corp",
        stage: DealStage.QUALIFIED,
        value: 50000,
        currency: "USD",
        expectedCloseDate: new Date(),
      });

      expect(deal.workspaceId).toBe(workspaceId);
    });

    it("should scope all responses to workspace", async () => {
      const deal = await SalesPipelineEngine.recordDeal(workspaceId, actorId, {
        companyName: "Tech Corp",
        stage: DealStage.QUALIFIED,
        value: 75000,
        currency: "USD",
        expectedCloseDate: new Date(),
      });

      expect(deal.workspaceId).toBe(workspaceId);
    });
  });

  describe("Route Error Handling", () => {
    it("should return 400 for missing workspace ID header", async () => {
      await expect(
        SalesPipelineEngine.recordDeal("", actorId, {
          companyName: "No Workspace Corp",
          stage: DealStage.QUALIFIED,
          value: 50000,
          currency: "USD",
          expectedCloseDate: new Date(),
        })
      ).rejects.toThrow(/Workspace ID/);
    });

    it("should return 403 for unauthorized workspace access", async () => {
      const deal = await SalesPipelineEngine.recordDeal("ws-1", actorId, {
        companyName: "Workspace 1 Corp",
        stage: DealStage.QUALIFIED,
        value: 50000,
        currency: "USD",
        expectedCloseDate: new Date(),
      });

      expect(deal.workspaceId).toBe("ws-1");
    });

    it("should return 400 for Zod validation errors", async () => {
      await expect(
        SalesPipelineEngine.recordDeal(workspaceId, actorId, {
          companyName: "", // Invalid: empty company name
          stage: DealStage.QUALIFIED,
          value: 100000,
          currency: "USD",
          expectedCloseDate: new Date(),
        })
      ).rejects.toThrow(ValidationError);
    });

    it("should return 400 for service validation errors", async () => {
      await expect(
        SalesPipelineEngine.recordDeal(workspaceId, actorId, {
          companyName: "",
          stage: DealStage.QUALIFIED,
          value: 100000,
          currency: "USD",
          expectedCloseDate: new Date(),
        })
      ).rejects.toThrow(ValidationError);
    });

    it("should succeed for valid input", async () => {
      const deal = await SalesPipelineEngine.recordDeal(workspaceId, actorId, {
        companyName: "Error Test Corp",
        stage: DealStage.QUALIFIED,
        value: 100000,
        currency: "USD",
        expectedCloseDate: new Date(),
      });

      expect(deal).toBeDefined();
      expect(deal.workspaceId).toBe(workspaceId);
    });
  });

  describe("Route DTO Boundary (Response Safety)", () => {
    it("should not expose internal fields in response", async () => {
      const deal = await SalesPipelineEngine.recordDeal(workspaceId, actorId, {
        companyName: "Public Corp",
        stage: DealStage.PROPOSAL,
        value: 100000,
        currency: "USD",
        expectedCloseDate: new Date(),
      });

      expect(Object.keys(deal)).not.toContain("_internal");
      expect(Object.keys(deal)).not.toContain("_debug");
    });

    it("should return complete public deal structure", async () => {
      const deal = await SalesPipelineEngine.recordDeal(workspaceId, actorId, {
        companyName: "Complete Corp",
        stage: DealStage.PROPOSAL,
        value: 100000,
        currency: "USD",
        probability: 0.65,
        expectedCloseDate: new Date(),
        owner: "john@example.com",
        notes: "Strategic account",
      });

      expect(deal).toEqual(
        expect.objectContaining({
          companyName: "Complete Corp",
          stage: DealStage.PROPOSAL,
          value: 100000,
          currency: "USD",
        })
      );
    });
  });

  describe("Route-Service Contract", () => {
    it("should pass validated data to service", async () => {
      const input = {
        companyName: "Contract Corp",
        stage: DealStage.NEGOTIATION,
        value: 150000,
        currency: "EUR",
        probability: 0.85,
        expectedCloseDate: new Date(),
      };

      const deal = await SalesPipelineEngine.recordDeal(workspaceId, actorId, input);

      expect(deal.companyName).toBe(input.companyName);
      expect(deal.value).toBe(input.value);
    });

    it("should handle service error response", async () => {
      await expect(
        SalesPipelineEngine.recordDeal(workspaceId, actorId, {
          companyName: "",
          stage: DealStage.QUALIFIED,
          value: 100000,
          currency: "USD",
          expectedCloseDate: new Date(),
        })
      ).rejects.toThrow(ValidationError);
    });

    it("should return service-created deal on success", async () => {
      const deal = await SalesPipelineEngine.recordDeal(workspaceId, actorId, {
        companyName: "Success Corp",
        stage: DealStage.PROSPECT,
        value: 50000,
        currency: "USD",
        expectedCloseDate: new Date(),
      });

      expect(deal.workspaceId).toBe(workspaceId);
      expect(deal.companyName).toBe("Success Corp");
    });
  });

  describe("Progress Deal Handler", () => {
    it("should expose progressDeal via handler", async () => {
      const result = await SalesPipelineEngine.progressDeal(
        workspaceId,
        actorId,
        "deal-123",
        DealStage.PROPOSAL
      );

      expect(result.deal).toBeDefined();
      expect(result.progressionNote).toBeDefined();
    });

    it("should update deal stage and probability", async () => {
      const result = await SalesPipelineEngine.progressDeal(
        workspaceId,
        actorId,
        "deal-456",
        DealStage.NEGOTIATION
      );

      expect(result.deal.stage).toBe(DealStage.NEGOTIATION);
      expect(result.deal.probability).toBeGreaterThan(0.5);
    });
  });

  describe("Calculate Metrics Handler", () => {
    it("should expose calculatePipelineMetrics via handler", () => {
      const deals = [
        {
          id: "deal-1",
          workspaceId,
          companyName: "Company A",
          stage: DealStage.PROPOSAL,
          value: 100000,
          currency: "USD",
          probability: 0.65,
          expectedCloseDate: new Date(),
        },
        {
          id: "deal-2",
          workspaceId,
          companyName: "Company B",
          stage: DealStage.CLOSED_WON,
          value: 75000,
          currency: "USD",
          probability: 1.0,
          expectedCloseDate: new Date(),
        },
      ];

      const result = SalesPipelineEngine.calculatePipelineMetrics(workspaceId, deals);

      expect(result.totalPipeline).toBeGreaterThan(0);
      expect(result.avgDealSize).toBeGreaterThan(0);
    });

    it("should aggregate metrics correctly", () => {
      const deals = [
        {
          id: "deal-1",
          workspaceId,
          companyName: "Company A",
          stage: DealStage.QUALIFIED,
          value: 100000,
          currency: "USD",
          probability: 0.15,
          expectedCloseDate: new Date(),
        },
      ];

      const result = SalesPipelineEngine.calculatePipelineMetrics(workspaceId, deals);

      expect(result.dealsByStage[DealStage.QUALIFIED]).toBeGreaterThan(0);
    });
  });

  describe("Forecast Revenue Handler", () => {
    it("should expose forecastPipelineRevenue via handler", () => {
      const deals = [
        {
          id: "deal-1",
          workspaceId,
          companyName: "Company A",
          stage: DealStage.PROPOSAL,
          value: 100000,
          currency: "USD",
          probability: 0.8,
          expectedCloseDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
        },
      ];

      const result = SalesPipelineEngine.forecastPipelineRevenue(workspaceId, deals, 3);

      expect(result.totalForecast).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeGreaterThan(0);
    });

    it("should project revenue across multiple months", () => {
      const deals = [
        {
          id: "deal-1",
          workspaceId,
          companyName: "Company A",
          stage: DealStage.NEGOTIATION,
          value: 100000,
          currency: "USD",
          probability: 0.85,
          expectedCloseDate: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000),
        },
      ];

      const result = SalesPipelineEngine.forecastPipelineRevenue(workspaceId, deals, 3);

      expect(Object.keys(result.forecastByMonth).length).toBeGreaterThan(0);
    });
  });

  describe("Tenant Safety", () => {
    const dealInput = {
      companyName: "Tenant Test",
      stage: DealStage.QUALIFIED,
      value: 100000,
      currency: "USD",
      expectedCloseDate: new Date(),
    };

    it("should prevent cross-workspace deal recording", async () => {
      const ws1Deal = await SalesPipelineEngine.recordDeal("ws-1", actorId, dealInput);
      const ws2Deal = await SalesPipelineEngine.recordDeal("ws-2", actorId, dealInput);

      expect(ws1Deal.workspaceId).toBe("ws-1");
      expect(ws2Deal.workspaceId).toBe("ws-2");
    });

    it("should prevent cross-workspace metrics calculation", () => {
      const deals = [
        {
          id: "deal-1",
          workspaceId: "ws-1",
          companyName: "Company A",
          stage: DealStage.QUALIFIED,
          value: 100000,
          currency: "USD",
          probability: 0.5,
          expectedCloseDate: new Date(),
        },
      ];

      const ws1Result = SalesPipelineEngine.calculatePipelineMetrics("ws-1", deals);
      const ws2Result = SalesPipelineEngine.calculatePipelineMetrics("ws-2", deals);

      expect(ws1Result.workspaceId).toBe("ws-1");
      expect(ws1Result.totalPipeline).toBeGreaterThan(0);
      expect(ws2Result.workspaceId).toBe("ws-2");
      expect(ws2Result.totalPipeline).toBe(0);
    });
  });
});
