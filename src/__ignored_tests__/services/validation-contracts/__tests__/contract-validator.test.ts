import { ContractValidator } from "../contract-validator";
import { v4 as uuidv4 } from "uuid";

describe("ContractValidator", () => {
  const validator = new ContractValidator();
  const engagementId = uuidv4();
  const workspaceId = uuidv4();

  describe("validateContract", () => {
    it("should pass valid contract", async () => {
      const input = {
        engagementId,
        workspaceId,
        requestType: "DECISION",
        businessCondition: {
          financialHealth: "STABLE",
          revenueRun: 1000000,
        },
      };

      const result = await validator.validateContract(input);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.contractId).toBeDefined();
    });

    it("should reject missing required fields", async () => {
      const input = {
        engagementId,
        workspaceId,
        // missing requestType
        businessCondition: {
          financialHealth: "STABLE",
          revenueRun: 1000000,
        },
      };

      const result = await validator.validateContract(input);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].severity).toBe("ERROR");
    });

    it("should reject invalid enum values", async () => {
      const input = {
        engagementId,
        workspaceId,
        requestType: "INVALID_TYPE",
        businessCondition: {
          financialHealth: "STABLE",
          revenueRun: 1000000,
        },
      };

      const result = await validator.validateContract(input);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("should reject negative revenue", async () => {
      const input = {
        engagementId,
        workspaceId,
        requestType: "DECISION",
        businessCondition: {
          financialHealth: "STABLE",
          revenueRun: -1000,
        },
      };

      const result = await validator.validateContract(input);

      expect(result.isValid).toBe(false);
    });

    it("should reject invalid UUID", async () => {
      const input = {
        engagementId: "not-a-uuid",
        workspaceId,
        requestType: "DECISION",
        businessCondition: {
          financialHealth: "STABLE",
          revenueRun: 1000000,
        },
      };

      const result = await validator.validateContract(input);

      expect(result.isValid).toBe(false);
    });

    it("should accept optional fields as undefined", async () => {
      const input = {
        engagementId,
        workspaceId,
        requestType: "RECOMMENDATION",
        businessCondition: {
          financialHealth: "CRITICAL",
          revenueRun: 500000,
        },
        constraints: undefined,
        context: undefined,
      };

      const result = await validator.validateContract(input);

      expect(result.isValid).toBe(true);
    });

    it("should generate unique contract IDs", async () => {
      const input = {
        engagementId,
        workspaceId,
        requestType: "DECISION",
        businessCondition: {
          financialHealth: "STABLE",
          revenueRun: 1000000,
        },
      };

      const result1 = await validator.validateContract(input);
      const result2 = await validator.validateContract(input);

      expect(result1.contractId).not.toBe(result2.contractId);
    });

    it("should set validatedAt timestamp", async () => {
      const input = {
        engagementId,
        workspaceId,
        requestType: "DECISION",
        businessCondition: {
          financialHealth: "STABLE",
          revenueRun: 1000000,
        },
      };

      const beforeValidation = new Date();
      const result = await validator.validateContract(input);
      const afterValidation = new Date();

      expect(result.validatedAt.getTime()).toBeGreaterThanOrEqual(
        beforeValidation.getTime()
      );
      expect(result.validatedAt.getTime()).toBeLessThanOrEqual(
        afterValidation.getTime()
      );
    });
  });

  describe("validateAndThrow", () => {
    it("should return parsed contract on success", async () => {
      const input = {
        engagementId,
        workspaceId,
        requestType: "DECISION",
        businessCondition: {
          financialHealth: "STABLE",
          revenueRun: 1000000,
        },
      };

      const result = await validator.validateAndThrow(input);

      expect(result).toEqual(input);
    });

    it("should throw on invalid contract", async () => {
      const input = {
        engagementId,
        workspaceId,
        requestType: "INVALID",
        businessCondition: {
          financialHealth: "STABLE",
          revenueRun: 1000000,
        },
      };

      await expect(validator.validateAndThrow(input)).rejects.toThrow(
        "Contract validation failed"
      );
    });

    it("should throw descriptive error on validation failure", async () => {
      const input = {
        engagementId: "bad-uuid",
        workspaceId,
        requestType: "DECISION",
        businessCondition: {
          financialHealth: "STABLE",
          revenueRun: 1000000,
        },
      };

      try {
        await validator.validateAndThrow(input);
        fail("Should have thrown");
      } catch (err) {
        expect(String(err)).toContain("Contract validation failed");
      }
    });
  });
});
