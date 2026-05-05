import { ContradictionDetector } from "../detector";
import { v4 as uuidv4 } from "uuid";

describe("ContradictionDetector", () => {
  const detector = new ContradictionDetector();
  const engagementId = uuidv4();
  const workspaceId = uuidv4();

  const validContract = {
    engagementId,
    workspaceId,
    requestType: "DECISION",
    businessCondition: {
      financialHealth: "STABLE",
      revenueRun: 1000000,
    },
    context: {
      urgency: "MEDIUM",
      ownerEngagementLevel: "ACTIVE",
    },
    constraints: {
      budgetLimit: 500000,
    },
  };

  describe("detectContradictions", () => {
    it("should detect no contradictions in valid contract", async () => {
      const result = await detector.detectContradictions(validContract);

      expect(result.hasContradictions).toBe(false);
      expect(result.contradictions).toHaveLength(0);
      expect(result.contractId).toBeDefined();
      expect(result.detectedAt).toBeDefined();
    });

    it("should detect critical health vs high revenue contradiction", async () => {
      const contract = {
        ...validContract,
        businessCondition: {
          financialHealth: "CRITICAL",
          revenueRun: 15000000,
        },
      };

      const result = await detector.detectContradictions(contract);

      expect(result.hasContradictions).toBe(true);
      expect(result.contradictions.length).toBeGreaterThan(0);
      expect(result.contradictions[0].severity).toBe("WARNING");
      expect(result.contradictions[0].field1).toBe("financialHealth");
    });

    it("should detect strong health vs zero revenue contradiction", async () => {
      const contract = {
        ...validContract,
        businessCondition: {
          financialHealth: "STRONG",
          revenueRun: 0,
        },
      };

      const result = await detector.detectContradictions(contract);

      expect(result.hasContradictions).toBe(true);
      const errorContradictions = result.contradictions.filter(
        (c) => c.severity === "ERROR"
      );
      expect(errorContradictions.length).toBeGreaterThan(0);
    });

    it("should detect owner absence with critical urgency", async () => {
      const contract = {
        ...validContract,
        context: {
          ownerEngagementLevel: "NONE",
          urgency: "CRITICAL",
        },
      };

      const result = await detector.detectContradictions(contract);

      expect(result.hasContradictions).toBe(true);
      const criticalContradictions = result.contradictions.filter(
        (c) => c.severity === "ERROR"
      );
      expect(criticalContradictions.length).toBeGreaterThan(0);
    });

    it("should detect low budget with critical urgency", async () => {
      const contract = {
        ...validContract,
        constraints: {
          budgetLimit: 5000,
        },
        context: {
          urgency: "CRITICAL",
        },
      };

      const result = await detector.detectContradictions(contract);

      expect(result.hasContradictions).toBe(true);
      expect(result.contradictions.length).toBeGreaterThan(0);
    });

    it("should warn on decision without context", async () => {
      const contract = {
        engagementId,
        workspaceId,
        requestType: "DECISION",
        businessCondition: {
          financialHealth: "STABLE",
          revenueRun: 1000000,
        },
      };

      const result = await detector.detectContradictions(contract);

      expect(result.hasContradictions).toBe(true);
      expect(result.contradictions.some((c) => c.severity === "WARNING")).toBe(
        true
      );
    });

    it("should reject invalid contract format", async () => {
      const invalidContract = {
        engagementId: "not-a-uuid",
        // missing required fields
      };

      await expect(detector.detectContradictions(invalidContract)).rejects.toThrow(
        "Invalid contract format"
      );
    });

    it("should generate unique contradiction IDs", async () => {
      const contract = {
        ...validContract,
        businessCondition: {
          financialHealth: "STRONG",
          revenueRun: 0,
        },
      };

      const result = await detector.detectContradictions(contract);

      if (result.contradictions.length >= 2) {
        const ids = result.contradictions.map((c) => c.id);
        const uniqueIds = new Set(ids);
        expect(uniqueIds.size).toBe(ids.length);
      }
    });
  });

  describe("detectAndThrow", () => {
    it("should return contract when no errors", async () => {
      const contract = {
        ...validContract,
        context: {
          urgency: "LOW",
        },
        constraints: {
          budgetLimit: 100000,
        },
      };

      const result = await detector.detectAndThrow(contract);

      expect(result.engagementId).toBe(engagementId);
    });

    it("should throw on error-level contradictions", async () => {
      const contract = {
        ...validContract,
        businessCondition: {
          financialHealth: "STRONG",
          revenueRun: 0,
        },
      };

      await expect(detector.detectAndThrow(contract)).rejects.toThrow(
        "Contract contradictions detected"
      );
    });

    it("should not throw on warning-level contradictions", async () => {
      const contract = {
        ...validContract,
        businessCondition: {
          financialHealth: "CRITICAL",
          revenueRun: 15000000,
        },
        context: {
          urgency: "MEDIUM",
          ownerEngagementLevel: "ACTIVE",
        },
      };

      const result = await detector.detectAndThrow(contract);

      expect(result).toBeDefined();
    });

    it("should provide suggestions for resolution", async () => {
      const contract = {
        ...validContract,
        businessCondition: {
          financialHealth: "STRONG",
          revenueRun: 0,
        },
      };

      const result = await detector.detectContradictions(contract);

      expect(result.contradictions.some((c) => c.suggestedResolution)).toBe(true);
    });
  });
});
