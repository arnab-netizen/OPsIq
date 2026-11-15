/**
 * QuickBooks erasure — PURE authorship classification of the canonical Finance / Cashflow rows QuickBooks fed.
 *
 * No I/O, no database, no clock. Every rule fails CLOSED: a figure that cannot be shown to be the owner's own is treated as
 * QuickBooks-derived and removed. Nothing here ever returns a monetary value — only column names and ids.
 *
 * FINANCE (versioned): QuickBooks writes six figures. The owner's amendments record which input keys they set (`changedFields`),
 * so authorship is decided PER FIELD by walking the chain oldest -> newest: the last version that set a field decides who wrote it
 * (a version with provenance = QuickBooks, a version without = the owner). A field the owner explicitly re-stated is theirs;
 * a field no later version touched is still QuickBooks'. An amendment whose `changedFields` is missing/unreadable touches nothing
 * (attribution persists), which is the fail-closed reading.
 *
 * CASHFLOW (updated in place, no per-field lineage): QuickBooks controls the row only while its `updated_at` still equals the
 * stamp recorded in the latest provenance row. If anyone wrote since, the five QuickBooks columns are removed (the owner's own
 * values in OTHER columns survive; an owner edit of one of those five columns is conservatively removed with them).
 */

export const QBO_IMPORT_NOTE = "Imported from QuickBooks Online.";

/** The only Finance columns QuickBooks ever writes (DB column names). */
export const FINANCE_QBO_COLUMNS = ["revenue", "cost_of_goods", "receivables", "overdue_receivables", "payables", "overdue_payables"] as const;
export type FinanceQboColumn = (typeof FINANCE_QBO_COLUMNS)[number];

/** `changedFields` holds amend-input keys; map the six QuickBooks-writable ones to their columns. */
const CHANGED_KEY_TO_COLUMN: Readonly<Record<string, FinanceQboColumn>> = {
  revenue: "revenue",
  costOfGoodsOrServices: "cost_of_goods",
  receivables: "receivables",
  receivablesOverdue: "overdue_receivables",
  payables: "payables",
  payablesOverdue: "overdue_payables",
};

/** Numeric Finance columns QuickBooks never writes: always the owner's. */
export const FINANCE_OWNER_NUMERIC_COLUMNS = [
  "fixed_costs", "variable_costs", "rent", "payroll", "utilities", "delivery_cost", "marketing_spend", "discount_amount",
  "refund_rework_cost", "refund_amount", "rework_cost", "complaint_cost", "debt_payments", "total_debt_outstanding", "cash_on_hand",
  "owner_withdrawals", "inventory_cash_lock", "order_count", "customer_count", "repeat_customer_count", "b2b_revenue", "b2c_revenue",
] as const;

export interface FinanceVersionInput {
  id: string;
  version: number;
  supersededById: string | null;
  /** The amendment's `changed_fields` JSON, untouched. */
  changedFields: unknown;
  /** Column -> numeric value (null = unknown) for FINANCE_QBO_COLUMNS and FINANCE_OWNER_NUMERIC_COLUMNS. */
  values: Readonly<Record<string, number | null | undefined>>;
  notes: string | null;
  /** A provenance row points at exactly this version. */
  hasProvenance: boolean;
}

export type FinanceChainPlan =
  | { mode: "DELETE_CHAIN"; currentId: string; deleteVersionIds: string[] }
  | {
      mode: "SCRUB_CURRENT";
      currentId: string;
      /** Superseded versions: deleted (they hold the QuickBooks values the owner's version inherited). */
      deleteVersionIds: string[];
      nullColumns: FinanceQboColumn[];
      clearNotes: boolean;
      /** After scrubbing nothing independently supportable remains: remove the (now empty) current version too. */
      deleteCurrent: boolean;
      /** Columns of the current version that the owner demonstrably authored and that are retained. */
      retainedOwnerColumns: string[];
    }
  | { mode: "ANOMALY"; code: "EMPTY_CHAIN" | "NO_UNIQUE_HEAD" | "HEAD_NOT_LATEST" | "NO_PROVENANCE"; versionIds: string[] };

const present = (v: number | null | undefined): v is number => typeof v === "number";

function touchedColumns(v: FinanceVersionInput, isFirst: boolean): readonly FinanceQboColumn[] {
  if (isFirst) return FINANCE_QBO_COLUMNS; // creation sets every column at once
  if (!Array.isArray(v.changedFields)) return []; // unreadable lineage: attribution persists (fail closed)
  const out = new Set<FinanceQboColumn>();
  for (const k of v.changedFields) {
    if (typeof k === "string" && CHANGED_KEY_TO_COLUMN[k]) out.add(CHANGED_KEY_TO_COLUMN[k]);
  }
  return [...out];
}

