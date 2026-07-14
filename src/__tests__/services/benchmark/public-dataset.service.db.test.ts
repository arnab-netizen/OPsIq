import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import type { PrismaClient } from "@/generated/prisma/client";
import { getDbInstance } from "@/lib/db";
import {
  loadDataset,
  findDatasetsByType,
  defineCalculation,
  executeCalculation,
  getCalculationHistory,
  getDatasetStatistics,
} from "@/services/benchmark/public-dataset.service";
import type { PublicDataset, CalculationTest } from "@/domain/benchmark/public-dataset";

let db: PrismaClient;

beforeEach(async () => {
  db = await getDbInstance();
});

afterEach(async () => {
  await db.calculationLog.deleteMany({});
  await db.datasetCalculation.deleteMany({});
  await db.publicDataset.deleteMany({});
});

const createTestDataset = (overrides: Partial<PublicDataset> = {}): PublicDataset => ({
  id: `dataset_retail_2025_001`,
  name: "Retail Transactions Q1 2025",
  datasetType: "retail",
  description: "Sample retail transaction dataset for testing calculations",
  rawData: [
    { transaction_id: "t001", amount: 100, date: "2025-01-01", category: "electronics" },
    { transaction_id: "t002", amount: 250, date: "2025-01-02", category: "clothing" },
    { transaction_id: "t003", amount: 75, date: "2025-01-03", category: "food" },
    { transaction_id: "t004", amount: 500, date: "2025-02-01", category: "electronics" },
    { transaction_id: "t005", amount: 150, date: "2025-02-15", category: "clothing" },
  ],
  sourceUrl: "https://example.com/datasets/retail-q1-2025",
  licenseType: "cc_by",
  allowedUse: "Educational and testing use only",
  rowCount: 5,
  createdAt: new Date(),
  ...overrides,
});

