/**
 * Owner Finance — how the owner updates a period that already holds figures (pure).
 *
 * A saved period is never edited in place and never re-added: the owner opens it, sees what is recorded now, changes only what
 * is wrong or newly known, and the change is sent to the governed amendment route, which keeps the earlier version as history
 * and makes the new one the current evidence. This module turns the form's draft into that amendment's fields:
 *
 *   - blank            → leave the recorded figure as it is (omitted from the amendment);
 *   - a number, "0"    → set it (0 is a real, known zero);
 *   - "I don't know"   → return it to UNKNOWN (sent as null — never as 0, never by restoring an earlier number);
 *   - a figure typed that equals what is recorded is not a change and is not sent.
 *
 * Legacy rows (Finance D9): a period saved before refunds, redone work and complaint costs were stored separately holds only
 * one combined figure whose split was never recorded. Those three cannot be corrected one at a time: if any of them is
 * touched, all three must be addressed (a number, or "I don't know"). The server enforces the same rule; this module states
 * it to the owner before the request.
 *
 * Parsing reuses the quick-entry parser, so a figure reads identically in every form. No I/O, no UI.
 */
import { parseQuickAmount } from "./quick-entry";
import { FINANCE_FIELDS } from "./snapshot-fields";
import { ownerFieldLabel } from "@/domain/owner-spine/owner-field-labels";

/** Form field name → the persisted column it is read from (names differ for a handful of fields). */
export const FINANCE_FIELD_COLUMN: Readonly<Record<string, string>> = Object.freeze({
  costOfGoodsOrServices: "costOfGoods",
  salaryPayroll: "payroll",
  deliveryFulfilmentCost: "deliveryCost",
  loanEmiDebtPayments: "debtPayments",
  receivablesOverdue: "overdueReceivables",
  payablesOverdue: "overduePayables",
  inventoryStockCashLock: "inventoryCashLock",
});

/** The three leakage components D9 stores independently. */
export const LEAKAGE_COMPONENT_FIELDS = ["refundAmount", "reworkCost", "complaintCost"] as const;
const LEAKAGE_SET: ReadonlySet<string> = new Set(LEAKAGE_COMPONENT_FIELDS);

type Row = Record<string, unknown>;
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** What is recorded NOW for every form figure (null = not recorded / UNKNOWN). */
export function recordedFiguresFromRow(row: Row): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const f of FINANCE_FIELDS) out[f.name] = num(row[FINANCE_FIELD_COLUMN[f.name] ?? f.name]);
  return out;
}

/**
 * True when the row does not store the three leakage components separately (marker absent or unknown) — the SAME rule the server
 * applies (`resolveAmendedLeakage`), whether or not a combined figure was recorded. Such a row needs all three restated together.
 */
export function isLegacyLeakageRow(row: Row): boolean {
  return row.leakageCompVersion !== 1;
}

/** The amendment reasons an owner can pick; the sentence is what is stored as the amendment's provenance. */
export const AMEND_REASONS = [
  { id: "completed", label: "I now have figures I didn't have before", text: "Owner completed figures that were not known when the period was first saved" },
  { id: "corrected", label: "I'm correcting a mistake", text: "Owner corrected figures that were entered wrongly" },
  { id: "better", label: "I have better information", text: "Owner replaced earlier figures with better information" },
] as const;
export type AmendReasonId = (typeof AMEND_REASONS)[number]["id"];

export interface PlannedChange {
  field: string;
  label: string;
  before: number | null;
  /** null = the owner no longer knows this figure (it returns to UNKNOWN). */
  after: number | null;
}

export interface PeriodAmendPlan {
  /** Per-field inline errors (unreadable number, legacy group left incomplete). */
  errors: Record<string, string>;
  /** Form-level problem stated to the owner (legacy group), or null. */
  formProblem: string | null;
  /** Figures that will change, in form order, for the "review before you save" summary. */
  changes: PlannedChange[];
  /** The fields to send to the amend route (figures only). */
  fields: Record<string, number | null>;
  /** Typed figures that equal what is recorded (not changes). */
  sameAsRecorded: string[];
  /** True when there is something to save (a changed figure, or a stated reliability). */
  canSave: boolean;
}

const LEGACY_GROUP_PROBLEM =
  "Refunds, redone work and complaint costs were saved earlier as one combined figure, so they can't be corrected one at a time. Enter all three — or tick “I don't know” for any you can't give.";

export function planPeriodAmendment(
  row: Row,
  draft: Readonly<Record<string, string | undefined>>,
  unknown: Readonly<Record<string, boolean | undefined>>,
  qualityChosen: boolean
): PeriodAmendPlan {
  const recorded = recordedFiguresFromRow(row);
  const legacy = isLegacyLeakageRow(row);
  const errors: Record<string, string> = {};
  const values: Record<string, number> = {};
  const clears: string[] = [];
  const sameAsRecorded: string[] = [];

  for (const f of FINANCE_FIELDS) {
    const name = f.name;
    if (unknown[name]) {
      // "I don't know" only means something for a recorded figure — or, on a legacy row, for a leakage component, where it is
      // the explicit "this part is not known" the restatement needs.
      if (recorded[name] !== null || (legacy && LEAKAGE_SET.has(name))) clears.push(name);
      continue;
    }
    const parsed = parseQuickAmount(draft[name]);
    if (parsed.kind === "invalid") errors[name] = parsed.message;
    else if (parsed.kind === "value") {
      if (recorded[name] === parsed.value && !(legacy && LEAKAGE_SET.has(name))) sameAsRecorded.push(name);
      else values[name] = parsed.value;
    }
  }

  let formProblem: string | null = null;
  if (legacy) {
    const addressed = (n: string) => n in values || clears.includes(n) || (draft[n] ?? "").trim() !== "";
    const touched = LEAKAGE_COMPONENT_FIELDS.some(addressed);
    if (touched) {
      const missing = LEAKAGE_COMPONENT_FIELDS.filter((n) => !addressed(n));
      if (missing.length > 0) {
        formProblem = LEGACY_GROUP_PROBLEM;
        for (const n of missing) errors[n] = "Enter this figure, or tick “I don't know”.";
      }
    }
  }

  const fields: Record<string, number | null> = { ...values, ...Object.fromEntries(clears.map((k) => [k, null])) };
  const changes: PlannedChange[] = FINANCE_FIELDS.filter((f) => f.name in fields).map((f) => ({
    field: f.name,
    label: f.label,
    before: recorded[f.name],
    after: fields[f.name],
  }));
  const hasErrors = Object.keys(errors).length > 0;
  return { errors, formProblem, changes, fields, sameAsRecorded, canSave: !hasErrors && (changes.length > 0 || qualityChosen) };
}

/** Owner words for one planned change: "Revenue: not entered → 80,000". Amounts are formatted by the caller. */
export function describeChange(c: PlannedChange, fmt: (n: number | null) => string): string {
  const after = c.after === null ? "not known (back to unknown)" : fmt(c.after);
  const before = c.before === null ? "not entered" : fmt(c.before);
  return `${c.label}: ${before} → ${after}`;
}

/** The label used for a figure in running text (kept next to the plan so the form and its summary agree). */
export function figureLabel(field: string): string {
  return FINANCE_FIELDS.find((f) => f.name === field)?.label ?? ownerFieldLabel(field);
}
