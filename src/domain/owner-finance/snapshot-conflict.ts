/**
 * Owner Finance — machine codes of the 409s the snapshot write paths answer with (pure).
 *
 * The owner's screen branches on the CODE, never on message text: a period that already holds figures is OPENED for
 * updating through the governed amendment route, and a snapshot that has since been superseded asks the owner to review the
 * latest figures. Mirrors the Cashflow pattern (domain/owner-cashflow/amend.ts).
 */
export const FINANCE_CONFLICT_CODES = {
  PERIOD_EXISTS: "FINANCE_PERIOD_EXISTS",
  SUPERSEDED: "FINANCE_SNAPSHOT_SUPERSEDED",
} as const;
export type FinanceConflictCode = (typeof FINANCE_CONFLICT_CODES)[keyof typeof FINANCE_CONFLICT_CODES];

export const FINANCE_PERIOD_EXISTS_OWNER_MESSAGE =
  "You already have figures saved for this period, so it can't be added again. Update that period instead — your earlier figures are kept as history.";
export const FINANCE_SUPERSEDED_OWNER_MESSAGE =
  "These figures were updated after you opened them, so nothing was changed. Review the latest figures, then make your change again.";
