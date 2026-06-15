/**
 * B16-S1: Public Dataset Test Harness — Deterministic Calculation Tests
 *
 * Defines the domain models for:
 * - Public datasets (retail, e-commerce, SaaS, etc.)
 * - Deterministic calculation tests
 * - Calculation execution logs
 *
 * Purpose:
 * - Load public datasets with known properties
 * - Define calculation functions with expected outputs
 * - Execute calculations deterministically
 * - Verify results match expected values
 * - Track execution history and performance
 */

export type DatasetType = 'retail' | 'ecommerce' | 'restaurant' | 'saas' | 'marketing' | 'cashflow' | 'inventory' | 'financial_statement';

export type CalculationType = 'revenue_sum' | 'average_transaction' | 'growth_rate' | 'margin_percent' | 'churn_rate' | 'conversion_rate' | 'inventory_turnover' | 'cash_position';

export interface PublicDataset {
  id: string; // dataset_<type>_<date>_<sequence>
  name: string;
  datasetType: DatasetType;
  description: string;
  rawData: Record<string, unknown>[]; // Array of transaction/record objects
  sourceUrl?: string; // Link to original public source
  licenseType: string; // public_domain, cc_by, open_data, etc.
  allowedUse: string; // What uses are permitted
  rowCount: number; // Number of records in dataset
  createdAt: Date;
}

export interface CalculationTest {
  id: string; // calc_<datasetId>_<calculationType>_<sequence>
  datasetId: string;
  calculationType: CalculationType;
  description: string;

  // Test definition
  input: {
    filters?: Record<string, unknown>; // e.g., { timeframe: "2025-Q1" }
    parameters?: Record<string, unknown>; // e.g., { margin_threshold: 0.2 }
  };

  expectedOutput: {
    value: number | string | boolean; // e.g., 150000 (revenue sum)
    tolerance?: number; // For floating-point comparisons, e.g., 0.01 (1%)
  };

  actualOutput?: {
    value: number | string | boolean;
    calculatedAt: Date;
  };

  // Test result
  passed?: boolean;
  errorMessage?: string;
  testedAt?: Date;
  executionTimeMs?: number;
}

export interface CalculationLog {
  logId: string; // log_<calculationId>_<sequence>
  calculationId: string;
  executionTimeMs: number;
  memoryUsedMb?: number;
  notes?: string;
  recordedAt: Date;
}

export interface DatasetStatistics {
  datasetId: string;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  averageExecutionTimeMs: number;
  minExecutionTimeMs: number;
  maxExecutionTimeMs: number;
  determinismScore: number; // 0.0-1.0: percentage of times result is identical
}

/**
 * Validate that a calculation test is properly defined
 */
export function validateCalculationTest(test: CalculationTest): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!test.datasetId) {
    errors.push("Calculation test must reference a dataset");
  }

  if (!test.calculationType) {
    errors.push("Calculation type must be specified");
  }

  if (!test.expectedOutput || test.expectedOutput.value === undefined) {
    errors.push("Expected output value must be defined");
  }

  if (test.input === undefined) {
    errors.push("Input parameters must be defined (can be empty object)");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Check if a calculation is deterministic
 * (same input produces same output)
 */
export function isCalculationDeterministic(
  execution1: CalculationTest,
  execution2: CalculationTest
): boolean {
  if (execution1.datasetId !== execution2.datasetId) {
    return false;
  }

  if (execution1.calculationType !== execution2.calculationType) {
    return false;
  }

  if (JSON.stringify(execution1.input) !== JSON.stringify(execution2.input)) {
    return false;
  }

  if (!execution1.actualOutput || !execution2.actualOutput) {
    return false;
  }

  const tolerance = execution1.expectedOutput.tolerance || 0;
  if (typeof execution1.actualOutput.value === 'number' && typeof execution2.actualOutput.value === 'number') {
    const diff = Math.abs(execution1.actualOutput.value - execution2.actualOutput.value);
    const percent = diff / Math.abs(execution1.actualOutput.value) || 0;
    return percent <= tolerance;
  }

  return execution1.actualOutput.value === execution2.actualOutput.value;
}
