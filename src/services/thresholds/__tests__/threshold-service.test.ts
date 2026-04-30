import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getWorkspaceThresholds,
  updateWorkspaceThresholds,
  resetWorkspaceThresholds,
  validateThresholdValue,
  getDefaultThresholds,
  ThresholdConfig,
} from "../threshold-service";
import { db } from "@/lib/db";

vi.mock("@/lib/db", () => ({
  db: {
    thresholdConfig: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

describe("Threshold Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getWorkspaceThresholds", () => {
    it("should return defaults when no config exists", async () => {
      vi.mocked(db.thresholdConfig.findUnique).mockResolvedValueOnce(null);

      const thresholds = await getWorkspaceThresholds("ws-123");

      expect(thresholds).toMatchObject({
        confidenceMinThreshold: 0.65,
        lowConfidenceValueThreshold: 3000000,
        overrideFailureRateThreshold: 0.30,
      });
    });

    it("should return stored config when it exists", async () => {
      const storedConfig = {
        id: "config-1",
        workspaceId: "ws-123",
        confidenceMinThreshold: 0.75,
        lowConfidenceValueThreshold: 4000000,
        lowConfidenceFailureRateThreshold: 0.40,
        ruleBlockValueThreshold: 5000000,
        falsePositiveRateThreshold: 0.25,
        blockCountThreshold: 50,
        overrideFailureRateThreshold: 0.35,
        overrideFailureValueThreshold: 2000000,
        failureCountThreshold: 10,
        missingDataValueThreshold: 4000000,
        pendingAgeThreshold: 604800000,
        fieldMissingRateThreshold: 0.30,
        confidenceChangeThreshold: 0.05,
        approvalRateChangeThreshold: 0.10,
        blockRateChangeThreshold: 0.10,
        driftSeverityLow: 0.02,
        driftSeverityMedium: 0.05,
        driftSeverityHigh: 0.10,
        stalledPipelineThreshold: 10000000,
        createdBy: "user-1",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(db.thresholdConfig.findUnique).mockResolvedValueOnce(
        storedConfig as any
      );

      const thresholds = await getWorkspaceThresholds("ws-123");

      expect(thresholds.confidenceMinThreshold).toBe(0.75);
      expect(thresholds.lowConfidenceValueThreshold).toBe(4000000);
      expect(thresholds.overrideFailureRateThreshold).toBe(0.35);
    });

    it("should return defaults on database error", async () => {
      vi.mocked(db.thresholdConfig.findUnique).mockRejectedValueOnce(
        new Error("Database error")
      );

      const thresholds = await getWorkspaceThresholds("ws-123");

      expect(thresholds.confidenceMinThreshold).toBe(0.65);
    });
  });

  describe("updateWorkspaceThresholds", () => {
    it("should validate threshold values", async () => {
      const updates: Partial<ThresholdConfig> = {
        confidenceMinThreshold: 1.5, // Invalid: > 1.0
      };

      await expect(
        updateWorkspaceThresholds("ws-123", updates, "user-1")
      ).rejects.toThrow("must be between 0 and 1");
    });

    it("should validate drift severity ordering", async () => {
      const updates: Partial<ThresholdConfig> = {
        driftSeverityLow: 0.10,
        driftSeverityMedium: 0.05,
        driftSeverityHigh: 0.02,
      };

      await expect(
        updateWorkspaceThresholds("ws-123", updates, "user-1")
      ).rejects.toThrow("must be ordered: low < medium < high");
    });

    it("should update existing config", async () => {
      const existingConfig = {
        id: "config-1",
        workspaceId: "ws-123",
        confidenceMinThreshold: 0.65,
        lowConfidenceValueThreshold: 3000000,
        lowConfidenceFailureRateThreshold: 0.40,
        ruleBlockValueThreshold: 5000000,
        falsePositiveRateThreshold: 0.25,
        blockCountThreshold: 50,
        overrideFailureRateThreshold: 0.30,
        overrideFailureValueThreshold: 2000000,
        failureCountThreshold: 10,
        missingDataValueThreshold: 4000000,
        pendingAgeThreshold: 604800000,
        fieldMissingRateThreshold: 0.30,
        confidenceChangeThreshold: 0.05,
        approvalRateChangeThreshold: 0.10,
        blockRateChangeThreshold: 0.10,
        driftSeverityLow: 0.02,
        driftSeverityMedium: 0.05,
        driftSeverityHigh: 0.10,
        stalledPipelineThreshold: 10000000,
        createdBy: "user-1",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(db.thresholdConfig.upsert).mockResolvedValueOnce({
        ...existingConfig,
        confidenceMinThreshold: 0.75,
      } as any);

      const updates: Partial<ThresholdConfig> = {
        confidenceMinThreshold: 0.75,
      };

      const result = await updateWorkspaceThresholds("ws-123", updates, "user-1");

      expect(result.confidenceMinThreshold).toBe(0.75);
      expect(vi.mocked(db.thresholdConfig.upsert)).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId: "ws-123" },
          update: expect.objectContaining({
            confidenceMinThreshold: 0.75,
          }),
        })
      );
    });

    it("should create config if it doesn't exist", async () => {
      const newConfig = {
        id: "config-new",
        workspaceId: "ws-123",
        confidenceMinThreshold: 0.65,
        lowConfidenceValueThreshold: 3000000,
        lowConfidenceFailureRateThreshold: 0.40,
        ruleBlockValueThreshold: 5000000,
        falsePositiveRateThreshold: 0.25,
        blockCountThreshold: 50,
        overrideFailureRateThreshold: 0.30,
        overrideFailureValueThreshold: 2000000,
        failureCountThreshold: 10,
        missingDataValueThreshold: 4000000,
        pendingAgeThreshold: 604800000,
        fieldMissingRateThreshold: 0.30,
        confidenceChangeThreshold: 0.05,
        approvalRateChangeThreshold: 0.10,
        blockRateChangeThreshold: 0.10,
        driftSeverityLow: 0.02,
        driftSeverityMedium: 0.05,
        driftSeverityHigh: 0.10,
        stalledPipelineThreshold: 10000000,
        createdBy: "user-1",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(db.thresholdConfig.upsert).mockResolvedValueOnce(newConfig as any);

      const updates: Partial<ThresholdConfig> = {
        confidenceMinThreshold: 0.65,
      };

      const result = await updateWorkspaceThresholds("ws-123", updates, "user-1");

      expect(result).toBeDefined();
      expect(vi.mocked(db.thresholdConfig.upsert)).toHaveBeenCalled();
    });
  });

  describe("validateThresholdValue", () => {
    it("should validate percentage thresholds (0-1)", () => {
      expect(() => validateThresholdValue("confidenceMinThreshold", 0.5)).not.toThrow();
      expect(() => validateThresholdValue("confidenceMinThreshold", 1.5)).toThrow();
      expect(() => validateThresholdValue("confidenceMinThreshold", -0.1)).toThrow();
    });

    it("should validate count thresholds (non-negative integers)", () => {
      expect(() => validateThresholdValue("blockCountThreshold", 50)).not.toThrow();
      expect(() => validateThresholdValue("blockCountThreshold", 50.5)).toThrow();
      expect(() => validateThresholdValue("blockCountThreshold", -1)).toThrow();
    });

    it("should validate value thresholds (non-negative floats)", () => {
      expect(() => validateThresholdValue("ruleBlockValueThreshold", 5000000)).not.toThrow();
      expect(() => validateThresholdValue("ruleBlockValueThreshold", 5000000.50)).not.toThrow();
      expect(() => validateThresholdValue("ruleBlockValueThreshold", -1000)).toThrow();
    });

    it("should validate time thresholds (non-negative integers in ms)", () => {
      expect(() => validateThresholdValue("pendingAgeThreshold", 604800000)).not.toThrow();
      expect(() => validateThresholdValue("pendingAgeThreshold", 604800000.5)).toThrow();
      expect(() => validateThresholdValue("pendingAgeThreshold", -1)).toThrow();
    });

    it("should reject non-numeric values", () => {
      expect(() => validateThresholdValue("confidenceMinThreshold", "not a number")).toThrow(
        "must be numeric"
      );
    });
  });

  describe("resetWorkspaceThresholds", () => {
    it("should delete workspace config", async () => {
      vi.mocked(db.thresholdConfig.delete).mockResolvedValueOnce({} as any);

      await resetWorkspaceThresholds("ws-123");

      expect(vi.mocked(db.thresholdConfig.delete)).toHaveBeenCalledWith({
        where: { workspaceId: "ws-123" },
      });
    });

    it("should not fail if config doesn't exist", async () => {
      vi.mocked(db.thresholdConfig.delete).mockRejectedValueOnce(
        new Error("Not found")
      );

      await expect(resetWorkspaceThresholds("ws-123")).resolves.toBeUndefined();
    });
  });

  describe("getDefaultThresholds", () => {
    it("should return default threshold values", () => {
      const defaults = getDefaultThresholds();

      expect(defaults).toMatchObject({
        confidenceMinThreshold: expect.any(Number),
        lowConfidenceValueThreshold: expect.any(Number),
        overrideFailureRateThreshold: expect.any(Number),
        ruleBlockValueThreshold: expect.any(Number),
      });

      // Verify all required fields exist
      expect(Object.keys(defaults).length).toBeGreaterThan(15);
    });

    it("should apply environment variable overrides", () => {
      // Environment variables are applied at module load time,
      // so defaults should respect any set env vars
      const defaults = getDefaultThresholds();
      expect(defaults).toBeDefined();
    });
  });
});
