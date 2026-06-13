/**
 * Owner Connectors & Data Intake (Module 10 Slice 1) — deterministic intake engine
 * tests. Pure/no DB. Covers CSV parsing (quotes, escaped quotes, embedded commas),
 * field-spec mapping, number/currency/date normalization, validation statuses
 * (valid / partial / invalid), the error report (missing required / invalid number
 * / negative / invalid date), unmapped columns, owner-confirmation default, and
 * blank-input handling.
 */
import { describe, it, expect } from "vitest";
import {
  buildCsvIntake,
  parseCsv,
  parseNumber,
  parseDate,
  type IntakeFieldSpec,
} from "@/domain/owner-intake";

const NOW = new Date("2026-06-05T00:00:00.000Z");

const spec: IntakeFieldSpec[] = [
  { name: "periodStart", type: "date", required: true },
  { name: "periodEnd", type: "date", required: true },
  { name: "currency", type: "string", required: true },
  { name: "revenue", type: "currency", required: true, nonNegative: true },
  { name: "fixedCosts", type: "number", nonNegative: true },
];

const VALID_CSV = [
  "Period Start,Period End,Currency,Revenue,Fixed Costs,Extra",
  '2026-05-01,2026-05-31,INR,"1,200.50",400,hello',
].join("\n");

describe("intake CSV parser", () => {
  it("parses headers + rows and trims cells", () => {
    const p = parseCsv("a, b ,c\n1,2,3\n");
    expect(p.headers).toEqual(["a", "b", "c"]);
    expect(p.rows).toEqual([["1", "2", "3"]]);
  });

  it("honours quoted fields with embedded commas and escaped quotes", () => {
    const p = parseCsv('name,note\n"Doe, John","She said ""hi"""\n');
    expect(p.rows[0]).toEqual(["Doe, John", 'She said "hi"']);
  });

  it("skips empty lines and a trailing newline", () => {
    const p = parseCsv("h\n\n1\n\n");
    expect(p.headers).toEqual(["h"]);
    expect(p.rows).toEqual([["1"]]);
  });

  it("returns empty for blank input (never invents)", () => {
    expect(parseCsv("")).toEqual({ headers: [], rows: [] });
    expect(parseCsv("   ")).toEqual({ headers: [], rows: [] });
  });
});

describe("intake value normalization", () => {
  it("parses numbers stripping thousands separators + currency symbols", () => {
    expect(parseNumber("1,200.50")).toBe(1200.5);
    expect(parseNumber("₹1,000")).toBe(1000);
    expect(parseNumber("-5")).toBe(-5);
    expect(parseNumber("abc")).toBeNull();
    expect(parseNumber("")).toBeNull();
  });

  it("parses dates to ISO or null", () => {
    expect(parseDate("2026-05-01")).toBe("2026-05-01");
    expect(parseDate("not a date")).toBeNull();
    expect(parseDate("")).toBeNull();
  });
});

describe("intake engine — valid upload", () => {
  it("normalizes a valid CSV against the field spec", () => {
    const r = buildCsvIntake("csv_upload", VALID_CSV, spec, { now: NOW });
    expect(r.source).toBe("csv_upload");
    expect(r.rowCount).toBe(1);
    expect(r.validationStatus).toBe("valid");
    expect(r.normalizationStatus).toBe("normalized");
    expect(r.errorReport).toEqual([]);
    expect(r.ownerConfirmed).toBe(false); // never auto-confirms
    expect(r.records[0]).toMatchObject({
      periodStart: "2026-05-01",
      periodEnd: "2026-05-31",
      currency: "INR",
      revenue: 1200.5,
      fixedCosts: 400,
    });
  });

  it("maps spec fields and reports unmapped columns", () => {
    const r = buildCsvIntake("csv_upload", VALID_CSV, spec, { now: NOW });
    expect(r.mappedFields).toEqual(["periodStart", "periodEnd", "currency", "revenue", "fixedCosts"]);
    expect(r.unmappedColumns).toEqual(["Extra"]);
  });
});

describe("intake engine — validation + error report", () => {
  it("is invalid when a required value is not a number", () => {
    const csv = "Period Start,Period End,Currency,Revenue\n2026-05-01,2026-05-31,INR,oops";
    const r = buildCsvIntake("csv_upload", csv, spec, { now: NOW });
    expect(r.validationStatus).toBe("invalid");
    expect(r.normalizationStatus).toBe("not_normalized");
    expect(r.errorReport.some((e) => e.field === "revenue" && e.code === "invalid_number")).toBe(true);
    expect(r.records[0].revenue).toBeNull();
  });

  it("rejects a negative value on a non-negative field", () => {
    const csv = "Period Start,Period End,Currency,Revenue\n2026-05-01,2026-05-31,INR,-100";
    const r = buildCsvIntake("csv_upload", csv, spec, { now: NOW });
    expect(r.validationStatus).toBe("invalid"); // revenue is required + nonNegative
    expect(r.errorReport.some((e) => e.field === "revenue" && e.code === "negative_value")).toBe(true);
    expect(r.records[0].revenue).toBeNull();
  });

  it("is invalid when a required column is entirely missing", () => {
    const csv = "Period Start,Period End,Revenue\n2026-05-01,2026-05-31,1000"; // no Currency
    const r = buildCsvIntake("csv_upload", csv, spec, { now: NOW });
    expect(r.validationStatus).toBe("invalid");
    expect(r.errorReport.some((e) => e.field === "currency" && e.code === "missing_required")).toBe(true);
  });

  it("is partial when only an optional field is invalid (required all valid)", () => {
    const csv = "Period Start,Period End,Currency,Revenue,Fixed Costs\n2026-05-01,2026-05-31,INR,1000,oops";
    const r = buildCsvIntake("csv_upload", csv, spec, { now: NOW });
    expect(r.validationStatus).toBe("partial");
    expect(r.normalizationStatus).toBe("normalized"); // required held → still a usable candidate
    expect(r.errorReport.some((e) => e.field === "fixedCosts" && e.code === "invalid_number")).toBe(true);
    expect(r.records[0].fixedCosts).toBeNull();
    expect(r.records[0].revenue).toBe(1000);
  });

  it("a blank upload is invalid + not normalized with no records", () => {
    const r = buildCsvIntake("csv_upload", "", spec, { now: NOW });
    expect(r.rowCount).toBe(0);
    expect(r.validationStatus).toBe("invalid");
    expect(r.normalizationStatus).toBe("not_normalized");
    expect(r.records).toEqual([]);
  });

  it("is deterministic (same input → identical result bar generatedAt)", () => {
    const a = buildCsvIntake("csv_upload", VALID_CSV, spec, { now: NOW });
    const b = buildCsvIntake("csv_upload", VALID_CSV, spec, { now: NOW });
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });
});
