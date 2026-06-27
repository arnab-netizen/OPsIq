/**
 * Working-Capital Ageing Engine (Dynamic Budget). Pure, deterministic.
 *
 * Upgrades coarse receivable/payable pressure into ageing-aware owner guidance:
 * which receivables to collect first, where overdue payables create vendor/supply
 * risk, when a business is "profitable but cash-negative" because cash is trapped
 * in receivables, and when growth spend must be blocked until collections improve.
 *
 * This does NOT duplicate the budget mode/allocation/reassessment engines — it
 * produces an ageing assessment + signal list that the existing plan composer and
 * reassessment flow consume. Source data is manual / import-ready (not a live feed);
 * confidence is downgraded honestly when due dates are missing or data is stale.
 */
import type { BudgetSignalType } from "@/domain/owner-budget/types";
import type { Pressure } from "@/domain/owner-budget/working-capital";

export type AgeingBucket = "current" | "d0_30" | "d31_60" | "d61_90" | "d90_plus" | "unknown";

/** Statuses that still represent outstanding (uncollected/unpaid) balances. */
const OPEN_STATUSES: ReadonlySet<string> = new Set(["open", "outstanding", "partial", "disputed"]);

export interface WorkingCapitalLineItem {
  kind: "receivable" | "payable";
  amount: number;
  /** Null/absent due date ⇒ cannot be aged ⇒ downgrades confidence. */
  dueDate?: string | Date | null;
  counterparty?: string | null;
  status?: string | null;
  /** Honestly labelled MANUAL / IMPORT — never a live feed. */
  sourceType?: string | null;
  /** Last time the row was touched; drives staleness for manual data. */
  updatedAt?: string | Date | null;
}

export interface WorkingCapitalAgeingInput {
  asOf: string | Date;
  items: WorkingCapitalLineItem[];
  /** Free cash after the statutory/cash reserve (excludes uncollected receipts). */
  freeCashAfterReserve?: number | null;
  /** Whether the business is profitable on the books (margin > 0). */
  netProfitable?: boolean | null;
  /** Manual data older than this many days is treated as stale. Default 30. */
  staleAfterDays?: number;
}

export interface BucketBreakdown {
  current: number;
  d0_30: number;
  d31_60: number;
  d61_90: number;
  d90_plus: number;
  unknown: number;
  total: number;
}

export type AgeingConfidence = "PARTIAL" | "UNVERIFIED" | "INSUFFICIENT";

export interface WorkingCapitalAgeingResult {
  asOf: string;
  receivables: BucketBreakdown;
  payables: BucketBreakdown;
  receivablesOverdue: number;
  payablesOverdue: number;
  /** Receivables overdue 61+ days (the hard-to-collect tail). */
  receivablesSeriouslyOverdue: number;
  /** Payables overdue 61+ days (acute vendor/supply risk). */
  payablesSeriouslyOverdue: number;
  collectionFirstRequired: boolean;
  collectionPriority: Array<{ counterparty: string; amount: number; bucket: AgeingBucket }>;
  receivablesPressure: Pressure;
  payablesPressure: Pressure;
  vendorPressureRisk: boolean;
  cashConversionRisk: boolean;
  profitableButCashNegative: boolean;
  growthBlockedByWorkingCapital: boolean;
  confidence: AgeingConfidence;
  dataInsufficient: boolean;
  dataStale: boolean;
  signals: BudgetSignalType[];
  reasons: string[];
}

const DAY_MS = 86_400_000;

function toTime(d: string | Date): number {
  return d instanceof Date ? d.getTime() : new Date(d).getTime();
}

/** Days a balance is overdue relative to `asOf` (negative/zero ⇒ not yet due). */
export function daysOverdue(dueDate: string | Date, asOf: string | Date): number {
  return Math.floor((toTime(asOf) - toTime(dueDate)) / DAY_MS);
}

/** Classify a single balance into an ageing bucket. No due date ⇒ "unknown". */
export function classifyAgeingBucket(
  dueDate: string | Date | null | undefined,
  asOf: string | Date
): AgeingBucket {
  if (dueDate === null || dueDate === undefined || dueDate === "") return "unknown";
  const t = toTime(dueDate);
  if (Number.isNaN(t)) return "unknown";
  const od = daysOverdue(dueDate, asOf);
  if (od <= 0) return "current";
  if (od <= 30) return "d0_30";
  if (od <= 60) return "d31_60";
  if (od <= 90) return "d61_90";
  return "d90_plus";
}

function emptyBreakdown(): BucketBreakdown {
  return { current: 0, d0_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0, unknown: 0, total: 0 };
}

function ratioPressure(part: number, whole: number): Pressure {
  if (whole <= 0) return "UNKNOWN";
  const r = part / whole;
  return r >= 0.4 ? "HIGH" : r >= 0.2 ? "MEDIUM" : "LOW";
}

function isOpen(item: WorkingCapitalLineItem): boolean {
  const s = (item.status ?? "open").toLowerCase();
  return OPEN_STATUSES.has(s);
}

/**
 * Assess working-capital ageing and derive owner guidance + budget signals.
 * Pure: identical input ⇒ identical output. No DB, no clock reads (asOf is passed).
 */
