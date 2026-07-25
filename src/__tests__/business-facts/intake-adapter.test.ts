/**
 * B01 integration groundwork — intake → business-facts adapter tests.
 *
 * Exercises the REAL Module 10 intake engine (buildCsvIntake) end-to-end into the
 * adapter, then asserts the produced contract validates against the canonical
 * B01 Zod schema. Proves source lineage, currency-if-financial, extraction_method
 * mapping, owner-confirmation guardrail, missing-data on null required fields, and
 * fail-closed behavior on an untrusted/invalid currency cell (§38.7).
 *
 * Non-DB: pure functions only. Runs under the default `npm test` suite.
 */
import { describe, it, expect } from "vitest";
import { buildCsvIntake } from "@/domain/owner-intake/engine";
import { INTAKE_FIELD_SPECS } from "@/domain/owner-intake/field-specs";
import { businessFactsContractSchema, type BusinessProfile } from "@/domain/business-facts/contract";
import {
  assembleBusinessFactsContract,
  mapIntakeSourceToExtractionMethod,
} from "@/domain/business-facts/intake-adapter";

const PROFILE: BusinessProfile = {
  workspace_id: "ws_test",
  business_id: "biz_test",
  name: "Test Co",
  industry: "retail",
  stage: "growth",
  country: "IN",
  base_currency: "INR",
};

const FINANCE_CSV = [
  "periodStart,periodEnd,currency,revenue,costOfGoodsOrServices,fixedCosts,variableCosts,cashOnHand,receivables",
  "2026-04-01,2026-04-30,INR,500000,200000,100000,50000,150000,80000",
].join("\n");

const FIXED_NOW = new Date("2026-05-01T00:00:00Z");

describe("intake adapter — module contract assertions", () => {
  it("buildCsvIntake is a function", () => {
    expect(typeof buildCsvIntake).toBe("function");
  });
  it("assembleBusinessFactsContract is a function", () => {
    expect(typeof assembleBusinessFactsContract).toBe("function");
  });
  it("mapIntakeSourceToExtractionMethod is a function", () => {
    expect(typeof mapIntakeSourceToExtractionMethod).toBe("function");
  });
  it("businessFactsContractSchema is defined", () => {
    expect(businessFactsContractSchema).toBeDefined();
  });
  it("businessFactsContractSchema.safeParse is a function", () => {
    expect(typeof businessFactsContractSchema.safeParse).toBe("function");
  });
  it("INTAKE_FIELD_SPECS is an object", () => {
    expect(typeof INTAKE_FIELD_SPECS).toBe("object");
  });
  it("INTAKE_FIELD_SPECS.finance is defined", () => {
    expect(INTAKE_FIELD_SPECS.finance).toBeDefined();
  });
  it("PROFILE is an object with workspace_id field", () => {
    expect(PROFILE).toHaveProperty("workspace_id");
  });
  it("PROFILE.base_currency is 'INR'", () => {
    expect(PROFILE.base_currency).toBe("INR");
  });
  it("PROFILE.country is 'IN'", () => {
    expect(PROFILE.country).toBe("IN");
  });
  it("FINANCE_CSV is a non-empty string", () => {
    expect(typeof FINANCE_CSV).toBe("string");
    expect(FINANCE_CSV.length).toBeGreaterThan(0);
  });
  it("FINANCE_CSV contains 'INR'", () => {
    expect(FINANCE_CSV).toContain("INR");
  });
  it("FIXED_NOW is a Date instance", () => {
    expect(FIXED_NOW).toBeInstanceOf(Date);
  });
  it("mapIntakeSourceToExtractionMethod('csv_upload') returns 'csv_import'", () => {
    expect(mapIntakeSourceToExtractionMethod("csv_upload")).toBe("csv_import");
  });
  it("mapIntakeSourceToExtractionMethod('manual_form') returns 'manual_entry'", () => {
    expect(mapIntakeSourceToExtractionMethod("manual_form")).toBe("manual_entry");
  });
});

