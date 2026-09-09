/**
 * A raw ISO timestamp or ambiguous numeric date (e.g. "9/8/2026") reads as a technical artifact,
 * not information, to a low-digital-literacy owner. This is the single place every owner-facing
 * date should be formatted from, so the wording stays consistent app-wide.
 */

const DATE_FORMAT: Intl.DateTimeFormatOptions = { year: "numeric", month: "short", day: "numeric" };
const DATE_TIME_FORMAT: Intl.DateTimeFormatOptions = { ...DATE_FORMAT, hour: "numeric", minute: "2-digit" };

function toDate(value: Date | string | number): Date | null {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "Sep 8, 2026" — never a raw ISO string, never an ambiguous MM/DD vs DD/MM numeric date. */
export function formatHumanDate(value: Date | string | number | null | undefined): string {
  if (value === null || value === undefined) return "Not recorded yet";
  const d = toDate(value);
  return d ? d.toLocaleDateString("en-US", DATE_FORMAT) : "Not recorded yet";
}

/** "Sep 8, 2026, 3:45 PM" — for events where the time of day is meaningful, not just the date. */
export function formatHumanDateTime(value: Date | string | number | null | undefined): string {
  if (value === null || value === undefined) return "Not recorded yet";
  const d = toDate(value);
  return d ? d.toLocaleString("en-US", DATE_TIME_FORMAT) : "Not recorded yet";
}
