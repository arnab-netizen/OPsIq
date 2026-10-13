/**
 * Owner Cashflow — the decisions behind the "edit this entry" screen, kept out of the component.
 *
 * The screen shows what is recorded NOW, lets the owner change the two cash figures, and sends the change with the
 * `updatedAt` it saw. Whether a change needs confirmation, whether the entry changed underneath the owner, and
 * whether a create was refused because the entry already exists are decided by the SERVER (409 + machine `code`);
 * this module only classifies those answers and words the prompts. Pure.
 */
import { parseQuickAmount } from "@/domain/owner-finance/quick-entry";
import {
  CASHFLOW_AMEND_FIELDS,
  CASHFLOW_CONFLICT_CODES,
  CASHFLOW_FIELD_LABEL,
  planCashflowAmend,
  type CashflowAmendField,
  type CashflowFieldChange,
  type CashflowFigures,
} from "@/domain/owner-cashflow/amend";

export interface CashflowEditDraft {
  bankBalance: string;
  cashInHand: string;
}

/** Plain-number text for an input (a recorded 0 is "0"; not recorded is empty). */
export function draftFromFigures(f: CashflowFigures): CashflowEditDraft {
  const text = (v: number | null) => (v === null ? "" : String(v));
  return { bankBalance: text(f.bankBalance), cashInHand: text(f.cashInHand) };
}

export interface CashflowEditAssessment {
  errors: Partial<Record<CashflowAmendField, string>>;
  /** Only the fields that differ from what is recorded (null = cleared). */
  proposed: Partial<Record<CashflowAmendField, number | null>>;
  changes: CashflowFieldChange[];
  /** True when nothing differs from the recorded figures (nothing to save). */
  unchanged: boolean;
  /** True when saving would replace or clear a figure that is already recorded (the server will ask for confirmation). */
  replacesRecordedValue: boolean;
}

/** Parse the owner's draft against the recorded figures. A blank field means "not recorded" (a recorded value that is blanked is a clear). */
export function assessCashflowEditDraft(draft: CashflowEditDraft, current: CashflowFigures): CashflowEditAssessment {
  const errors: CashflowEditAssessment["errors"] = {};
  const wanted: Partial<Record<CashflowAmendField, number | null>> = {};
  for (const field of CASHFLOW_AMEND_FIELDS) {
    const parsed = parseQuickAmount(draft[field], { bankBalance: field === "bankBalance" });
    if (parsed.kind === "invalid") errors[field] = parsed.message;
    else wanted[field] = parsed.kind === "blank" ? null : parsed.value;
  }
  if (Object.keys(errors).length > 0) return { errors, proposed: {}, changes: [], unchanged: false, replacesRecordedValue: false };
  const plan = planCashflowAmend(current, wanted);
  const proposed: CashflowEditAssessment["proposed"] = {};
  for (const c of plan.changes) proposed[c.field] = c.after;
  return { errors, proposed, changes: plan.changes, unchanged: plan.noOp, replacesRecordedValue: plan.needsConfirmation };
}

export function formatCashflowAmount(value: number | null, currency: string): string {
  if (value === null || !Number.isFinite(value)) return "Not recorded";
  return `${currency} ${new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(value)}`;
}

/** "Replace Bank balance INR 1,000 with INR 2,000?" — one explicit question per replaced or cleared figure. */
export function replacementQuestions(changes: readonly CashflowFieldChange[], currency: string): string[] {
  return changes
    .filter((c) => c.replacesRecordedValue)
    .map((c) =>
      c.after === null
        ? `Clear ${CASHFLOW_FIELD_LABEL[c.field]} (now ${formatCashflowAmount(c.before, currency)})?`
        : `Replace ${CASHFLOW_FIELD_LABEL[c.field]} ${formatCashflowAmount(c.before, currency)} with ${formatCashflowAmount(c.after, currency)}?`,
    );
}

export type CashflowWriteFailure =
  | { kind: "STALE"; message: string; snapshotId: string | null; updatedAt: string | null; current: CashflowFigures | null }
  | { kind: "CONFIRMATION_REQUIRED"; message: string }
  | { kind: "PERIOD_EXISTS"; message: string; snapshotId: string | null; updatedAt: string | null }
  | { kind: "OTHER"; message: string };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const orNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Classify a failed Cashflow write from its HTTP status and body (machine `code`, never message text). */
export function classifyCashflowWriteFailure(status: number, body: unknown): CashflowWriteFailure {
  const b = isRecord(body) ? body : {};
  const message = typeof b.error === "string" && b.error.trim() ? b.error : "That couldn't be saved. Please try again.";
  if (status === 409) {
    const snapshotId = typeof b.snapshotId === "string" ? b.snapshotId : null;
    const updatedAt = typeof b.updatedAt === "string" ? b.updatedAt : null;
    if (b.code === CASHFLOW_CONFLICT_CODES.STALE) {
      const cur = isRecord(b.current) ? b.current : null;
      return { kind: "STALE", message, snapshotId, updatedAt, current: cur ? { bankBalance: orNull(cur.bankBalance), cashInHand: orNull(cur.cashInHand) } : null };
    }
    if (b.code === CASHFLOW_CONFLICT_CODES.REPLACEMENT_CONFIRMATION_REQUIRED) return { kind: "CONFIRMATION_REQUIRED", message };
    if (b.code === CASHFLOW_CONFLICT_CODES.PERIOD_EXISTS) return { kind: "PERIOD_EXISTS", message, snapshotId, updatedAt };
  }
  return { kind: "OTHER", message };
}

/** `?edit=<id>` is honoured only for a well-formed id (anything else opens the normal page). */
export function parseEditParam(value: string | null | undefined): string | null {
  return value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value : null;
}

export function cashflowEditHrefFor(snapshotId: string, returnTo: boolean): string {
  return `/owner/cashflow?edit=${encodeURIComponent(snapshotId)}${returnTo ? "&returnTo=first-run" : ""}`;
}
