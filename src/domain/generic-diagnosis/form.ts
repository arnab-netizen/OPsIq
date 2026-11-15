/**
 * Parsing of the optional figures typed into the /diagnosis form (pure).
 *
 * Blank = not known (the field is omitted from the request, never sent as 0).
 * "0" = reported as zero. Correctly grouped thousands separators are accepted ("200,000").
 * Anything else that is not a plain non-negative number is rejected with a message instead of
 * being silently coerced (no parseFloat("12abc") → 12, no "1,5" → 15, no NaN → null).
 */

export type ParsedFigure = { ok: true; value: number | undefined } | { ok: false; message: string };

export function parseOptionalFigure(raw: unknown, label: string, opts: { integer?: boolean } = {}): ParsedFigure {
  if (raw === null || raw === undefined) return { ok: true, value: undefined };
  const trimmed = String(raw).trim();
  if (trimmed === "") return { ok: true, value: undefined };
  const text = /^\d{1,3}(,\d{3})+(\.\d+)?$/.test(trimmed) ? trimmed.replace(/,/g, "") : trimmed;
  if (!/^\d+(\.\d+)?$/.test(text)) {
    return { ok: false, message: `${label}: enter a plain number (no currency symbols or minus signs), or leave it blank if you don't know it.` };
  }
  const value = Number(text);
  if (!Number.isFinite(value)) return { ok: false, message: `${label}: enter a plain number.` };
  if (opts.integer && !Number.isInteger(value)) return { ok: false, message: `${label}: enter a whole number.` };
  return { ok: true, value };
}
