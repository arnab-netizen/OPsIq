/**
 * Owner Finance — canonical FIRST-READ SUFFICIENCY.
 *
 * ONE answer to "does OpsIQ have enough financial evidence for a first trustworthy read?", consumed by
 * onboarding, My Business, Start Here, the Finance quick path and the first-read CTA. It restates no
 * rule: it asks `missingCriticalFinanceInputs` (data-confidence.ts) — the decision engine's own
 * critical-evidence contract — so readiness can never contradict Finance.
 *
 * The contract is FACT-based, not taxonomy-based:
 *   - revenue known;
 *   - at least ONE genuine cost component known (COGS, fixed, variable, rent, payroll or utilities);
 *   - cash on hand known.
 * Blank/unknown is missing; a known zero is present. The 20-category evidence model may be used to
 * EXPLAIN the result, never to decide it. Pure (no I/O).
 */
import { missingCriticalFinanceInputs, type CriticalFinanceFields } from "./data-confidence";
import type { OwnerInputCategory } from "@/domain/owner-mode/input-catalog";

export type FirstReadFact = "revenue" | "costs" | "cashOnHand";

/** Plain owner-facing label for each fact (no domain/taxonomy vocabulary). */
export const FIRST_READ_FACT_LABEL: Record<FirstReadFact, string> = {
  revenue: "revenue",
  costs: "one cost figure",
  cashOnHand: "cash in hand (enter 0 if none)",
};

/**
 * Evidence categories that EXPLAIN each fact. Display/guidance only — readiness never reads this.
 * `costs` is satisfied by any one of its categories.
 */
export const FIRST_READ_FACT_CATEGORIES: Record<FirstReadFact, readonly OwnerInputCategory[]> = {
  revenue: ["revenue_sales"],
  costs: ["expenses", "fixed_costs", "payroll"],
  cashOnHand: ["cash_debt"],
};

export interface FirstReadSufficiency {
  sufficient: boolean;
  revenueKnown: boolean;
  costKnown: boolean;
  cashKnown: boolean;
  /** Critical facts still unknown, in engine order. Empty when sufficient. */
  missing: FirstReadFact[];
  /**
   * Which evidence the answer rests on. "completed" — a snapshot whose period has ended;
   * "provisional" — the in-progress period (a read on it is labelled provisional, never completed
   * truth); "none" — no snapshot at all.
   */
  basis: "completed" | "provisional" | "none";
}

const FACT_BY_ENGINE_KEY: Record<string, FirstReadFact> = {
  revenue: "revenue",
  costs: "costs",
  cashOnHand: "cashOnHand",
};

export function evaluateFirstReadSufficiency(
  input: CriticalFinanceFields,
  basis: FirstReadSufficiency["basis"] = "completed"
): FirstReadSufficiency {
  const missing = missingCriticalFinanceInputs(input)
    .map((k) => FACT_BY_ENGINE_KEY[k])
    .filter((f): f is FirstReadFact => f !== undefined);
  return {
    sufficient: missing.length === 0,
    revenueKnown: !missing.includes("revenue"),
    costKnown: !missing.includes("costs"),
    cashKnown: !missing.includes("cashOnHand"),
    missing,
    basis,
  };
}

/** The persisted OwnerFinancialSnapshot columns the critical-evidence rule reads. */
export interface CriticalFinanceRow {
  revenue?: number | null;
  costOfGoods?: number | null;
  fixedCosts?: number | null;
  variableCosts?: number | null;
  rent?: number | null;
  payroll?: number | null;
  utilities?: number | null;
  cashOnHand?: number | null;
}

/** Map persisted columns onto the engine's field names (null → unknown). */
export function criticalFieldsFromRow(row: CriticalFinanceRow): CriticalFinanceFields {
  return {
    revenue: row.revenue ?? undefined,
    costOfGoodsOrServices: row.costOfGoods ?? undefined,
    fixedCosts: row.fixedCosts ?? undefined,
    variableCosts: row.variableCosts ?? undefined,
    rent: row.rent ?? undefined,
    salaryPayroll: row.payroll ?? undefined,
    utilities: row.utilities ?? undefined,
    cashOnHand: row.cashOnHand ?? undefined,
  };
}

export function firstReadSufficiencyFromRow(
  row: CriticalFinanceRow | null | undefined,
  basis: "completed" | "provisional" = "completed"
): FirstReadSufficiency {
  if (!row) return { ...evaluateFirstReadSufficiency({}, "none"), basis: "none" };
  return evaluateFirstReadSufficiency(criticalFieldsFromRow(row), basis);
}

/**
 * Prefer a sufficient COMPLETED snapshot; otherwise a sufficient PROVISIONAL one (labelled as such);
 * otherwise report what the best available snapshot is still missing (completed first). Provisional
 * numbers are never relabelled as completed-period evidence.
 */
export function firstReadSufficiencyFromSnapshots(snapshots: {
  completed: CriticalFinanceRow | null | undefined;
  provisional: CriticalFinanceRow | null | undefined;
}): FirstReadSufficiency {
  const completed = firstReadSufficiencyFromRow(snapshots.completed, "completed");
  if (completed.sufficient) return completed;
  const provisional = firstReadSufficiencyFromRow(snapshots.provisional, "provisional");
  if (provisional.sufficient) return provisional;
  return snapshots.completed ? completed : snapshots.provisional ? provisional : completed;
}

/**
 * Adapter for callers that only know category PRESENCE (no snapshot): maps category presence onto the
 * same three facts. Used solely where a snapshot is unavailable; the sufficiency rule itself is still
 * `evaluateFirstReadSufficiency`.
 */
export function firstReadSufficiencyFromCategories(supplied: ReadonlySet<OwnerInputCategory>): FirstReadSufficiency {
  const has = (f: FirstReadFact) => FIRST_READ_FACT_CATEGORIES[f].some((c) => supplied.has(c));
  return evaluateFirstReadSufficiency({
    revenue: has("revenue") ? 0 : undefined,
    fixedCosts: has("costs") ? 0 : undefined,
    cashOnHand: has("cashOnHand") ? 0 : undefined,
  });
}
