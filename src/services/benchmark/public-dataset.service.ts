/**
 * B16-S1: Public Dataset Service
 *
 * Provides operations for:
 * - Loading public datasets
 * - Defining and executing deterministic calculation tests
 * - Tracking calculation history and performance
 * - Computing dataset statistics
 */

import type { PrismaClient, PublicDataset as PrismaPublicDataset, DatasetCalculation as PrismaDatasetCalculation, CalculationLog as PrismaCalculationLog } from "@/generated/prisma/client";
import {
  validateCalculationTest,
  isCalculationDeterministic,
  type PublicDataset,
  type CalculationTest,
  type CalculationLog,
  type DatasetStatistics,
} from "@/domain/benchmark/public-dataset";

/**
 * Load a public dataset by ID
 */
export async function loadDataset(
  prisma: PrismaClient,
  datasetId: string
): Promise<PublicDataset | null> {
  const record = await prisma.publicDataset.findUnique({
    where: { id: datasetId },
  });

  if (!record) {
    return null;
  }

  return parseDatasetRecord(record);
}

/**
 * Find datasets by type
 */
export async function findDatasetsByType(
  prisma: PrismaClient,
  datasetType: string,
  limit: number = 10
): Promise<PublicDataset[]> {
  const records = await prisma.publicDataset.findMany({
    where: { datasetType },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return records.map(parseDatasetRecord);
}

/**
 * Create or define a calculation test for a dataset
 */
export async function defineCalculation(
  prisma: PrismaClient,
  datasetId: string,
  test: Omit<CalculationTest, "id" | "testedAt" | "passed" | "actualOutput" | "executionTimeMs">
): Promise<CalculationTest> {
  const validation = validateCalculationTest({ ...test, datasetId } as CalculationTest);
  if (!validation.valid) {
    throw new Error(`Invalid calculation test: ${validation.errors.join("; ")}`);
  }

  const record = await prisma.datasetCalculation.create({
    data: {
      id: `calc_${datasetId}_${test.calculationType}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      datasetId,
      calculationType: test.calculationType,
      description: test.description,
      input: test.input as never,
      expectedOutput: test.expectedOutput as never,
    },
  });

  return parseCalculationRecord(record);
}

/**
 * Execute a calculation and record the result
 */
export async function executeCalculation(
  prisma: PrismaClient,
  calculationId: string,
  actualValue: number | string | boolean,
  executionTimeMs: number
): Promise<CalculationTest> {
  const record = await prisma.datasetCalculation.findUnique({
    where: { id: calculationId },
  });

  if (!record) {
    throw new Error(`Calculation not found: ${calculationId}`);
  }

  const parsed = parseCalculationRecord(record);
  const expectedValue = parsed.expectedOutput.value;
  const tolerance = parsed.expectedOutput.tolerance || 0;

  // Check if actual matches expected
  let passed = false;
  if (typeof expectedValue === "number" && typeof actualValue === "number") {
    const diff = Math.abs(expectedValue - actualValue);
    const percent = diff / Math.abs(expectedValue) || 0;
    passed = percent <= tolerance;
  } else {
    passed = expectedValue === actualValue;
  }

  // Record the result
  const updated = await prisma.datasetCalculation.update({
    where: { id: calculationId },
    data: {
      actualOutput: {
        value: actualValue,
        calculatedAt: new Date(),
      } as never,
      passed,
      testedAt: new Date(),
      executionTimeMs,
    },
  });

  // Log the execution
  await prisma.calculationLog.create({
    data: {
      id: `log_${calculationId}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      calculationId,
      executionTimeMs,
      notes: passed ? "PASS" : `FAIL: expected ${expectedValue}, got ${actualValue}`,
    },
  });

  return parseCalculationRecord(updated);
}

/**
 * Get all calculation tests for a dataset
 */
export async function getCalculationHistory(
  prisma: PrismaClient,
  datasetId: string,
  calculationType?: string
): Promise<CalculationTest[]> {
  const records = await prisma.datasetCalculation.findMany({
    where: {
      datasetId,
      ...(calculationType && { calculationType }),
    },
    orderBy: { testedAt: "desc" },
  });

  return records.map(parseCalculationRecord);
}

/**
 * Get dataset statistics
 */
export async function getDatasetStatistics(
  prisma: PrismaClient,
  datasetId: string
): Promise<DatasetStatistics> {
  const calculations = await prisma.datasetCalculation.findMany({
    where: { datasetId },
    include: { logs: true },
  });

  const totalTests = calculations.length;
  const passedTests = calculations.filter((c) => c.passed === true).length;
  const failedTests = calculations.filter((c) => c.passed === false).length;

  let totalExecutionTime = 0;
  let minExecutionTime = Infinity;
  let maxExecutionTime = 0;
  let executionCount = 0;

  calculations.forEach((calc) => {
    if (calc.executionTimeMs !== null) {
      totalExecutionTime += calc.executionTimeMs;
      minExecutionTime = Math.min(minExecutionTime, calc.executionTimeMs);
      maxExecutionTime = Math.max(maxExecutionTime, calc.executionTimeMs);
      executionCount += 1;
    }
  });

  const averageExecutionTime = executionCount > 0 ? totalExecutionTime / executionCount : 0;

  // Determinism: check if same calculation executed multiple times gives same result
  const calcsByType = new Map<string, typeof calculations>();
  calculations.forEach((calc) => {
    const key = `${calc.calculationType}_${JSON.stringify(calc.input)}`;
    if (!calcsByType.has(key)) {
      calcsByType.set(key, []);
    }
    calcsByType.get(key)!.push(calc);
  });

  let deterministicCount = 0;
  let compareCount = 0;
  calcsByType.forEach((group) => {
    if (group.length > 1) {
      for (let i = 0; i < group.length - 1; i++) {
        compareCount += 1;
        const calc1 = parseCalculationRecord(group[i]);
        const calc2 = parseCalculationRecord(group[i + 1]);
        if (isCalculationDeterministic(calc1, calc2)) {
          deterministicCount += 1;
        }
      }
    }
  });

  const determinismScore = compareCount > 0 ? deterministicCount / compareCount : 1.0;

  return {
    datasetId,
    totalTests,
    passedTests,
    failedTests,
    averageExecutionTimeMs: averageExecutionTime,
    minExecutionTimeMs: minExecutionTime === Infinity ? 0 : minExecutionTime,
    maxExecutionTimeMs: maxExecutionTime,
    determinismScore,
  };
}

/**
 * Helper: Parse dataset record
 */
function parseDatasetRecord(record: PrismaPublicDataset): PublicDataset {
  return {
    id: record.id,
    name: record.name,
    datasetType: record.datasetType as any,
    description: record.description,
    rawData: (typeof record.rawData === "string" ? JSON.parse(record.rawData) : record.rawData) as Record<string, unknown>[],
    sourceUrl: record.sourceUrl || undefined,
    licenseType: record.licenseType,
    allowedUse: record.allowedUse,
    rowCount: record.rowCount,
    createdAt: record.createdAt,
  };
}

/**
 * Helper: Parse calculation record
 */
function parseCalculationRecord(record: PrismaDatasetCalculation): CalculationTest {
  return {
    id: record.id,
    datasetId: record.datasetId,
    calculationType: record.calculationType as any,
    description: record.description,
    input: (typeof record.input === "string" ? JSON.parse(record.input) : record.input) as any,
    expectedOutput: (typeof record.expectedOutput === "string" ? JSON.parse(record.expectedOutput) : record.expectedOutput) as any,
    actualOutput: record.actualOutput
      ? ((typeof record.actualOutput === "string" ? JSON.parse(record.actualOutput) : record.actualOutput) as any)
      : undefined,
    passed: record.passed ?? undefined,
    errorMessage: record.errorMessage || undefined,
    testedAt: record.testedAt || undefined,
    executionTimeMs: record.executionTimeMs ?? undefined,
  };
}
