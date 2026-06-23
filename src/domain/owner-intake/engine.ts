/**
 * Owner Connectors & Data Intake (Module 10) — deterministic intake engine.
 *
 * Pure functions only (no DB/I/O/LLM). Maps a raw upload to a normalized, validated
 * candidate against a target field spec, with an explicit owner-readable error
 * report. Nothing is invented: an unparseable value becomes `null` + an error, not
 * a guessed number. The result is a CANDIDATE — `ownerConfirmed` is always false;
 * connector data must be confirmed before it can feed a diagnosis (execution.md §17).
 */
import { parseCsv } from "./csv";
import { GST_BASIS_VALUES } from "./field-specs";
import type {
  IntakeSource,
  IntakeFieldSpec,
  IntakeFieldError,
  IntakeResult,
  IntakeValidationStatus,
  NormalizedRecord,
} from "./types";

const GST_CURRENCY_FIELDS = ["revenue", "costOfGoodsOrServices", "fixedCosts", "variableCosts", "cashOnHand", "receivables"] as const;

/** Canonical key for matching a header to a field name (case/space/punct-insensitive). */
function canon(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Parse a numeric cell: strip thousands separators, currency symbols, and spaces. */
export function parseNumber(raw: string): number | null {
  if (raw === undefined || raw === null) return null;
  const cleaned = raw.replace(/[,\s]/g, "").replace(/^[^0-9+\-.]+/, "").replace(/[^0-9+\-.eE]+$/, "");
  if (cleaned === "" || cleaned === "+" || cleaned === "-" || cleaned === ".") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Parse a date cell to an ISO `YYYY-MM-DD` string, or null when invalid. */
export function parseDate(raw: string): string | null {
  if (!raw || raw.trim() === "") return null;
  const t = new Date(raw.trim());
  if (Number.isNaN(t.getTime())) return null;
  return t.toISOString().slice(0, 10);
}

/**
 * Build a deterministic intake candidate from CSV text against a field spec.
 * - `mappedFields`: canonical fields matched to an upload column.
 * - `unmappedColumns`: upload columns not in the spec (reported, not used).
 * - `records`: one normalized record per data row (missing/invalid → null).
 * - `errorReport`: field-level errors (missing required, invalid number/date,
 *   negative where non-negative is required).
 * - `validationStatus`: invalid if any row breaks a required field; partial if any
 *   non-required field is present-but-invalid; else valid.
 */
export function buildCsvIntake(
  source: IntakeSource,
  csvText: string,
  fieldSpecs: IntakeFieldSpec[],
  opts: { now?: Date } = {}
): IntakeResult {
  const now = opts.now ?? new Date();
  const { headers, rows } = parseCsv(csvText);

  // Map each spec field to a column index by canonical header name.
  const headerCanon = headers.map(canon);
  const fieldToCol = new Map<string, number>();
  for (const f of fieldSpecs) {
    const idx = headerCanon.indexOf(canon(f.name));
    if (idx >= 0) fieldToCol.set(f.name, idx);
  }
  const mappedFields = fieldSpecs.filter((f) => fieldToCol.has(f.name)).map((f) => f.name);
  const specCanon = new Set(fieldSpecs.map((f) => canon(f.name)));
  const unmappedColumns = headers.filter((h) => !specCanon.has(canon(h)));

  const errorReport: IntakeFieldError[] = [];
  const records: NormalizedRecord[] = [];
  let anyRequiredBroken = false;
  let anyOptionalInvalid = false;

  rows.forEach((cells, r) => {
    const rowNum = r + 1; // 1-based data row
    const record: NormalizedRecord = {};
    for (const f of fieldSpecs) {
      const col = fieldToCol.get(f.name);
      const raw = col !== undefined ? (cells[col] ?? "") : "";
      const present = raw.trim() !== "";

      if (!present) {
        record[f.name] = null;
        if (f.required) {
          anyRequiredBroken = true;
          errorReport.push({ row: rowNum, field: f.name, code: "missing_required", message: `Required field "${f.name}" is missing.` });
        }
        continue;
      }

      if (f.type === "number" || f.type === "currency") {
        const n = parseNumber(raw);
        if (n === null) {
          record[f.name] = null;
          if (f.required) anyRequiredBroken = true; else anyOptionalInvalid = true;
          errorReport.push({ row: rowNum, field: f.name, code: "invalid_number", message: `"${raw}" is not a valid number for "${f.name}".` });
        } else if (f.nonNegative && n < 0) {
          record[f.name] = null;
          if (f.required) anyRequiredBroken = true; else anyOptionalInvalid = true;
          errorReport.push({ row: rowNum, field: f.name, code: "negative_value", message: `"${f.name}" cannot be negative (got ${n}).` });
        } else {
          record[f.name] = n;
          if (f.type === "currency" && n > 0 && n < 1000) {
            errorReport.push({ row: rowNum, field: f.name, code: "soft_limit_warning", message: `"${f.name}" value ${n} seems very low — confirm it is in full currency units, not thousands.` });
          } else if (f.type === "currency" && n > 100_000_000) {
            errorReport.push({ row: rowNum, field: f.name, code: "soft_limit_warning", message: `"${f.name}" value ${n} seems very high — confirm it is correct.` });
          }
        }
      } else if (f.type === "date") {
        const d = parseDate(raw);
        if (d === null) {
          record[f.name] = null;
          if (f.required) anyRequiredBroken = true; else anyOptionalInvalid = true;
          errorReport.push({ row: rowNum, field: f.name, code: "invalid_date", message: `"${raw}" is not a valid date for "${f.name}".` });
        } else {
          record[f.name] = d;
        }
      } else {
        record[f.name] = raw;
      }
    }
    records.push(record);
  });

  // Required fields whose column is entirely absent from the upload break every row.
  for (const f of fieldSpecs) {
    if (f.required && !fieldToCol.has(f.name) && rows.length > 0) {
      anyRequiredBroken = true;
    }
  }

  // GST normalisation: if the spec includes gstBasis and any row provides it,
  // validate the value and divide all finance currency fields by 1.1 for inclusive rows.
  const hasGstBasisField = fieldSpecs.some((f) => f.name === "gstBasis");
  if (hasGstBasisField) {
    records.forEach((record, r) => {
      const rawBasis = record["gstBasis"];
      if (rawBasis === null || rawBasis === undefined) {
        // gstBasis absent — emit advisory warning only (non-blocking)
        errorReport.push({
          row: r + 1,
          field: "gstBasis",
          code: "gst_basis_unknown",
          message: `GST basis not specified. If revenue figures are GST-inclusive, set gstBasis to "inclusive" so figures are normalised to ex-GST.`,
        });
        anyOptionalInvalid = true;
        return;
      }
      const basis = String(rawBasis).trim().toLowerCase();
      if (!GST_BASIS_VALUES.includes(basis as typeof GST_BASIS_VALUES[number])) {
        errorReport.push({
          row: r + 1,
          field: "gstBasis",
          code: "gst_basis_unknown",
          message: `"${rawBasis}" is not a valid GST basis. Use "inclusive" or "exclusive".`,
        });
        anyOptionalInvalid = true;
        return;
      }
      if (basis === "inclusive") {
        for (const field of GST_CURRENCY_FIELDS) {
          const v = record[field];
          if (typeof v === "number") {
            record[field] = Math.round((v / 1.1) * 100) / 100;
          }
        }
        // Record the normalised basis so downstream readers know the values are ex-GST.
        record["gstBasis"] = "exclusive_normalised";
      }
    });
  }

  // Cross-field consistency checks for finance domain data.
  // These detect likely data-entry errors (wrong units, GST not removed, etc.)
  // before data is confirmed and stored. Inconsistencies are flagged as warnings
  // (non-blocking) so the owner can investigate rather than being hard-rejected.
  const hasFinanceCrossFields =
    fieldSpecs.some((f) => f.name === "revenue") &&
    fieldSpecs.some((f) => f.name === "costOfGoodsOrServices");
  if (hasFinanceCrossFields) {
    records.forEach((record, r) => {
      const revenue = typeof record["revenue"] === "number" ? record["revenue"] : null;
      const cogs = typeof record["costOfGoodsOrServices"] === "number" ? record["costOfGoodsOrServices"] : null;
      const fixedCosts = typeof record["fixedCosts"] === "number" ? record["fixedCosts"] : null;
      const variableCosts = typeof record["variableCosts"] === "number" ? record["variableCosts"] : null;
      const receivables = typeof record["receivables"] === "number" ? record["receivables"] : null;

      if (revenue !== null && revenue > 0) {
        // COGS > 3× revenue almost certainly indicates wrong units or GST-inclusive data
        if (cogs !== null && cogs > revenue * 3) {
          errorReport.push({
            row: r + 1,
            field: "costOfGoodsOrServices",
            code: "inconsistent_data",
            message: `costOfGoodsOrServices (${cogs}) is more than 3× revenue (${revenue}). Check for unit errors or GST-inclusive figures.`,
          });
          anyOptionalInvalid = true;
        }
        // Total operating costs > 5× revenue indicates wrong units or scale mismatch
        if (fixedCosts !== null && variableCosts !== null && fixedCosts + variableCosts > revenue * 5) {
          errorReport.push({
            row: r + 1,
            field: "fixedCosts",
            code: "inconsistent_data",
            message: `Combined fixedCosts + variableCosts (${fixedCosts + variableCosts}) is more than 5× revenue (${revenue}). Check for unit errors or scale mismatch.`,
          });
          anyOptionalInvalid = true;
        }
        // Receivables > 2× annual revenue indicates wrong period or unit error
        if (receivables !== null && receivables > revenue * 2) {
          errorReport.push({
            row: r + 1,
            field: "receivables",
            code: "inconsistent_data",
            message: `receivables (${receivables}) is more than 2× revenue (${revenue}). Verify the period and check for unit errors.`,
          });
          anyOptionalInvalid = true;
        }
      }
    });
  }

  const validationStatus: IntakeValidationStatus =
    rows.length === 0 ? "invalid" : anyRequiredBroken ? "invalid" : anyOptionalInvalid ? "partial" : "valid";

  // A candidate is "normalized" when at least one row produced usable records and
  // required fields held (valid or partial); a fully invalid upload is not normalized.
  const normalizationStatus = validationStatus === "invalid" ? "not_normalized" : "normalized";

  return {
    source,
    generatedAt: now,
    rowCount: rows.length,
    mappedFields,
    unmappedColumns,
    records,
    validationStatus,
    normalizationStatus,
    errorReport,
    ownerConfirmed: false,
  };
}