export function classifyFinanceChain(input: readonly FinanceVersionInput[]): FinanceChainPlan {
  const versions = [...input].sort((a, b) => a.version - b.version);
  const ids = versions.map((v) => v.id);
  if (versions.length === 0) return { mode: "ANOMALY", code: "EMPTY_CHAIN", versionIds: ids };
  if (!versions.some((v) => v.hasProvenance)) return { mode: "ANOMALY", code: "NO_PROVENANCE", versionIds: ids };
  const heads = versions.filter((v) => v.supersededById === null);
  if (heads.length !== 1) return { mode: "ANOMALY", code: "NO_UNIQUE_HEAD", versionIds: ids };
  const current = heads[0];
  if (current.id !== versions[versions.length - 1].id) return { mode: "ANOMALY", code: "HEAD_NOT_LATEST", versionIds: ids };

  // Every version QuickBooks-authored: the whole period is QuickBooks-controlled.
  if (versions.every((v) => v.hasProvenance)) return { mode: "DELETE_CHAIN", currentId: current.id, deleteVersionIds: ids };

  // Mixed: per-field authorship.
  const attr = new Map<FinanceQboColumn, "QBO" | "OWNER" | null>(FINANCE_QBO_COLUMNS.map((c) => [c, null]));
  versions.forEach((v, i) => {
    for (const col of touchedColumns(v, i === 0)) {
      attr.set(col, present(v.values[col]) ? (v.hasProvenance ? "QBO" : "OWNER") : null);
    }
  });

  const nullColumns = FINANCE_QBO_COLUMNS.filter((c) => attr.get(c) === "QBO" && present(current.values[c]));
  const clearNotes = current.notes === QBO_IMPORT_NOTE;
  const retainedOwnerColumns: string[] = [
    ...FINANCE_QBO_COLUMNS.filter((c) => attr.get(c) === "OWNER" && present(current.values[c])),
    ...FINANCE_OWNER_NUMERIC_COLUMNS.filter((c) => present(current.values[c])),
  ];
  const notesRetained = current.notes !== null && current.notes !== "" && !clearNotes;
  const deleteCurrent = retainedOwnerColumns.length === 0 && !notesRetained;
  return {
    mode: "SCRUB_CURRENT",
    currentId: current.id,
    deleteVersionIds: ids.filter((id) => id !== current.id),
    nullColumns,
    clearNotes,
    deleteCurrent,
    retainedOwnerColumns,
  };
}

export const CASHFLOW_QBO_COLUMNS = ["bank_balance", "receivables", "receivables_overdue", "payables", "payables_overdue"] as const;
export type CashflowQboColumn = (typeof CASHFLOW_QBO_COLUMNS)[number];
export const CASHFLOW_OWNER_NUMERIC_COLUMNS = ["cash_in_hand", "daily_collections", "upcoming_emi", "rent_due", "salary_due", "vendor_due", "tax_due", "owner_withdrawal"] as const;

export interface CashflowRowInput {
  id: string;
  updatedAtMs: number;
  /** `target_updated_at` of the NEWEST provenance row for this row (the stamp QuickBooks last wrote), or null. */
  latestStampMs: number | null;
  values: Readonly<Record<string, number | null | undefined>>;
  notes: string | null;
}

export type CashflowRowPlan =
  | { mode: "DELETE_ROW"; id: string }
  | { mode: "SCRUB_ROW"; id: string; nullColumns: CashflowQboColumn[]; clearNotes: boolean; deleteRow: boolean; retainedOwnerColumns: string[] };

export function classifyCashflowRow(i: CashflowRowInput): CashflowRowPlan {
  // QuickBooks created the row and nobody wrote since (the same compare-and-set the materializer uses): wholly QuickBooks'.
  if (i.latestStampMs !== null && i.updatedAtMs === i.latestStampMs) return { mode: "DELETE_ROW", id: i.id };
  const nullColumns = CASHFLOW_QBO_COLUMNS.filter((c) => present(i.values[c]));
  const clearNotes = i.notes === QBO_IMPORT_NOTE;
  const retainedOwnerColumns = CASHFLOW_OWNER_NUMERIC_COLUMNS.filter((c) => present(i.values[c]));
  const notesRetained = i.notes !== null && i.notes !== "" && !clearNotes;
  return { mode: "SCRUB_ROW", id: i.id, nullColumns, clearNotes, deleteRow: retainedOwnerColumns.length === 0 && !notesRetained, retainedOwnerColumns };
}
