/**
 * Owner Finance — the COST MODEL (pure, dependency-free so both the metrics and the confidence model use it).
 *
 * UNKNOWN is never zero (owner decision). A cost group's total is a fact only when every part of it is known; the
 * grand total only when both the fixed and the variable total are. An explicit 0 is a known value.
 */
import type { FinancialSnapshotInput } from "./types";

/** Present finite number, else null (fail closed on NaN/Infinity/missing). */
export function num(x: number | undefined | null): number | null {
  if (x === undefined || x === null || !Number.isFinite(x)) return null;
  return x;
}

/** Sum the present finite values; null if none are present (a KNOWN SUBSET — never a total). */
export function sumPresent(...xs: (number | undefined | null)[]): number | null {
  const vals = xs.map(num).filter((v): v is number => v !== null);
  if (vals.length === 0) return null;
  return vals.reduce((s, v) => s + v, 0);
}

/**
 * Sum ONLY when every part is known; otherwise the group total is UNKNOWN (null). A missing component is not a
 * zero: rent known with payroll/utilities unknown is a known SUBSET, never "the fixed costs".
 */
function sumAllKnown(...xs: (number | undefined | null)[]): number | null {
  const vals = xs.map(num);
  if (vals.some((v) => v === null)) return null;
  return (vals as number[]).reduce((sum, v) => sum + v, 0);
}

/** The four leakage components and which of them the owner has actually entered (UNKNOWN is not zero). */
export const LEAKAGE_COMPONENTS = [
  { key: "discountAmount", label: "discounts" },
  { key: "refundAmount", label: "refunds" },
  { key: "reworkCost", label: "redone work" },
  { key: "complaintCost", label: "complaint costs" },
] as const;

/** Metrics that are a TOTAL over a group of components: measured with any component UNKNOWN they are a known-subset lower bound. */
export const GROUP_TOTAL_METRICS: ReadonlySet<string> = new Set(["costLeakageRatioPct"]);

/**
 * Whether a finding's value is a lower bound: the domain flagged it when it was raised, or (for a stored finding, which
 * persists `missingData` but not the flag) it is a group-total metric with components still UNKNOWN.
 */
export function findingValueIsLowerBound(f: { sourceMetric: string; missingData?: unknown; valueIsLowerBound?: boolean }): boolean {
  if (f.valueIsLowerBound === true) return true;
  return GROUP_TOTAL_METRICS.has(f.sourceMetric) && Array.isArray(f.missingData) && f.missingData.length > 0;
}

export interface LeakageCoverage {
  known: string[];
  unknown: string[];
  complete: boolean;
}

export function leakageCoverage(input: FinancialSnapshotInput): LeakageCoverage {
  const known: string[] = [];
  const unknown: string[] = [];
  for (const c of LEAKAGE_COMPONENTS) (num(input[c.key]) === null ? unknown : known).push(c.label);
  return { known, unknown, complete: unknown.length === 0 };
}

/** Fixed costs as a KNOWN TOTAL: the explicit aggregate, else rent + payroll + utilities only when all three are known. */
export function fixedCostsTotal(input: FinancialSnapshotInput): number | null {
  const explicit = num(input.fixedCosts);
  if (explicit !== null) return explicit;
  return sumAllKnown(input.rent, input.salaryPayroll, input.utilities);
}

/** Variable costs as a KNOWN TOTAL: the explicit aggregate, else COGS + delivery only when both are known. */
export function variableCostsTotal(input: FinancialSnapshotInput): number | null {
  const explicit = num(input.variableCosts);
  if (explicit !== null) return explicit;
  return sumAllKnown(input.costOfGoodsOrServices, input.deliveryFulfilmentCost);
}

/** What is known of the fixed costs so far (explicit aggregate, else the components that are known); null if nothing. */
export function knownFixedCosts(input: FinancialSnapshotInput): number | null {
  const explicit = num(input.fixedCosts);
  return explicit !== null ? explicit : sumPresent(input.rent, input.salaryPayroll, input.utilities);
}

/** What is known of the variable costs so far; null if nothing. */
export function knownVariableCosts(input: FinancialSnapshotInput): number | null {
  const explicit = num(input.variableCosts);
  return explicit !== null ? explicit : sumPresent(input.costOfGoodsOrServices, input.deliveryFulfilmentCost);
}

/**
 * TOTAL costs are a fact only when BOTH the fixed and the variable total are known (an explicit 0 is known). If either
 * half is UNKNOWN the total is UNKNOWN — never the known half presented as everything — so net profit, net margin,
 * cash runway, cash cover and break-even all abstain. Marketing spend is a separately reported add-on: when entered
 * it is added; when absent it is not a required component (the quick path does not ask for it).
 */
export function totalCosts(input: FinancialSnapshotInput): number | null {
  const fixed = fixedCostsTotal(input);
  const variable = variableCostsTotal(input);
  if (fixed === null || variable === null) return null;
  return fixed + variable + (num(input.marketingSpend) ?? 0);
}

