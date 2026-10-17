/**
 * Owner Finance — how a failed snapshot save is worded for the owner (pure).
 *
 * The server validates every write and answers a rejected one with a status, a short owner-safe `error`, and per-field
 * `{path, message}` issues (canonical-route-enforcement.ts). This module turns that into what the form shows: a form-level
 * line plus a message under each offending field, with the field to focus. Server-side validation is untouched; this only
 * stops a correct rejection from being flattened into "try saving again".
 *
 * Safety: a field message is shown only when it is one the validators author for owners (the part-of-whole contradictions,
 * the date messages) or when it is rebuilt here from the field's plain label. Anything else — an unknown path, an internal
 * schema phrase, a 5xx body — never reaches the owner; it falls back to a calm generic line.
 */
import { financeField, FINANCE_FIELDS } from "./snapshot-fields";
import { FINANCE_CONFLICT_CODES, FINANCE_PERIOD_EXISTS_OWNER_MESSAGE, FINANCE_SUPERSEDED_OWNER_MESSAGE } from "./snapshot-conflict";

export type SnapshotFormErrorKind = "VALIDATION" | "PERIOD_EXISTS" | "STALE" | "PERMISSION" | "SESSION" | "SERVER" | "OTHER";

export interface SnapshotFormError {
  kind: SnapshotFormErrorKind;
  /** Form-level line, always owner-safe. */
  message: string;
  /** Owner-safe message per form field name (the field the server pointed at). */
  fieldMessages: Record<string, string>;
  /** The first offending field, in form order — the one to focus. */
  focusField: string | null;
  /** Only a genuinely transient failure invites "try again"; a rejected figure never does. */
  retryable: boolean;
  /** PERIOD_EXISTS: the snapshot that already covers the period, so the form can offer to update it. */
  existingSnapshotId: string | null;
}

const PERIOD_FIELDS = ["periodStart", "periodEnd"] as const;
const PERIOD_FIELD_LABEL: Record<string, string> = { periodStart: "The start of the period", periodEnd: "The end of the period" };

/** Order in which fields appear on the form (period first), so "first offending field" is the topmost one. */
const FORM_ORDER: readonly string[] = [...PERIOD_FIELDS, "evidenceQuality", "businessModel", ...FINANCE_FIELDS.map((f) => f.name)];

function labelOf(path: string): string | null {
  if (PERIOD_FIELD_LABEL[path]) return PERIOD_FIELD_LABEL[path];
  try {
    return financeField(path).label;
  } catch {
    return null;
  }
}

/** Messages the validators write for owners (domain/owner-finance/validation.ts) — safe to show as written. */
const AUTHORED_OWNER_MESSAGE = [
  /cannot be more than/,
  /is less than the .+ you entered/,
  /^Reporting period (start|end) /,
  /^Reporting period must be valid dates$/,
  /mark it as not known/,
];

function ownerFieldMessage(path: string, serverMessage: string): string | null {
  const label = labelOf(path);
  if (!label) return null; // an unknown / internal path is never echoed
  if (path === "periodEnd" && /on or after/i.test(serverMessage)) return "The end of the period can't be before its start. Check both dates.";
  if (AUTHORED_OWNER_MESSAGE.some((re) => re.test(serverMessage))) return serverMessage;
  if (/negative/i.test(serverMessage)) return `${label} can't be negative. Enter 0 if there was none, or leave it blank if you don't know.`;
  if (/too large/i.test(serverMessage)) return `${label} is too large to be a real figure. Check for an extra digit.`;
  if (/expected number|not a number|invalid input/i.test(serverMessage)) return `${label} needs to be a number.`;
  return `Check ${label.charAt(0).toLowerCase()}${label.slice(1)}.`;
}

interface ErrorLike {
  status?: number;
  message?: string;
  fieldErrors?: Array<{ path: string; message: string }>;
  responseBody?: unknown;
}

const asRecord = (v: unknown): Record<string, unknown> => (typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {});

export function presentSnapshotFormError(err: unknown, mode: "create" | "amend"): SnapshotFormError {
  const e = (typeof err === "object" && err !== null ? err : {}) as ErrorLike;
  const status = typeof e.status === "number" ? e.status : null;
  const body = asRecord(e.responseBody);
  const code = typeof body.code === "string" ? body.code : null;
  const base: SnapshotFormError = { kind: "OTHER", message: "", fieldMessages: {}, focusField: null, retryable: false, existingSnapshotId: null };

  if (status === 409) {
    const snapshotId = typeof body.snapshotId === "string" ? body.snapshotId : null;
    if (mode === "create" && (code === FINANCE_CONFLICT_CODES.PERIOD_EXISTS || code === null)) {
      return { ...base, kind: "PERIOD_EXISTS", message: FINANCE_PERIOD_EXISTS_OWNER_MESSAGE, existingSnapshotId: snapshotId };
    }
    return { ...base, kind: "STALE", message: FINANCE_SUPERSEDED_OWNER_MESSAGE };
  }

  if (status === 400 || status === 422) {
    const fieldMessages: Record<string, string> = {};
    for (const fe of Array.isArray(e.fieldErrors) ? e.fieldErrors : []) {
      if (typeof fe?.path !== "string" || typeof fe?.message !== "string") continue;
      if (fe.path in fieldMessages) continue;
      const m = ownerFieldMessage(fe.path, fe.message);
      if (m) fieldMessages[fe.path] = m;
    }
    const fields = Object.keys(fieldMessages).sort((a, b) => FORM_ORDER.indexOf(a) - FORM_ORDER.indexOf(b));
    if (fields.length > 0) {
      return {
        ...base,
        kind: "VALIDATION",
        message: `Nothing was saved. ${fields.length === 1 ? "One entry needs correcting" : "Some entries need correcting"} — correct ${fields.length === 1 ? "it" : "them"} below. Your entries are still here.`,
        fieldMessages,
        focusField: fields[0],
      };
    }
    return {
      ...base,
      kind: "VALIDATION",
      message: "Nothing was saved. Some of these figures weren't accepted — check the dates and amounts for a mistake (for example a part that is larger than its total), then save again. Your entries are still here.",
    };
  }

  if (status === 401) return { ...base, kind: "SESSION", message: "Your session has expired. Sign in again — your entries are still here." };
  if (status === 403) return { ...base, kind: "PERMISSION", message: "You don't have permission to change these figures. Ask your workspace admin for access." };
  if (status !== null && status >= 500) {
    return { ...base, kind: "SERVER", message: "We couldn't save this snapshot right now. Nothing was saved and your entries are still here. Try again in a moment.", retryable: true };
  }
  // No response at all (connectivity) or an unrecognised failure: calm, specific about the state of the data, no internals.
  return { ...base, kind: "OTHER", message: "We couldn't save this snapshot. Nothing was saved and your entries are still here. Check your connection and try again.", retryable: true };
}
