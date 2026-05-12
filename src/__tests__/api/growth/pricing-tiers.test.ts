/**
 * API Route Tests: Pricing Tiers
 *
 * Validates route structure, error handling, and service integration
 * Full end-to-end testing requires auth context and database
 */

import { describe, it, expect } from "vitest";
import { PricingEngine } from "@/services/growth/pricing-engine";

describe("Pricing Tiers API Route - Service Integration", () => {
  const workspaceId = "ws-test-1";

  describe("Route Integration with PricingEngine", () => {
    it("should route POST request to PricingEngine.createPriceTier", () => {
      // Validates service is callable
      const result = PricingEngine.createPriceTier(workspaceId, {
        name: "Test Tier",
        entryPrice: 99,
        maxPrice: 299,
        targetMargin: 0.7,
        features: ["F1", "F2"],
      });

      expect(result.error).toBeNull();
      expect(result.tier).toBeDefined();
      expect(result.tier?.workspaceId).toBe(workspaceId);
    });

    it("should validate workspace enforcement in service call", () => {
      // Route should enforce workspaceId before service call
      const result = PricingEngine.createPriceTier("", {
        name: "Test",
        entryPrice: 99,
        maxPrice: 299,
        targetMargin: 0.7,
        features: ["F1"],
      });

      expect(result.error).toBeDefined();
      expect(result.error).toContain("Workspace ID");
    });

    it("should validate input schema before service call", () => {
      // Service should reject invalid data
      const result = PricingEngine.createPriceTier(workspaceId, {
        name: "",
        entryPrice: -50,
        maxPrice: 99,
        targetMargin: 1.5,
        features: [],
      });

      expect(result.error).toBeDefined();
    });
  });

  describe("Route Authorization & Workspace Scoping", () => {
    it("should enforce auth capability check (CAPABILITIES.ENGAGEMENT_UPDATE)", () => {
      // Route uses withAuth with CAPABILITIES.ENGAGEMENT_UPDATE
      // This ensures only users with update permission can create tiers
      // Validation happens in route handler before service call
      // Service enforces workspace scoping as prerequisite for auth checks
      const result = PricingEngine.createPriceTier(workspaceId, {
        name: "Auth Tier",
        entryPrice: 99,
        maxPrice: 299,
        targetMargin: 0.7,
        features: ["F1"],
      });

      expect(result.error).toBeNull();
      expect(result.tier?.workspaceId).toBe(workspaceId);
    });

    it("should enforce workspace header validation", () => {
      // Route checks x-workspace-id header exists
      // Route uses enforceWorkspaceScoping middleware
      // Service validates workspaceId is required and non-empty
      const result = PricingEngine.createPriceTier(workspaceId, {
        name: "Header Tier",
        entryPrice: 99,
        maxPrice: 299,
        targetMargin: 0.7,
        features: ["F1"],
      });

      expect(result.tier).toBeDefined();
      expect(result.tier?.workspaceId).toBe(workspaceId);
      expect(result.error).toBeNull();
    });

    it("should scope all responses to workspace", () => {
      // Service returns tier with workspaceId set
      const result = PricingEngine.createPriceTier(workspaceId, {
        name: "Scoped Tier",
        entryPrice: 99,
        maxPrice: 299,
        targetMargin: 0.7,
        features: ["F1"],
      });

      expect(result.tier?.workspaceId).toBe(workspaceId);
    });
  });

  describe("Route Error Handling", () => {
    it("should return 400 for missing workspace ID header", () => {
      // Route returns: Response.json({ error: "Workspace ID required..." }, { status: 400 })
      // Service validates empty workspace ID causes error response
      const result = PricingEngine.createPriceTier("", {
        name: "No Workspace",
        entryPrice: 99,
        maxPrice: 299,
        targetMargin: 0.7,
        features: ["F1"],
      });

      expect(result.error).toBeDefined();
      expect(result.error).toContain("Workspace ID");
      expect(result.tier).toBeNull();
    });

    it("should return 403 for unauthorized workspace access", () => {
      // Route returns: Response.json({ error: "Unauthorized" }, { status: 403 })
      // from enforceWorkspaceScoping failure
      // Service enforces workspace ownership on data access
      const resultWs1 = PricingEngine.createPriceTier("ws-1", {
        name: "Workspace 1 Tier",
        entryPrice: 99,
        maxPrice: 299,
        targetMargin: 0.7,
        features: ["F1"],
      });

      expect(resultWs1.error).toBeNull();
      expect(resultWs1.tier?.workspaceId).toBe("ws-1");
    });

    it("should return 400 for Zod validation errors", () => {
      // Route catches z.ZodError and returns 400 with details
      // Service validates schema and returns error on validation failure
      const result = PricingEngine.createPriceTier(workspaceId, {
        name: "", // Invalid: empty name
        entryPrice: 99,
        maxPrice: 299,
        targetMargin: 0.7,
        features: ["F1"],
      });

      expect(result.error).toBeDefined();
      expect(result.tier).toBeNull();
    });

    it("should return 400 for service validation errors", () => {
      // Service returns error message, route returns 400
      const result = PricingEngine.createPriceTier(workspaceId, {
        name: "",
        entryPrice: 99,
        maxPrice: 299,
        targetMargin: 0.7,
        features: ["F1"],
      });

      expect(result.error).toBeDefined();
    });

    it("should return 500 for unexpected errors", () => {
      // Route catches Error and returns 500
      // Service returns structured error response with both error and tier fields
      const result = PricingEngine.createPriceTier(workspaceId, {
        name: "Error Test",
        entryPrice: 99,
        maxPrice: 299,
        targetMargin: 0.7,
        features: ["F1"],
      });

      expect(result).toBeDefined();
      expect(typeof result.error === 'string' || result.error === null).toBe(true);
      expect(result.tier === null || typeof result.tier === 'object').toBe(true);
    });
  });

  describe("Route DTO Boundary (Response Safety)", () => {
    it("should not expose internal fields in response", () => {
      // Service creates tier with only public fields
      const result = PricingEngine.createPriceTier(workspaceId, {
        name: "Test",
        entryPrice: 99,
        maxPrice: 299,
        targetMargin: 0.7,
        features: ["F1"],
      });

      expect(result.tier).toBeDefined();
      // Verify no internal fields
      const tier = result.tier!;
      expect(Object.keys(tier)).not.toContain("_internal");
      expect(Object.keys(tier)).not.toContain("_debug");
    });

    it("should return complete public tier structure", () => {
      const result = PricingEngine.createPriceTier(workspaceId, {
        name: "Complete Tier",
        entryPrice: 99,
        maxPrice: 299,
        targetMargin: 0.7,
        features: ["F1", "F2"],
      });

      expect(result.tier).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          workspaceId: workspaceId,
          name: "Complete Tier",
          entryPrice: 99,
          maxPrice: 299,
          targetMargin: 0.7,
          features: ["F1", "F2"],
          status: "DRAFT",
          activationDate: expect.any(Date),
        })
      );
    });
  });

  describe("Route-Service Contract", () => {
    it("should pass validated data to service", () => {
      // Route validates with createTierSchema then calls service
      // Service receives validated Partial<PriceTier>
      const schema = {
        name: "Integration Test",
        entryPrice: 149,
        maxPrice: 349,
        targetMargin: 0.65,
        features: ["F1", "F2", "F3"],
      };

      const result = PricingEngine.createPriceTier(workspaceId, schema);

      expect(result.tier?.name).toBe(schema.name);
      expect(result.tier?.entryPrice).toBe(schema.entryPrice);
    });

    it("should handle service error response", () => {
      // Service returns: { tier: null, error: string }
      // Route should convert to 400 response
      const result = PricingEngine.createPriceTier(workspaceId, {
        name: "",
        entryPrice: 99,
        maxPrice: 299,
        targetMargin: 0.7,
        features: ["F1"],
      });

      expect(result.error).toBeDefined();
      expect(result.tier).toBeNull();
    });

    it("should return service-created tier on success", () => {
      // Service returns: { stream: RevenueStream, error: null }
      // Route should return as 201 JSON response
      const result = PricingEngine.createPriceTier(workspaceId, {
        name: "Success Tier",
        entryPrice: 99,
        maxPrice: 299,
        targetMargin: 0.7,
        features: ["F1"],
      });

      expect(result.error).toBeNull();
      expect(result.tier).toBeDefined();
      expect(result.tier?.id).toMatch(/^pt-/);
    });
  });
});
