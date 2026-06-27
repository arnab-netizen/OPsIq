/**
 * Working Capital Engine (Section 12). Pure, deterministic.
 *
 * Budget recommendations must consider cash timing, not just profit. A profitable
 * B2B contract that collects after 45 days must NOT unlock growth spend unless the
 * cash reserve can survive the collection gap. Inputs derive from the persisted
 * finance snapshot (receivables/payables/inventory) plus owner-supplied terms.
 */

export type Pressure = "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";

export interface WorkingCapitalInput {
  cashOnHand?: number | null;
  receivables?: number | null;
  receivablesOverdue?: number | null;
  payables?: number | null;
  payablesOverdue?: number | null;
  inventoryStockCashLock?: number | null;
  reserveRequired?: number | null;
  /** Collection terms for pending revenue (e.g. B2B 45-day). */
  collectionGapDays?: number | null;
  /** Value awaiting collection over that gap. */
  pendingReceiptValue?: number | null;
}

export interface WorkingCapitalResult {
  freeCashAfterReserve: number | null;
  receivablesPressure: Pressure;
  payablesPressure: Pressure;
  cashLockedInInventory: number | null;
  collectionGapRisk: boolean;
  /** False when a growth commitment cannot be survived across the collection gap. */
  canFundGrowthGivenGap: boolean;
  reasons: string[];
}

function ratioPressure(part: number | null | undefined, whole: number | null | undefined): Pressure {
  if (typeof part !== "number" || typeof whole !== "number" || whole <= 0) return "UNKNOWN";
  const r = part / whole;
  return r >= 0.4 ? "HIGH" : r >= 0.2 ? "MEDIUM" : "LOW";
}

export function assessWorkingCapital(i: WorkingCapitalInput): WorkingCapitalResult {
  const reasons: string[] = [];
  const reserve = Math.max(0, i.reserveRequired ?? 0);
  const cash = typeof i.cashOnHand === "number" ? i.cashOnHand : null;
  const freeCashAfterReserve = cash === null ? null : cash - reserve;

  const receivablesPressure = ratioPressure(i.receivablesOverdue, i.receivables);
  const payablesPressure = ratioPressure(i.payablesOverdue, i.payables);
  const cashLockedInInventory = typeof i.inventoryStockCashLock === "number" ? i.inventoryStockCashLock : null;

  if (receivablesPressure === "HIGH") reasons.push("High overdue receivables — collection risk.");
  if (payablesPressure === "HIGH") reasons.push("High overdue payables — supplier payment pressure.");
  if (cashLockedInInventory && cash !== null && cashLockedInInventory > cash * 0.5)
    reasons.push("Significant cash locked in inventory.");

  // Collection-gap survival: a pending receipt collected far in the future cannot
  // be spent now; growth is only fundable if free cash survives the gap without it.
  const gapDays = i.collectionGapDays ?? 0;
  const pending = i.pendingReceiptValue ?? 0;
  const collectionGapRisk = gapDays >= 30 && pending > 0;
  let canFundGrowthGivenGap = true;
  if (collectionGapRisk) {
    // Need a positive buffer that does NOT rely on the delayed receipt.
    canFundGrowthGivenGap = freeCashAfterReserve !== null && freeCashAfterReserve > 0;
    if (!canFundGrowthGivenGap) {
      reasons.push(`Profitable receipt of ${pending} arrives in ~${gapDays}d; reserve cannot survive the gap — do not fund growth on uncollected cash.`);
    } else {
      reasons.push(`Collection gap ~${gapDays}d present; fund growth only from cash that excludes the delayed receipt.`);
    }
  }

  return {
    freeCashAfterReserve,
    receivablesPressure,
    payablesPressure,
    cashLockedInInventory,
    collectionGapRisk,
    canFundGrowthGivenGap,
    reasons,
  };
}
