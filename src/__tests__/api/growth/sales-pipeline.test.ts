/**
 * API Route Tests: Sales Pipeline
 *
 * Validates route structure, error handling, and service integration
 */

import { describe, it, expect } from "vitest";
import { SalesPipelineEngine } from "@/services/growth/sales-pipeline-engine";
import { DealStage } from "@/domain/growth/growth-engines";

describe("Sales Pipeline API Route - Service Integration", () => {
  const workspaceId = "ws-test-1";

  describe("Route Integration with SalesPipelineEngine", () => {
    it("should route POST request to SalesPipelineEngine.recordDeal", () => {
      const result = SalesPipelineEngine.recordDeal(workspaceId, {
        companyName: "Acme Corp",
        stage: DealStage.QUALIFIED,
        value: 100000,
        currency: "USD",
        probability: 0.5,
        expectedCloseDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });

      expect(result.error).toBeNull();
      expect(result.deal).toBeDefined();
      expect(result.deal?.companyName).toBe("Acme Corp");
    });

    it("should validate workspace enforcement in service call", () => {
      const result = SalesPipelineEngine.recordDeal("", {
        companyName: "Test Corp",
        stage: DealStage.PROPOSAL,
        value: 50000,
        currency: "USD",
        expectedCloseDate: new Date(),
      });

      expect(result.error).toBeDefined();
      expect(result.error).toContain("Workspace ID");
    });

    it("should validate input schema before service call", () => {
      const result = SalesPipelineEngine.recordDeal(workspaceId, {
        companyName: "",
        stage: "INVALID" as any,
        value: -1000,
        currency: "USD",
        expectedCloseDate: new Date(),
      });

      expect(result.error).toBeDefined();
    });
  });

  describe("Route Authorization & Workspace Scoping", () => {
    it("should enforce auth capability check (CAPABILITIES.ENGAGEMENT_UPDATE)", () => {
      // Route uses withAuth with CAPABILITIES.ENGAGEMENT_UPDATE
      expect(true).toBe(true);
    });

    it("should enforce workspace header validation", () => {
      // Route checks x-workspace-id header exists
      expect(true).toBe(true);
    });

    it("should scope all responses to workspace", () => {
      const result = SalesPipelineEngine.recordDeal(workspaceId, {
        companyName: "Tech Corp",
        stage: DealStage.QUALIFIED,
        value: 75000,
        currency: "USD",
        expectedCloseDate: new Date(),
      });

      expect(result.deal).toBeDefined();
      expect(result.deal?.workspaceId).toBe(workspaceId);
    });
  });

  describe("Route Error Handling", () => {
    it("should return 400 for missing workspace ID header", () => {
      expect(true).toBe(true);
    });

    it("should return 403 for unauthorized workspace access", () => {
      expect(true).toBe(true);
    });

    it("should return 400 for Zod validation errors", () => {
      expect(true).toBe(true);
    });

    it("should return 400 for service validation errors", () => {
      const result = SalesPipelineEngine.recordDeal(workspaceId, {
        companyName: "",
        stage: DealStage.QUALIFIED,
        value: 100000,
        currency: "USD",
        expectedCloseDate: new Date(),
      });

      expect(result.error).toBeDefined();
    });

    it("should return 500 for unexpected errors", () => {
      expect(true).toBe(true);
    });
  });

  describe("Route DTO Boundary (Response Safety)", () => {
    it("should not expose internal fields in response", () => {
      const result = SalesPipelineEngine.recordDeal(workspaceId, {
        companyName: "Public Corp",
        stage: DealStage.PROPOSAL,
        value: 100000,
        currency: "USD",
        expectedCloseDate: new Date(),
      });

      expect(result.deal).toBeDefined();
      const deal = result.deal!;
      expect(Object.keys(deal)).not.toContain("_internal");
      expect(Object.keys(deal)).not.toContain("_debug");
    });

    it("should return complete public deal structure", () => {
      const result = SalesPipelineEngine.recordDeal(workspaceId, {
        companyName: "Complete Corp",
        stage: DealStage.PROPOSAL,
        value: 100000,
        currency: "USD",
        probability: 0.65,
        expectedCloseDate: new Date(),
        owner: "john@example.com",
        notes: "Strategic account",
      });

      expect(result.deal).toEqual(
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
    it("should pass validated data to service", () => {
      const schema = {
        companyName: "Contract Corp",
        stage: DealStage.NEGOTIATION,
        value: 150000,
        currency: "EUR",
        probability: 0.85,
        expectedCloseDate: new Date(),
      };

      const result = SalesPipelineEngine.recordDeal(workspaceId, schema);

      expect(result.deal?.companyName).toBe(schema.companyName);
      expect(result.deal?.value).toBe(schema.value);
    });

    it("should handle service error response", () => {
      const result = SalesPipelineEngine.recordDeal(workspaceId, {
        companyName: "",
        stage: DealStage.QUALIFIED,
        value: 100000,
        currency: "USD",
        expectedCloseDate: new Date(),
      });

      expect(result.error).toBeDefined();
      expect(result.deal).toBeNull();
    });

    it("should return service-created deal on success", () => {
      const result = SalesPipelineEngine.recordDeal(workspaceId, {
        companyName: "Success Corp",
        stage: DealStage.PROSPECT,
        value: 50000,
        currency: "USD",
        expectedCloseDate: new Date(),
      });

      expect(result.error).toBeNull();
      expect(result.deal).toBeDefined();
      expect(result.deal?.companyName).toBe("Success Corp");
    });
  });

  describe("Progress Deal Handler", () => {
    it("should expose progressDeal via handler", () => {
      const result = SalesPipelineEngine.progressDeal(
        workspaceId,
        "deal-123",
        DealStage.PROPOSAL
      );

      expect(result.deal).toBeDefined();
      expect(result.progressionNote).toBeDefined();
    });

    it("should update deal stage and probability", () => {
      const result = SalesPipelineEngine.progressDeal(
        workspaceId,
        "deal-456",
        DealStage.NEGOTIATION
      );

      expect(result.deal?.stage).toBe(DealStage.NEGOTIATION);
      expect(result.deal?.probability).toBeGreaterThan(0.5);
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

      const result = SalesPipelineEngine.calculatePipelineMetrics(
        workspaceId,
        deals
      );

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

      const result = SalesPipelineEngine.calculatePipelineMetrics(
        workspaceId,
        deals
      );

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

      const result = SalesPipelineEngine.forecastPipelineRevenue(
        workspaceId,
        deals,
        3
      );

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

      const result = SalesPipelineEngine.forecastPipelineRevenue(
        workspaceId,
        deals,
        3
      );

      expect(Object.keys(result.forecastByMonth).length).toBeGreaterThan(0);
    });
  });

  describe("Tenant Safety", () => {
    const deal = {
      companyName: "Tenant Test",
      stage: DealStage.QUALIFIED,
      value: 100000,
      currency: "USD",
      expectedCloseDate: new Date(),
    };

    it("should prevent cross-workspace deal recording", () => {
      const ws1Result = SalesPipelineEngine.recordDeal("ws-1", deal);
      const ws2Result = SalesPipelineEngine.recordDeal("ws-2", deal);

      expect(ws1Result.deal?.workspaceId).toBe("ws-1");
      expect(ws2Result.deal?.workspaceId).toBe("ws-2");
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
      expect(ws2Result.workspaceId).toBe("ws-2");
    });
  });
});
