/**
 * The fields the first-run "Something here is wrong" form offers, and how a draft becomes an amendment.
 *
 * The four quick-entry figures are always offered. When the server's Improve answer says the evidence being edited lives
 * on other Finance figures (payroll, rent, utilities, debt…), those are offered too — the form never offers a field the
 * canonical amendment (`financialSnapshotAmendSchema`) does not accept, and every field shows what is recorded NOW.
 * Blank = leave as is; 0 = a real zero; "I don't know this figure" returns a recorded figure to UNKNOWN (sent as null — never as
 * 0, and never by silently restoring the earlier number). Pure.
 */
import { QUICK_ENTRY_FIELDS, parseQuickAmount } from "@/domain/owner-finance/quick-entry";

export interface CorrectionField {
  name: string;
  label: string;
  /** Present for the four quick-entry fields. */
  hint?: string;
}

export function correctionFields(extra: readonly { name: string; label: string }[] = []): CorrectionField[] {
  const base: CorrectionField[] = QUICK_ENTRY_FIELDS.map((f) => ({ name: f.name, label: f.label, hint: f.hint }));
  const have = new Set(base.map((f) => f.name));
  return [...base, ...extra.filter((f) => !have.has(f.name)).map((f) => ({ name: f.name, label: f.label }))];
}

export interface CorrectionAssessment {
  errors: Record<string, string>;
  /** Known numeric values only (blank fields absent). */
  values: Record<string, number>;
  /** Fields whose entered value equals what is already recorded. */
  sameAsRecorded: string[];
  /** Fields the owner marked "I don't know" that currently hold a recorded figure: they go back to UNKNOWN. */
  clears: string[];
}

export function assessCorrectionDraft(
  draft: Readonly<Record<string, string | undefined>>,
  fields: readonly CorrectionField[],
  recorded: Readonly<Record<string, number | null | undefined>> = {},
  unknown: Readonly<Record<string, boolean | undefined>> = {}
): CorrectionAssessment {
  const errors: Record<string, string> = {};
  const values: Record<string, number> = {};
  const sameAsRecorded: string[] = [];
  const clears: string[] = [];
  for (const f of fields) {
    // "I don't know" wins over whatever is typed, and is only meaningful for a figure that is recorded now.
    if (unknown[f.name]) {
      if (recorded[f.name] !== null) clears.push(f.name);
      continue;
    }
    const parsed = parseQuickAmount(draft[f.name]);
    if (parsed.kind === "invalid") errors[f.name] = parsed.message;
    else if (parsed.kind === "value") {
      values[f.name] = parsed.value;
      if (recorded[f.name] === parsed.value) sameAsRecorded.push(f.name);
    }
  }
  return { errors, values, sameAsRecorded, clears };
}

/** The amend fields for an assessed draft: known numbers set, cleared figures null. */
export function correctionAmendFields(a: Pick<CorrectionAssessment, "values" | "clears">): Record<string, number | null> {
  return { ...a.values, ...Object.fromEntries(a.clears.map((k) => [k, null])) };
}