describe.skipIf(!SHOULD_RUN_DB_TESTS)("PublicDatasetService", () => {
  describe("loadDataset", () => {
    it("should load a dataset by ID", async () => {
      const testDataset = createTestDataset();
      await db.publicDataset.create({
        data: {
          id: testDataset.id,
          name: testDataset.name,
          datasetType: testDataset.datasetType,
          description: testDataset.description,
          rawData: testDataset.rawData,
          sourceUrl: testDataset.sourceUrl,
          licenseType: testDataset.licenseType,
          allowedUse: testDataset.allowedUse,
          rowCount: testDataset.rowCount,
        },
      });

      const loaded = await loadDataset(db, testDataset.id);

      expect(loaded).not.toBeNull();
      expect(loaded?.id).toBe(testDataset.id);
      expect(loaded?.name).toBe(testDataset.name);
      expect(loaded?.datasetType).toBe("retail");
      expect(loaded?.rowCount).toBe(5);
    });

    it("should return null for non-existent dataset", async () => {
      const result = await loadDataset(db, "dataset_nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("findDatasetsByType", () => {
    it("should find datasets by type", async () => {
      const dataset1 = createTestDataset({ id: "dataset_retail_001" });
      const dataset2 = createTestDataset({ id: "dataset_retail_002", datasetType: "ecommerce" });

      await db.publicDataset.create({
        data: {
          id: dataset1.id,
          name: dataset1.name,
          datasetType: dataset1.datasetType,
          description: dataset1.description,
          rawData: dataset1.rawData,
          licenseType: dataset1.licenseType,
          allowedUse: dataset1.allowedUse,
          rowCount: dataset1.rowCount,
        },
      });

      await db.publicDataset.create({
        data: {
          id: dataset2.id,
          name: dataset2.name,
          datasetType: dataset2.datasetType,
          description: dataset2.description,
          rawData: dataset2.rawData,
          licenseType: dataset2.licenseType,
          allowedUse: dataset2.allowedUse,
          rowCount: dataset2.rowCount,
        },
      });

      const retailDatasets = await findDatasetsByType(db, "retail");

      expect(retailDatasets.length).toBe(1);
      expect(retailDatasets[0].datasetType).toBe("retail");
    });
  });

  describe("defineCalculation", () => {
    it("should define a calculation test", async () => {
      const testDataset = createTestDataset();
      await db.publicDataset.create({
        data: {
          id: testDataset.id,
          name: testDataset.name,
          datasetType: testDataset.datasetType,
          description: testDataset.description,
          rawData: testDataset.rawData,
          licenseType: testDataset.licenseType,
          allowedUse: testDataset.allowedUse,
          rowCount: testDataset.rowCount,
        },
      });

      const calculation = await defineCalculation(db, testDataset.id, {
        calculationType: "revenue_sum",
        description: "Sum all transaction amounts",
        input: { filters: {} },
        expectedOutput: { value: 1075, tolerance: 0 }, // 100+250+75+500+150
      });

      expect(calculation.id).toBeDefined();
      expect(calculation.datasetId).toBe(testDataset.id);
      expect(calculation.calculationType).toBe("revenue_sum");
      expect(calculation.expectedOutput.value).toBe(1075);
    });

    it("should reject calculation without dataset reference", async () => {
      const invalidCalc = {
        calculationType: "revenue_sum",
        description: "Test",
        input: { filters: {} },
        expectedOutput: { value: 100 },
      } as any;

      await expect(
        defineCalculation(db, "", {
          ...invalidCalc,
          datasetId: "",
        })
      ).rejects.toThrow();
    });
  });

  describe("executeCalculation", () => {
    it("should execute a calculation and record result", async () => {
      const testDataset = createTestDataset();
      await db.publicDataset.create({
        data: {
          id: testDataset.id,
          name: testDataset.name,
          datasetType: testDataset.datasetType,
          description: testDataset.description,
          rawData: testDataset.rawData,
          licenseType: testDataset.licenseType,
          allowedUse: testDataset.allowedUse,
          rowCount: testDataset.rowCount,
        },
      });

      const calculation = await defineCalculation(db, testDataset.id, {
        calculationType: "revenue_sum",
        description: "Sum all transaction amounts",
        input: { filters: {} },
        expectedOutput: { value: 1075 },
      });

      const executed = await executeCalculation(db, calculation.id, 1075, 45);

      expect(executed.passed).toBe(true);
      expect(executed.actualOutput?.value).toBe(1075);
      expect(executed.executionTimeMs).toBe(45);
      expect(executed.testedAt).toBeDefined();
    });

    it("should mark calculation as failed if actual doesn't match expected", async () => {
      const testDataset = createTestDataset();
      await db.publicDataset.create({
        data: {
          id: testDataset.id,
          name: testDataset.name,
          datasetType: testDataset.datasetType,
          description: testDataset.description,
          rawData: testDataset.rawData,
          licenseType: testDataset.licenseType,
          allowedUse: testDataset.allowedUse,
          rowCount: testDataset.rowCount,
        },
      });

      const calculation = await defineCalculation(db, testDataset.id, {
        calculationType: "revenue_sum",
        description: "Sum all transaction amounts",
        input: { filters: {} },
        expectedOutput: { value: 1000 },
      });

      const executed = await executeCalculation(db, calculation.id, 1075, 45);

      expect(executed.passed).toBe(false);
    });

    it("should respect tolerance when comparing numeric values", async () => {
      const testDataset = createTestDataset();
      await db.publicDataset.create({
        data: {
          id: testDataset.id,
          name: testDataset.name,
          datasetType: testDataset.datasetType,
          description: testDataset.description,
          rawData: testDataset.rawData,
          licenseType: testDataset.licenseType,
          allowedUse: testDataset.allowedUse,
          rowCount: testDataset.rowCount,
        },
      });

      // Expect 1000, tolerance 5% (0.05)
      const calculation = await defineCalculation(db, testDataset.id, {
        calculationType: "revenue_sum",
        description: "Sum with tolerance",
        input: { filters: {} },
        expectedOutput: { value: 1000, tolerance: 0.05 },
      });

      // Actual is 1075, which is 7.5% off from 1000 → fails
      const executed = await executeCalculation(db, calculation.id, 1075, 45);
      expect(executed.passed).toBe(false);

      // Actual is 1050, which is 5% off from 1000 → passes
      const calculation2 = await defineCalculation(db, testDataset.id, {
        calculationType: "revenue_sum",
        description: "Sum with tolerance",
        input: { filters: {} },
        expectedOutput: { value: 1000, tolerance: 0.05 },
      });
      const executed2 = await executeCalculation(db, calculation2.id, 1050, 45);
      expect(executed2.passed).toBe(true);
    });
  });

  describe("getCalculationHistory", () => {
    it("should retrieve calculation history for a dataset", async () => {
      const testDataset = createTestDataset();
      await db.publicDataset.create({
        data: {
          id: testDataset.id,
          name: testDataset.name,
          datasetType: testDataset.datasetType,
          description: testDataset.description,
          rawData: testDataset.rawData,
          licenseType: testDataset.licenseType,
          allowedUse: testDataset.allowedUse,
          rowCount: testDataset.rowCount,
        },
      });

      const calc1 = await defineCalculation(db, testDataset.id, {
        calculationType: "revenue_sum",
        description: "Sum revenue",
        input: { filters: {} },
        expectedOutput: { value: 1075 },
      });

      const calc2 = await defineCalculation(db, testDataset.id, {
        calculationType: "average_transaction",
        description: "Average transaction",
        input: { filters: {} },
        expectedOutput: { value: 215 },
      });

      await executeCalculation(db, calc1.id, 1075, 45);
      await executeCalculation(db, calc2.id, 215, 30);

      const history = await getCalculationHistory(db, testDataset.id);

      expect(history.length).toBe(2);
      expect(history[0].passed).toBeDefined();
      expect(history[1].passed).toBeDefined();
    });

    it("should filter by calculation type", async () => {
      const testDataset = createTestDataset();
      await db.publicDataset.create({
        data: {
          id: testDataset.id,
          name: testDataset.name,
          datasetType: testDataset.datasetType,
          description: testDataset.description,
          rawData: testDataset.rawData,
          licenseType: testDataset.licenseType,
          allowedUse: testDataset.allowedUse,
          rowCount: testDataset.rowCount,
        },
      });

      await defineCalculation(db, testDataset.id, {
        calculationType: "revenue_sum",
        description: "Sum",
        input: { filters: {} },
        expectedOutput: { value: 1075 },
      });

      await defineCalculation(db, testDataset.id, {
        calculationType: "average_transaction",
        description: "Average",
        input: { filters: {} },
        expectedOutput: { value: 215 },
      });

      const sumOnly = await getCalculationHistory(db, testDataset.id, "revenue_sum");

      expect(sumOnly.length).toBe(1);
      expect(sumOnly[0].calculationType).toBe("revenue_sum");
    });
  });

  describe("getDatasetStatistics", () => {
    it("should compute dataset statistics", async () => {
      const testDataset = createTestDataset();
      await db.publicDataset.create({
        data: {
          id: testDataset.id,
          name: testDataset.name,
          datasetType: testDataset.datasetType,
          description: testDataset.description,
          rawData: testDataset.rawData,
          licenseType: testDataset.licenseType,
          allowedUse: testDataset.allowedUse,
          rowCount: testDataset.rowCount,
        },
      });

      const calc1 = await defineCalculation(db, testDataset.id, {
        calculationType: "revenue_sum",
        description: "Sum",
        input: { filters: {} },
        expectedOutput: { value: 1075 },
      });

      const calc2 = await defineCalculation(db, testDataset.id, {
        calculationType: "average_transaction",
        description: "Average",
        input: { filters: {} },
        expectedOutput: { value: 215 },
      });

      await executeCalculation(db, calc1.id, 1075, 50);
      await executeCalculation(db, calc2.id, 215, 30);

      const stats = await getDatasetStatistics(db, testDataset.id);

      expect(stats.datasetId).toBe(testDataset.id);
      expect(stats.totalTests).toBe(2);
      expect(stats.passedTests).toBe(2);
      expect(stats.failedTests).toBe(0);
      expect(stats.averageExecutionTimeMs).toBeCloseTo(40, 0); // (50+30)/2 = 40
    });
  });
});