export function assessWorkingCapitalAgeing(input: WorkingCapitalAgeingInput): WorkingCapitalAgeingResult {
  const asOf = input.asOf;
  const staleAfter = input.staleAfterDays ?? 30;
  const open = input.items.filter(isOpen);

  const receivables = emptyBreakdown();
  const payables = emptyBreakdown();
  const collectionPriority: Array<{ counterparty: string; amount: number; bucket: AgeingBucket }> = [];
  let unknownOpen = 0;
  let staleOpen = 0;

  for (const item of open) {
    const amount = Number.isFinite(item.amount) ? Math.max(0, item.amount) : 0;
    const bucket = classifyAgeingBucket(item.dueDate, asOf);
    const target = item.kind === "receivable" ? receivables : payables;
    target[bucket] += amount;
    target.total += amount;
    if (bucket === "unknown") unknownOpen++;
    // Staleness applies to manual data with a known last-touch timestamp.
    const src = (item.sourceType ?? "MANUAL").toUpperCase();
    if ((src === "MANUAL" || src === "IMPORT") && item.updatedAt) {
      if (daysOverdue(item.updatedAt, asOf) > staleAfter) staleOpen++;
    }
    if (item.kind === "receivable" && bucket !== "current" && bucket !== "unknown" && amount > 0) {
      collectionPriority.push({ counterparty: item.counterparty ?? "unknown", amount, bucket });
    }
  }

  // Most-overdue, largest receivables first.
  const order: Record<AgeingBucket, number> = { d90_plus: 5, d61_90: 4, d31_60: 3, d0_30: 2, current: 1, unknown: 0 };
  collectionPriority.sort((a, b) => order[b.bucket] - order[a.bucket] || b.amount - a.amount);

  const receivablesOverdue = receivables.d0_30 + receivables.d31_60 + receivables.d61_90 + receivables.d90_plus;
  const payablesOverdue = payables.d0_30 + payables.d31_60 + payables.d61_90 + payables.d90_plus;
  const receivablesSeriouslyOverdue = receivables.d61_90 + receivables.d90_plus;
  const payablesSeriouslyOverdue = payables.d61_90 + payables.d90_plus;

  const receivablesPressure = ratioPressure(receivablesOverdue, receivables.total);
  const payablesPressure = ratioPressure(payablesOverdue, payables.total);

  // Honest confidence: manual/import data is never "verified"; missing due dates
  // make ageing unreliable; stale data is downgraded further.
  const dataInsufficient = unknownOpen > 0;
  const dataStale = staleOpen > 0;
  const confidence: AgeingConfidence = dataInsufficient ? "INSUFFICIENT" : dataStale ? "UNVERIFIED" : "PARTIAL";

  const collectionFirstRequired = receivables.d90_plus > 0;
  const vendorPressureRisk = payables.d90_plus > 0 || payablesPressure === "HIGH";
  const profitableButCashNegative =
    input.netProfitable === true &&
    typeof input.freeCashAfterReserve === "number" &&
    input.freeCashAfterReserve <= 0 &&
    receivablesOverdue > 0;
  const cashConversionRisk = receivablesSeriouslyOverdue > 0 || profitableButCashNegative;
  const growthBlockedByWorkingCapital =
    collectionFirstRequired || vendorPressureRisk || profitableButCashNegative || cashConversionRisk;

  const signals: BudgetSignalType[] = [];
  const reasons: string[] = [];

  if (receivablesOverdue > 0) {
    signals.push("receivables_ageing_risk");
    reasons.push(`Overdue receivables total ${Math.round(receivablesOverdue)} (90+: ${Math.round(receivables.d90_plus)}).`);
  }
  if (payablesOverdue > 0) {
    signals.push("payables_ageing_risk");
    reasons.push(`Overdue payables total ${Math.round(payablesOverdue)} (90+: ${Math.round(payables.d90_plus)}).`);
  }
  if (collectionFirstRequired) {
    signals.push("collection_first_required");
    reasons.push("Receivables 90+ days overdue — collect first before any new discretionary or growth spend.");
  }
  if (vendorPressureRisk) {
    signals.push("vendor_pressure_risk");
    reasons.push("Overdue payables create vendor/supply risk — negotiate terms or stage critical payments.");
  }
  if (profitableButCashNegative) {
    signals.push("profitable_but_cash_negative");
    reasons.push("Business is profitable on the books but free cash is non-positive — cash is trapped in overdue receivables.");
  }
  if (cashConversionRisk) {
    signals.push("cash_conversion_risk");
    reasons.push("Cash conversion is impaired — booked profit is not yet available as spendable cash.");
  }
  if (growthBlockedByWorkingCapital) {
    signals.push("growth_blocked_by_working_capital");
    reasons.push("Growth/scale spend is blocked until collections improve and reserve survives the collection gap.");
  }
  if (dataInsufficient) {
    signals.push("working_capital_data_insufficient");
    reasons.push("Some receivable/payable balances have no due date — ageing cannot be classified confidently.");
  }
  if (dataStale) {
    signals.push("working_capital_data_stale");
    reasons.push("Manual working-capital data is stale — refresh before relying on ageing for irreversible decisions.");
  }

  return {
    asOf: asOf instanceof Date ? asOf.toISOString() : new Date(asOf).toISOString(),
    receivables,
    payables,
    receivablesOverdue,
    payablesOverdue,
    receivablesSeriouslyOverdue,
    payablesSeriouslyOverdue,
    collectionFirstRequired,
    collectionPriority,
    receivablesPressure,
    payablesPressure,
    vendorPressureRisk,
    cashConversionRisk,
    profitableButCashNegative,
    growthBlockedByWorkingCapital,
    confidence,
    dataInsufficient,
    dataStale,
    signals,
    reasons,
  };
}
