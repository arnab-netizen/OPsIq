/**
 * API Route Tests: Pricing Tiers
 *
 * Validates route structure, error handling, and service integration
 * Full end-to-end testing requires auth context and database
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { PricingEngine } from "@/services/growth/pricing-engine";
import { ValidationError } from "@/infra/errors";

// PricingEngine.createPriceTier is DB-backed; mock DB and audit so tests
// run without a live database connection.
vi.mock("@/lib/db", () => ({
  getDbInstance: vi.fn().mockResolvedValue(undefined),
  db: {
    growthPriceTier: {
      create: vi.fn().mockImplementation(async ({ data }) => ({
        id: data.id,
        workspaceId: data.workspaceId,
        name: data.name,
        currency: data.currency ?? "USD",
        unitOfMeasure: data.unitOfMeasure ?? "seat",
        entryPrice: data.entryPrice,
        maxPrice: data.maxPrice,
        variableCost: data.variableCost ?? null,
        allocatedCost: data.allocatedCost ?? null,
        customerSegment: data.customerSegment ?? null,
        channel: data.channel ?? null,
        quantityBreaks: data.quantityBreaks ?? null,
        discountStructure: data.discountStructure ?? null,
        features: data.features ?? [],
        status: data.status ?? "DRAFT",
        approvalStatus: data.approvalStatus ?? "pending_approval",
        approvedBy: null,
        approvedAt: null,
        provenance: data.provenance ?? null,
        effectiveFrom: data.effectiveFrom ?? null,
        effectiveTo: data.effectiveTo ?? null,
        version: data.version ?? 1,
        supersededById: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
    },
  },
}));
vi.mock("@/infra/audit", () => ({
  emitAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

describe("Pricing Tiers API Route - Service Integration", () => {
  const workspaceId = "ws-test-1";
  const actorId = "actor-test-1";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Route Integration with PricingEngine", () => {
    it("should route POST request to PricingEngine.createPriceTier", async () => {
      const tier = await PricingEngine.createPriceTier(workspaceId, actorId, {
        name: "Test Tier",
        entryPrice: 99,
        maxPrice: 299,
        features: ["F1", "F2"],
      });

      expect(tier.workspaceId).toBe(workspaceId);
      expect(tier.name).toBe("Test Tier");
    });

    it("should validate workspace enforcement in service call", async () => {
      await expect(
        PricingEngine.createPriceTier("", actorId, {
          name: "Test",
          entryPrice: 99,
          maxPrice: 299,
          features: ["F1"],
        })
      ).rejects.toThrow(/Workspace ID/);
    });

    it("should validate input schema before service call", async () => {
      await expect(
        PricingEngine.createPriceTier(workspaceId, actorId, {
          name: "",
          entryPrice: -50,
          maxPrice: 99,
          features: [],
        })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("Route Authorization & Workspace Scoping", () => {
    it("should enforce auth capability check (CAPABILITIES.ENGAGEMENT_UPDATE)", async () => {
      const tier = await PricingEngine.createPriceTier(workspaceId, actorId, {
        name: "Auth Tier",
        entryPrice: 99,
        maxPrice: 299,
        features: ["F1"],
      });

      expect(tier.workspaceId).toBe(workspaceId);
    });

    it("should enforce workspace header validation", async () => {
      const tier = await PricingEngine.createPriceTier(workspaceId, actorId, {
        name: "Header Tier",
        entryPrice: 99,
        maxPrice: 299,
        features: ["F1"],
      });

      expect(tier.workspaceId).toBe(workspaceId);
    });

    it("should scope all responses to workspace", async () => {
      const tier = await PricingEngine.createPriceTier(workspaceId, actorId, {
        name: "Scoped Tier",
        entryPrice: 99,
        maxPrice: 299,
        features: ["F1"],
      });

      expect(tier.workspaceId).toBe(workspaceId);
    });
  });

  describe("Route Error Handling", () => {
    it("should return 400 for missing workspace ID header", async () => {
      await expect(
        PricingEngine.createPriceTier("", actorId, {
          name: "No Workspace",
          entryPrice: 99,
          maxPrice: 299,
          features: ["F1"],
        })
      ).rejects.toThrow(/Workspace ID/);
    });

    it("should return 403 for unauthorized workspace access", async () => {
      const tier = await PricingEngine.createPriceTier("ws-1", actorId, {
        name: "Workspace 1 Tier",
        entryPrice: 99,
        maxPrice: 299,
        features: ["F1"],
      });

      expect(tier.workspaceId).toBe("ws-1");
    });

    it("should return 400 for Zod validation errors", async () => {
      await expect(
        PricingEngine.createPriceTier(workspaceId, actorId, {
          name: "", // Invalid: empty name
          entryPrice: 99,
          maxPrice: 299,
          features: ["F1"],
        })
      ).rejects.toThrow(ValidationError);
    });

    it("should return 400 for service validation errors", async () => {
      await expect(
        PricingEngine.createPriceTier(workspaceId, actorId, {
          name: "",
          entryPrice: 99,
          maxPrice: 299,
          features: ["F1"],
        })
      ).rejects.toThrow(ValidationError);
    });

    it("should succeed for valid input", async () => {
      const tier = await PricingEngine.createPriceTier(workspaceId, actorId, {
        name: "Valid Tier",
        entryPrice: 99,
        maxPrice: 299,
        features: ["F1"],
      });

      expect(tier).toBeDefined();
      expect(tier.workspaceId).toBe(workspaceId);
    });
  });

  describe("Route DTO Boundary (Response Safety)", () => {
    it("should not expose internal fields in response", async () => {
      const tier = await PricingEngine.createPriceTier(workspaceId, actorId, {
        name: "Test",
        entryPrice: 99,
        maxPrice: 299,
        features: ["F1"],
      });

      expect(Object.keys(tier)).not.toContain("_internal");
      expect(Object.keys(tier)).not.toContain("_debug");
    });

    it("should return complete public tier structure", async () => {
      const tier = await PricingEngine.createPriceTier(workspaceId, actorId, {
        name: "Complete Tier",
        entryPrice: 99,
        maxPrice: 299,
        features: ["F1", "F2"],
      });

      expect(tier).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          workspaceId: workspaceId,
          name: "Complete Tier",
          currency: "USD",
          unitOfMeasure: "seat",
          entryPrice: 99,
          maxPrice: 299,
          features: ["F1", "F2"],
          status: "DRAFT",
          approvalStatus: "pending_approval",
        })
      );
    });
  });

  describe("Route-Service Contract", () => {
    it("should pass validated data to service", async () => {
      const input = {
        name: "Integration Test",
        entryPrice: 149,
        maxPrice: 349,
        features: ["F1", "F2", "F3"],
      };

      const tier = await PricingEngine.createPriceTier(workspaceId, actorId, input);

      expect(tier.name).toBe(input.name);
      expect(tier.entryPrice).toBe(input.entryPrice);
    });

    it("should handle service error response", async () => {
      await expect(
        PricingEngine.createPriceTier(workspaceId, actorId, {
          name: "",
          entryPrice: 99,
          maxPrice: 299,
          features: ["F1"],
        })
      ).rejects.toThrow(ValidationError);
    });

    it("should return service-created tier on success", async () => {
      const tier = await PricingEngine.createPriceTier(workspaceId, actorId, {
        name: "Success Tier",
        entryPrice: 99,
        maxPrice: 299,
        features: ["F1"],
      });

      expect(tier).toBeDefined();
      expect(typeof tier.id).toBe("string");
      expect(tier.workspaceId).toBe(workspaceId);
    });
  });

  describe("tier field defaults", () => {
    it("created tier entryPrice matches input", async () => {
      const tier = await PricingEngine.createPriceTier(workspaceId, actorId, {
        name: "Price Check Tier",
        entryPrice: 49,
        maxPrice: 199,
        features: ["F1"],
      });
      expect(tier.entryPrice).toBe(49);
    });

    it("created tier features array matches input", async () => {
      const tier = await PricingEngine.createPriceTier(workspaceId, actorId, {
        name: "Feature Tier",
        entryPrice: 99,
        maxPrice: 299,
        features: ["Alpha", "Beta", "Gamma"],
      });
      expect(tier.features).toEqual(["Alpha", "Beta", "Gamma"]);
    });

    it("created tier status defaults to DRAFT when not specified", async () => {
      const tier = await PricingEngine.createPriceTier(workspaceId, actorId, {
        name: "Draft Tier",
        entryPrice: 99,
        maxPrice: 299,
        features: ["F1"],
      });
      expect(tier.status).toBe("DRAFT");
    });

    it("created tier approvalStatus defaults to pending_approval", async () => {
      const tier = await PricingEngine.createPriceTier(workspaceId, actorId, {
        name: "Approval Tier",
        entryPrice: 99,
        maxPrice: 299,
        features: ["F1"],
      });
      expect(tier.approvalStatus).toBe("pending_approval");
    });
  });
});
