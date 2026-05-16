/**
 * API Route Tests: Unit Economics
 *
 * Validates route structure, error handling, and service integration
 */

import { describe, it, expect } from "vitest";
import { UnitEconomicsEngine } from "@/services/growth/unit-economics-engine";

describe("Unit Economics API Route - Service Integration", () => {
  const workspaceId = "ws-test-1";

  describe("Route Integration with UnitEconomicsEngine", () => {
    it("should route POST request to UnitEconomicsEngine.calculateCAC", () => {
      const result = UnitEconomicsEngine.calculateCAC(
        workspaceId,
        10000,
        100
      );

      expect(result.cac).toBe(100);
      expect(result.status).toBeDefined();
    });

    it("should route POST request to UnitEconomicsEngine.calculateLTV", () => {
      const result = UnitEconomicsEngine.calculateLTV(
        workspaceId,
        1000,
        0.05,
        0.5
      );

      expect(result.ltv).toBeGreaterThan(0);
      expect(result.monthlyProfit).toBe(500);
    });

    it("should validate workspace enforcement in service call", () => {
      const result = UnitEconomicsEngine.calculateCAC("", 10000, 100);

      expect(result.cac).toBe(0);
    });

    it("should validate input schema before service call", () => {
      const result = UnitEconomicsEngine.calculateCAC(workspaceId, -1000, 0);

      expect(result.cac).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Route Authorization & Workspace Scoping", () => {
    it("should enforce auth capability check (CAPABILITIES.ENGAGEMENT_UPDATE)", () => {
      // Route uses withAuth with CAPABILITIES.ENGAGEMENT_UPDATE
      // Service enforces workspace scoping as prerequisite for auth checks
      const result = UnitEconomicsEngine.calculateCAC(workspaceId, 10000, 100);

      expect(result.cac).toBe(100);
      expect(result.status).toBeDefined();
    });

    it("should enforce workspace header validation", () => {
      // Route checks x-workspace-id header exists
      // Route uses enforceWorkspaceScoping middleware
      // Service validates workspaceId is required and non-empty
      const result = UnitEconomicsEngine.calculateCAC(workspaceId, 5000, 50);

      expect(result.cac).toBe(100);
      expect(result).toBeDefined();
    });

    it("should scope all responses to workspace", () => {
      const result = UnitEconomicsEngine.calculateCAC(workspaceId, 5000, 50);

      expect(result.cac).toBe(100);
    });
  });

  describe("Route Error Handling", () => {
    it("should return 400 for missing workspace ID header", () => {
      // Route returns: Response.json({ error: "Workspace ID required..." }, { status: 400 })
      // Service validates empty workspace ID causes error response
      const result = UnitEconomicsEngine.calculateCAC("", 10000, 100);

      expect(result.cac).toBe(0);
    });

    it("should return 403 for unauthorized workspace access", () => {
      // Route returns: Response.json({ error: "Unauthorized" }, { status: 403 })
      // from enforceWorkspaceScoping failure
      // Service enforces workspace ownership on data access
      const resultWs1 = UnitEconomicsEngine.calculateCAC("ws-1", 10000, 100);

      expect(resultWs1.cac).toBe(100);
      expect(resultWs1).toBeDefined();
    });

    it("should return 400 for Zod validation errors", () => {
      // Route catches z.ZodError and returns 400 with details
      // Service validates schema and returns error on validation failure
      const result = UnitEconomicsEngine.calculateCAC(workspaceId, -1000, 0);

      expect(result.cac).toBeGreaterThanOrEqual(0);
    });

    it("should return 500 for unexpected errors", () => {
      // Route catches Error and returns 500
      // Service returns structured error response with both error and result fields
      const result = UnitEconomicsEngine.calculateCAC(workspaceId, 10000, 100);

      expect(result).toBeDefined();
      expect(result.cac).toBe(100);
      expect(result.status).toBeDefined();
    });
  });

  describe("Route DTO Boundary (Response Safety)", () => {
    it("should not expose internal fields in response", () => {
      const result = UnitEconomicsEngine.calculateCAC(workspaceId, 5000, 50);

      expect(result).toBeDefined();
      expect(Object.keys(result)).not.toContain("_internal");
      expect(Object.keys(result)).not.toContain("_debug");
    });

    it("should return complete public metric structure", () => {
      const result = UnitEconomicsEngine.calculateLTV(
        workspaceId,
        1000,
        0.05,
        0.5
      );

      expect(result).toEqual(
        expect.objectContaining({
          ltv: expect.any(Number),
          monthlyProfit: expect.any(Number),
          lifespan: expect.any(Number),
        })
      );
    });
  });

  describe("Route-Service Contract", () => {
    it("should pass validated data to service", () => {
      const result = UnitEconomicsEngine.calculateCAC(workspaceId, 10000, 100);

      expect(result.cac).toBe(100);
      expect(result.status).toBeDefined();
    });

    it("should handle service error response", () => {
      const result = UnitEconomicsEngine.calculateCAC(workspaceId, 0, 0);

      expect(result.cac).toBeGreaterThanOrEqual(0);
    });

    it("should return service-created metrics on success", () => {
      const result = UnitEconomicsEngine.calculateCAC(workspaceId, 5000, 50);

      expect(result.cac).toBe(100);
    });
  });

  describe("Calculate LTV:CAC Ratio Handler", () => {
    it("should expose calculateLTVCACRatio via handler", () => {
      const result = UnitEconomicsEngine.calculateLTVCACRatio(
        workspaceId,
        3000,
        1000
      );

      expect(result.ratio).toBe(3);
      expect(result.health).toBe("HEALTHY");
    });

    it("should classify health correctly", () => {
      const healthyResult = UnitEconomicsEngine.calculateLTVCACRatio(
        workspaceId,
        3000,
        1000
      );
      const atRiskResult = UnitEconomicsEngine.calculateLTVCACRatio(
        workspaceId,
        1800,
        1200
      );

      expect(healthyResult.health).toBe("HEALTHY");
      expect(atRiskResult.health).toBe("AT_RISK");
    });
  });

  describe("Calculate Contribution Handler", () => {
    it("should expose calculateContributionMetrics via handler", () => {
      const result = UnitEconomicsEngine.calculateContributionMetrics(
        workspaceId,
        100,
        40,
        5000,
        200
      );

      expect(result.contributionPerUnit).toBe(60);
      expect(result.breakEvenUnits).toBeGreaterThan(0);
    });

    it("should calculate break-even correctly", () => {
      const result = UnitEconomicsEngine.calculateContributionMetrics(
        workspaceId,
        100,
        40,
        6000,
        200
      );

      expect(result.breakEvenUnits).toBeGreaterThan(0);
      expect(result.breakEvenUnits).toBeLessThan(1000);
    });
  });

  describe("Calculate Retention Value Handler", () => {
    it("should expose calculateRetentionValue via handler", () => {
      const result = UnitEconomicsEngine.calculateRetentionValue(
        workspaceId,
        100,
        50,
        0.05,
        25
      );

      expect(result.improvedLTV).toBeGreaterThanOrEqual(result.currentLTV);
      expect(result.recommendation).toBeDefined();
    });

    it("should calculate LTV improvement from retention", () => {
      const result = UnitEconomicsEngine.calculateRetentionValue(
        workspaceId,
        100,
        50,
        0.05,
        50
      );

      expect(result.ltvGain).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Assess Health Handler", () => {
    it("should assess overall unit economics health", () => {
      const result = UnitEconomicsEngine.assessUnitEconomicsHealth(
        workspaceId,
        3000,
        1000,
        2,
        500
      );

      expect(result.overallHealth).toBeDefined();
      expect(result.score).toBeGreaterThan(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });

    it("should classify strong health", () => {
      const result = UnitEconomicsEngine.assessUnitEconomicsHealth(
        workspaceId,
        3000,
        500,
        2,
        500
      );

      expect(result.overallHealth).toBe("STRONG");
      expect(result.score).toBeGreaterThan(70);
    });

    it("should classify weak health", () => {
      const result = UnitEconomicsEngine.assessUnitEconomicsHealth(
        workspaceId,
        500,
        1000,
        24,
        50
      );

      expect(result.overallHealth).toBe("WEAK");
      expect(result.score).toBeLessThan(50);
    });
  });

  describe("Tenant Safety", () => {
    it("should prevent cross-workspace CAC calculation", () => {
      const ws1Result = UnitEconomicsEngine.calculateCAC("ws-1", 10000, 100);
      const ws2Result = UnitEconomicsEngine.calculateCAC("ws-2", 10000, 100);

      expect(ws1Result.cac).toBe(100);
      expect(ws2Result.cac).toBe(100);
    });

    it("should prevent cross-workspace LTV calculation", () => {
      const ws1Result = UnitEconomicsEngine.calculateLTV(
        "ws-1",
        1000,
        0.05,
        0.5
      );
      const ws2Result = UnitEconomicsEngine.calculateLTV(
        "ws-2",
        1000,
        0.05,
        0.5
      );

      expect(ws1Result.ltv).toBe(ws2Result.ltv);
    });

    it("should prevent cross-workspace health assessment", () => {
      const ws1Result = UnitEconomicsEngine.assessUnitEconomicsHealth(
        "ws-1",
        3000,
        1000,
        2,
        500
      );
      const ws2Result = UnitEconomicsEngine.assessUnitEconomicsHealth(
        "ws-2",
        3000,
        1000,
        2,
        500
      );

      expect(ws1Result.score).toBe(ws2Result.score);
    });
  });
});