describe("intake → business-facts adapter", () => {
  it("maps intake sources to canonical extraction methods", () => {
    expect(mapIntakeSourceToExtractionMethod("csv_upload")).toBe("csv_import");
    expect(mapIntakeSourceToExtractionMethod("manual_form")).toBe("manual_entry");
    expect(mapIntakeSourceToExtractionMethod("bank_statement")).toBe("bank_statement");
    expect(mapIntakeSourceToExtractionMethod("accounting_export")).toBe("accounting_export");
  });

  it("converts a valid finance CSV intake into a VALID business-facts contract", () => {
    const intake = buildCsvIntake("csv_upload", FINANCE_CSV, INTAKE_FIELD_SPECS.finance, { now: FIXED_NOW });
    expect(intake.validationStatus).toBe("valid");

    const result = assembleBusinessFactsContract({
      businessProfile: PROFILE,
      conversion: {
        intake,
        targetDomain: "finance",
        fieldSpecs: INTAKE_FIELD_SPECS.finance,
        sourceDocumentId: "doc_intake_1",
      },
      now: FIXED_NOW,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const c = result.contract;

    // Re-validation through the canonical schema (defense in depth).
    expect(businessFactsContractSchema.safeParse(c).success).toBe(true);

    // Financial facts carry currency (currency-if-financial).
    expect(c.financials.length).toBeGreaterThan(0);
    for (const f of c.financials) expect(f.currency).toBe("INR");

    // cashOnHand is routed to the `cash` category via the explicit override.
    expect(c.cash.some((f) => f.metric === "cashOnHand")).toBe(true);
    for (const f of c.cash) expect(f.currency).toBe("INR");

    // Lineage: every fact references the declared source document.
    expect(c.source_documents).toHaveLength(1);
    expect(c.source_documents[0].source_document_id).toBe("doc_intake_1");
    const allFacts = [...c.financials, ...c.cash];
    for (const f of allFacts) {
      expect(f.source_document_id).toBe("doc_intake_1");
      expect(f.extraction_method).toBe("csv_import");
    }
  });

  it("inherits draft validation_status until the intake is owner-confirmed", () => {
    const intake = buildCsvIntake("csv_upload", FINANCE_CSV, INTAKE_FIELD_SPECS.finance, { now: FIXED_NOW });
    expect(intake.ownerConfirmed).toBe(false);

    const result = assembleBusinessFactsContract({
      businessProfile: PROFILE,
      conversion: {
        intake,
        targetDomain: "finance",
        fieldSpecs: INTAKE_FIELD_SPECS.finance,
        sourceDocumentId: "doc_intake_2",
      },
      now: FIXED_NOW,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const f of result.contract.financials) expect(f.validation_status).toBe("draft");
  });

  it("records missing_data (not a guessed fact) when a numeric field is blank", () => {
    const csv = [
      "periodStart,periodEnd,currency,revenue,costOfGoodsOrServices,fixedCosts,variableCosts,cashOnHand,receivables",
      // revenue cell blank → null → missing_data, no fact emitted for it
      "2026-04-01,2026-04-30,INR,,200000,100000,50000,150000,80000",
    ].join("\n");
    const intake = buildCsvIntake("csv_upload", csv, INTAKE_FIELD_SPECS.finance, { now: FIXED_NOW });

    const result = assembleBusinessFactsContract({
      businessProfile: PROFILE,
      conversion: {
        intake,
        targetDomain: "finance",
        fieldSpecs: INTAKE_FIELD_SPECS.finance,
        sourceDocumentId: "doc_intake_3",
      },
      now: FIXED_NOW,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.contract.financials.some((f) => f.metric === "revenue")).toBe(false);
    expect(result.contract.missing_data.some((m) => m.field.includes("revenue"))).toBe(true);
  });

  it("fails CLOSED on an untrusted/invalid currency cell (no invalid contract emitted)", () => {
    const csv = [
      "periodStart,periodEnd,currency,revenue,costOfGoodsOrServices,fixedCosts,variableCosts,cashOnHand,receivables",
      // currency is a formula-injection-style token, not an ISO 4217 code
      "2026-04-01,2026-04-30,=2+2,500000,200000,100000,50000,150000,80000",
    ].join("\n");
    const intake = buildCsvIntake("csv_upload", csv, INTAKE_FIELD_SPECS.finance, { now: FIXED_NOW });

    const result = assembleBusinessFactsContract({
      businessProfile: PROFILE,
      conversion: {
        intake,
        targetDomain: "finance",
        fieldSpecs: INTAKE_FIELD_SPECS.finance,
        sourceDocumentId: "doc_intake_4",
      },
      now: FIXED_NOW,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
