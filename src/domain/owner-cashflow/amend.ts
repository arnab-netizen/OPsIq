/**
 * Owner Cashflow — the pure decision behind amending a recorded Cashflow entry's cash figures.
 *
 * Two independent guards protect an edit and must never be conflated:
 *   - FRESHNESS (`expectedUpdatedAt`): the owner is editing the entry they last SAW. Decided by the service against the
 *     locked row; it never implies consent to replace a value.
 *   - REPLACEMENT CONSENT (`confirmReplace`): changing or clearing a value that is ALREADY recorded needs the owner's
 *     explicit confirmation. Filling in a previously-blank figure does not. Consent never implies freshness.
 * This module only classifies the proposed change; it performs no I/O and holds no clock. Pure.
 */

export type CashflowAmendField = "bankBalance" | "cashInHand";
export const CASHFLOW_AMEND_FIELDS: readonly CashflowAmendField[] = ["bankBalance", "cashInHand"];

export const CASHFLOW_FIELD_LABEL: Readonly<Record<CashflowAmendField, string>> = {
  bankBalance: "Bank balance",
  cashInHand: "Cash in hand",
};

export interface CashflowFigures {
  bankBalance: number | null;
  cashInHand: number | null;
}

export interface CashflowFieldChange {
  field: CashflowAmendField;
  before: number | null;
  after: number | null;
  /** True when a value was already recorded and is being changed or cleared (needs explicit confirmation). */
  replacesRecordedValue: boolean;
}

export interface CashflowAmendPlan {
  /** Only the fields whose value actually differs. Empty means the request is a no-op. */
  changes: CashflowFieldChange[];
  noOp: boolean;
  needsConfirmation: boolean;
}

const known = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);

/** Classify a proposed amendment against the recorded figures (`undefined` = not touched, `null` = clear). */
export function planCashflowAmend(
  current: CashflowFigures,
  proposed: Partial<Record<CashflowAmendField, number | null | undefined>>
): CashflowAmendPlan {
  const changes: CashflowFieldChange[] = [];
  for (const field of CASHFLOW_AMEND_FIELDS) {
    const next = proposed[field];
    if (next === undefined) continue;
    const before = known(current[field]) ? current[field] : null;
    const after = next === null ? null : next;
    if (before === after) continue;
    changes.push({ field, before, after, replacesRecordedValue: before !== null });
  }
  return { changes, noOp: changes.length === 0, needsConfirmation: changes.some((c) => c.replacesRecordedValue) };
}

/** Machine codes of the 409s the Cashflow write paths return (the UI branches on these, never on message text). */
export const CASHFLOW_CONFLICT_CODES = {
  STALE: "CASHFLOW_STALE",
  REPLACEMENT_CONFIRMATION_REQUIRED: "CASHFLOW_REPLACEMENT_CONFIRMATION_REQUIRED",
  PERIOD_EXISTS: "CASHFLOW_PERIOD_EXISTS",
} as const;
export type CashflowConflictCode = (typeof CASHFLOW_CONFLICT_CODES)[keyof typeof CASHFLOW_CONFLICT_CODES];

export const CASHFLOW_PERIOD_EXISTS_MESSAGE = "You already have a cashflow entry for this period. Open it to edit.";
export const CASHFLOW_STALE_MESSAGE = "This entry changed since you opened it. Review the current figures, then try again.";
export const CASHFLOW_REPLACEMENT_MESSAGE = "A figure is already recorded here. Confirm that you want to replace it.";
