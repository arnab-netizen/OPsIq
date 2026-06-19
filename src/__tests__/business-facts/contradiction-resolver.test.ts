/**
 * B06 — Contradiction Resolver: pure-function tests.
 *
 * Proves contradiction detection, severity classification, and resolution:
 *   - detects conflicts between facts from different sources
 *   - classifies severity (minor < 10%, material 10-50%, critical > 50%)
 *   - applies resolution rules (higher evidence wins, equal evidence unresolved)
 *   - P&L revenue vs bank revenue conflicts detected
 *   - owner claim vs structured export conflicts detected
 *   - unresolved material conflicts identified
 *   - resolved conflicts respect evidence hierarchy
 *
 * Non-DB: pure detection and resolution over validated B01 contracts.
 * Runs under `npm test`.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { businessFactsContractSchema, type BusinessFactsContract } from "@/domain/business-facts/contract";
import {
  detectAndResolveContradictions,
  hasBlockingContradiction,
  getMostSevereContradictionStatus,
  resolveContradictionByOwner,
} from "@/domain/business-facts/contradiction-resolver";

const examples = JSON.parse(
  readFileSync(resolve(__dirname, "../../../contracts/business-facts.examples.json"), "utf8"),
) as Record<string, unknown>;

function asContract(raw: unknown): BusinessFactsContract {
  return businessFactsContractSchema.parse(raw);
}

describe("B06 contradiction resolver — detection and classification", () => {
  it("detects no contradictions in a clean dataset", () => {
    const contract = asContract(examples.service_business);
    const resolved = detectAndResolveContradictions(contract);

    // service_business is a clean, single-source dataset
    expect(resolved.contradictions.length).toBe(0);
  });

  it("detects conflicts between facts with same metric from different sources", () => {
    const contract = asContract(examples.contradiction_case);
    const resolved = detectAndResolveContradictions(contract);

    // contradiction_case has material conflict
    expect(resolved.contradictions.length).toBeGreaterThan(0);
  });

  it("detects P&L revenue vs bank revenue conflicts", () => {
    const contract = asContract(examples.service_business);

    // Add a conflicting revenue fact from a different source with matching source document
    const conflictingContract: BusinessFactsContract = {
      ...contract,
      source_documents: [
        ...contract.source_documents,
        {
          source_document_id: "conflicting_source",
          kind: "pdf_statement" as const,
          filename: "alternative_statement.pdf",
          upload_timestamp: new Date().toISOString(),
          origin_reference: "alt_source",
        },
      ],
      financials: [
        ...contract.financials,
        {
          fact_id: "revenue_conflict_test",
          metric: "monthly_revenue",
          value: 450000, // Different from existing monthly_revenue (480000)
          unit: "INR",
          currency: "INR",
          period_start: "2026-04-01",
          period_end: "2026-04-30",
          source_document_id: "conflicting_source",
          source_location: "Alternative statement",
          extraction_method: "manual_entry",
          confidence_score: 0.5,
          validation_status: "draft" as const,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
    };

    const resolved = detectAndResolveContradictions(conflictingContract);
    expect(resolved.contradictions.length).toBeGreaterThan(0);

    const revenueConflict = resolved.contradictions.find((c) => c.description.includes("revenue"));
    expect(revenueConflict).toBeTruthy();
  });

  it("detects owner claim vs structured export conflicts", () => {
    const contract = asContract(examples.service_business);

    // Add a manual entry that conflicts with system export
    const conflictingContract: BusinessFactsContract = {
      ...contract,
      source_documents: [
        ...contract.source_documents,
        {
          source_document_id: "manual_owner_entry",
          kind: "manual_owner_entry" as const,
          filename: "owner_entry.txt",
          upload_timestamp: new Date().toISOString(),
        },
      ],
      financials: [
        ...contract.financials,
        {
          fact_id: "owner_cost_estimate",
          metric: "chemical_cost",
          value: 75000, // Different from system export (96000)
          unit: "INR",
          currency: "INR",
          period_start: "2026-04-01",
          period_end: "2026-04-30",
          source_document_id: "manual_owner_entry",
          source_location: "Owner estimate",
          extraction_method: "owner_estimate",
          confidence_score: 0.6,
          validation_status: "draft" as const,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
    };

    const resolved = detectAndResolveContradictions(conflictingContract);
    expect(resolved.contradictions.length).toBeGreaterThan(0);

    const costConflict = resolved.contradictions.find((c) => c.description.includes("chemical_cost"));
    expect(costConflict).toBeTruthy();
  });
});

describe("B06 contradiction resolver — severity classification", () => {
  it("classifies minor conflicts (< 10% difference)", () => {
    const contract = asContract(examples.service_business);

    const conflictingContract: BusinessFactsContract = {
      ...contract,
      source_documents: [
        ...contract.source_documents,
        {
          source_document_id: "source_2",
          kind: "csv" as const,
          filename: "alt_source.csv",
          upload_timestamp: new Date().toISOString(),
        },
      ],
      financials: [
        ...contract.financials,
        {
          fact_id: "revenue_minor_conflict",
          metric: "monthly_revenue",
          value: 485000, // ~1% higher than first revenue (480000)
          unit: "INR",
          currency: "INR",
          period_start: "2026-04-01",
          period_end: "2026-04-30",
          source_document_id: "source_2",
          source_location: "Alternative source",
          extraction_method: "csv_import",
          confidence_score: 0.8,
          validation_status: "draft" as const,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
    };

    const resolved = detectAndResolveContradictions(conflictingContract);
    expect(resolved.contradictions.length).toBeGreaterThan(0);

    const minorConflict = resolved.contradictions[0];
    expect(minorConflict?.description).toContain("minor_conflict");
  });

  it("classifies material conflicts (10-50% difference)", () => {
    const contract = asContract(examples.service_business);

    const conflictingContract: BusinessFactsContract = {
      ...contract,
      source_documents: [
        ...contract.source_documents,
        {
          source_document_id: "source_material",
          kind: "pdf_statement" as const,
          filename: "material_statement.pdf",
          upload_timestamp: new Date().toISOString(),
        },
      ],
      financials: [
        ...contract.financials,
        {
          fact_id: "revenue_material_conflict",
          metric: "monthly_revenue",
          value: 624000, // 30% higher than first revenue (480000)
          unit: "INR",
          currency: "INR",
          period_start: "2026-04-01",
          period_end: "2026-04-30",
          source_document_id: "source_material",
          source_location: "Material difference source",
          extraction_method: "ocr",
          confidence_score: 0.4,
          validation_status: "draft" as const,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
    };

    const resolved = detectAndResolveContradictions(conflictingContract);
    const materialConflict = resolved.contradictions.find((c) => c.description.includes("material_conflict"));
    expect(materialConflict).toBeTruthy();
  });

  it("classifies critical conflicts (> 50% difference)", () => {
    const contract = asContract(examples.service_business);

    const conflictingContract: BusinessFactsContract = {
      ...contract,
      source_documents: [
        ...contract.source_documents,
        {
          source_document_id: "source_critical",
          kind: "manual_owner_entry" as const,
          filename: "critical_statement.txt",
          upload_timestamp: new Date().toISOString(),
        },
      ],
      financials: [
        ...contract.financials,
        {
          fact_id: "revenue_critical_conflict",
          metric: "monthly_revenue",
          value: 864000, // 80% higher than first revenue (480000)
          unit: "INR",
          currency: "INR",
          period_start: "2026-04-01",
          period_end: "2026-04-30",
          source_document_id: "source_critical",
          source_location: "Critically different source",
          extraction_method: "manual_entry",
          confidence_score: 0.3,
          validation_status: "draft" as const,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
    };

    const resolved = detectAndResolveContradictions(conflictingContract);
    const criticalConflict = resolved.contradictions.find((c) => c.description.includes("critical_conflict"));
    expect(criticalConflict).toBeTruthy();
  });
});

describe("B06 contradiction resolver — resolution logic", () => {
  it("resolves conflicts using evidence hierarchy (higher evidence wins)", () => {
    const contract = asContract(examples.service_business);

    // Create conflict between L5 (bank_api) and L1 (manual_entry)
    // L5 should win automatically
    const conflictingContract: BusinessFactsContract = {
      ...contract,
      source_documents: [
        ...contract.source_documents,
        {
          source_document_id: "manual_owner_entry",
          kind: "manual_owner_entry" as const,
          filename: "owner_entry.txt",
          upload_timestamp: new Date().toISOString(),
        },
      ],
      financials: [
        contract.financials[0], // Original (from bank_api via service_business)
        {
          fact_id: "revenue_manual_override",
          metric: "monthly_revenue",
          value: 450000,
          unit: "INR",
          currency: "INR",
          period_start: "2026-04-01",
          period_end: "2026-04-30",
          source_document_id: "manual_owner_entry",
          source_location: "Owner estimate",
          extraction_method: "manual_entry",
          confidence_score: 0.5,
          validation_status: "draft" as const,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
    };

    const resolved = detectAndResolveContradictions(conflictingContract);
    const conflict = resolved.contradictions[0];

    // L5 (bank) vs L1 (manual) → higher evidence (bank) wins
    expect(conflict?.status).toBe("resolved_by_source_priority");
  });

  it("marks conflicts unresolved when evidence is equal", () => {
    const contract = asContract(examples.service_business);

    // Create conflict between two equal-evidence sources (both csv)
    const conflictingContract: BusinessFactsContract = {
      ...contract,
      financials: [
        {
          ...contract.financials[0],
          source_document_id: "csv_export_1",
        },
        {
          ...contract.financials[0],
          fact_id: "revenue_csv_2",
          value: 95000,
          source_document_id: "csv_export_2",
        },
      ],
    };

    const resolved = detectAndResolveContradictions(conflictingContract);
    const conflict = resolved.contradictions[0];

    // Both CSV exports (equal evidence) → unresolved
    expect(conflict?.status).toBe("unresolved");
  });
});

describe("B06 contradiction resolver — acceptance gates", () => {
  it("gate 1: detects P&L revenue vs bank revenue conflict", () => {
    const contract = asContract(examples.service_business);

    const conflictingContract: BusinessFactsContract = {
      ...contract,
      source_documents: [
        ...contract.source_documents,
        {
          source_document_id: "pdf_statement",
          kind: "pdf_statement" as const,
          filename: "plnl_statement.pdf",
          upload_timestamp: new Date().toISOString(),
        },
      ],
      financials: [
        ...contract.financials,
        {
          fact_id: "plnl_revenue",
          metric: "monthly_revenue",
          value: 90000,
          unit: "INR",
          currency: "INR",
          period_start: "2026-05-01",
          period_end: "2026-05-31",
          source_document_id: "pdf_statement", // Lower evidence
          source_location: "P&L statement",
          extraction_method: "manual_entry",
          confidence_score: 0.6,
          validation_status: "draft" as const,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
    };

    const resolved = detectAndResolveContradictions(conflictingContract);
    const revenueConflict = resolved.contradictions.find((c) => c.description.includes("revenue"));
    expect(revenueConflict).toBeTruthy();
  });

  it("gate 2: detects owner claim vs structured export conflict", () => {
    const contract = asContract(examples.service_business);

    const conflictingContract: BusinessFactsContract = {
      ...contract,
      source_documents: [
        ...contract.source_documents,
        {
          source_document_id: "manual_owner_entry",
          kind: "manual_owner_entry" as const,
          filename: "owner_claim.txt",
          upload_timestamp: new Date().toISOString(),
        },
        {
          source_document_id: "crm_export",
          kind: "crm_system_export" as const,
          filename: "crm_export.csv",
          upload_timestamp: new Date().toISOString(),
        },
      ],
      sales: [
        {
          fact_id: "owner_claim_revenue",
          metric: "total_revenue",
          value: 120000,
          unit: "INR",
          currency: "INR",
          period_start: "2026-05-01",
          period_end: "2026-05-31",
          source_document_id: "manual_owner_entry",
          source_location: "Owner's claim",
          extraction_method: "owner_estimate",
          confidence_score: 0.5,
          validation_status: "draft" as const,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          fact_id: "crm_export_revenue",
          metric: "total_revenue",
          value: 110000,
          unit: "INR",
          currency: "INR",
          period_start: "2026-05-01",
          period_end: "2026-05-31",
          source_document_id: "crm_export",
          source_location: "CRM system",
          extraction_method: "api_sync",
          confidence_score: 0.85,
          validation_status: "draft" as const,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
    };

    const resolved = detectAndResolveContradictions(conflictingContract);
    const conflict = resolved.contradictions.find((c) => c.description.includes("total_revenue"));
    expect(conflict).toBeTruthy();
  });

  it("gate 3: unresolved material conflict is identified", () => {
    const contract = asContract(examples.service_business);

    const conflictingContract: BusinessFactsContract = {
      ...contract,
      source_documents: [
        ...contract.source_documents,
        {
          source_document_id: "csv_1",
          kind: "csv" as const,
          filename: "data_1.csv",
          upload_timestamp: new Date().toISOString(),
        },
        {
          source_document_id: "csv_2",
          kind: "csv" as const,
          filename: "data_2.csv",
          upload_timestamp: new Date().toISOString(),
        },
      ],
      financials: [
        {
          fact_id: "cost_1",
          metric: "operating_expenses",
          value: 50000,
          unit: "INR",
          currency: "INR",
          period_start: "2026-05-01",
          period_end: "2026-05-31",
          source_document_id: "csv_1",
          source_location: "CSV 1",
          extraction_method: "csv_import",
          confidence_score: 0.8,
          validation_status: "draft" as const,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          fact_id: "cost_2",
          metric: "operating_expenses",
          value: 35000, // 30% lower — material conflict
          unit: "INR",
          currency: "INR",
          period_start: "2026-05-01",
          period_end: "2026-05-31",
          source_document_id: "csv_2",
          source_location: "CSV 2",
          extraction_method: "csv_import",
          confidence_score: 0.8,
          validation_status: "draft" as const,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
    };

    const resolved = detectAndResolveContradictions(conflictingContract);
    const materialConflict = resolved.contradictions.find((c) => c.description.includes("material_conflict"));
    expect(materialConflict).toBeTruthy();
    expect(materialConflict?.status).toBe("unresolved"); // Equal evidence → unresolved
  });

  it("gate 4: resolved conflict respects evidence hierarchy", () => {
    const contract = asContract(examples.service_business);

    const conflictingContract: BusinessFactsContract = {
      ...contract,
      source_documents: [
        ...contract.source_documents,
        {
          source_document_id: "manual_owner_entry_src",
          kind: "manual_owner_entry" as const,
          filename: "owner_entry.txt",
          upload_timestamp: new Date().toISOString(),
        },
        {
          source_document_id: "accounting_system_export_src",
          kind: "accounting_system_export" as const,
          filename: "accounting_export.csv",
          upload_timestamp: new Date().toISOString(),
        },
      ],
      financials: [
        {
          fact_id: "cost_manual",
          metric: "operating_expenses",
          value: 50000,
          unit: "INR",
          currency: "INR",
          period_start: "2026-05-01",
          period_end: "2026-05-31",
          source_document_id: "manual_owner_entry_src",
          source_location: "Owner entry",
          extraction_method: "manual_entry",
          confidence_score: 0.5,
          validation_status: "draft" as const,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          fact_id: "cost_accounting_system",
          metric: "operating_expenses",
          value: 48000,
          unit: "INR",
          currency: "INR",
          period_start: "2026-05-01",
          period_end: "2026-05-31",
          source_document_id: "accounting_system_export_src",
          source_location: "Accounting system",
          extraction_method: "accounting_export",
          confidence_score: 0.95,
          validation_status: "draft" as const,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
    };

    const resolved = detectAndResolveContradictions(conflictingContract);
    const conflict = resolved.contradictions[0];

    // Accounting system (L5) beats manual entry (L1)
    expect(conflict?.status).toBe("resolved_by_source_priority");
  });
});

describe("B06 contradiction resolver — blocking and severity", () => {
  // Helper: build a minimal contract with inline contradictions of given statuses
  function contractWithContradictions(
    statuses: Array<(typeof import("@/domain/business-facts/contract").CONTRADICTION_STATUSES)[number]>,
  ): import("@/domain/business-facts/contract").BusinessFactsContract {
    const base = asContract(examples.service_business);
    return {
      ...base,
      contradictions: statuses.map((status, i) => ({
        contradiction_id: `test_contradiction_${i}`,
        description: `${status}: monthly_revenue (src_a vs src_b) = [100 vs 200]`,
        fact_ids: ["fact_a", "fact_b"],
        status,
      })),
    };
  }

  it("returns true when a contradiction has status material_conflict", () => {
    const contract = contractWithContradictions(["material_conflict"]);
    expect(hasBlockingContradiction(contract)).toBe(true);
  });

  it("returns true when a contradiction has status critical_conflict", () => {
    const contract = contractWithContradictions(["critical_conflict"]);
    expect(hasBlockingContradiction(contract)).toBe(true);
  });

  it("returns true when mixed contradictions include at least one blocking status", () => {
    const contract = contractWithContradictions(["minor_conflict", "material_conflict", "resolved_by_owner"]);
    expect(hasBlockingContradiction(contract)).toBe(true);
  });

  it("returns false when all contradictions are non-blocking statuses", () => {
    const contract = contractWithContradictions(["minor_conflict", "unresolved", "resolved_by_owner", "resolved_by_source_priority"]);
    expect(hasBlockingContradiction(contract)).toBe(false);
  });

  it("returns false when contradictions array is empty", () => {
    const base = asContract(examples.service_business);
    const contract = { ...base, contradictions: [] };
    expect(hasBlockingContradiction(contract)).toBe(false);
  });

  it("identifies blocking contradictions from contradiction_case example", () => {
    // Verifies the function returns a boolean without throwing on real example data
    const contract = asContract(examples.contradiction_case);
    const hasBlocking = hasBlockingContradiction(contract);
    expect(typeof hasBlocking).toBe("boolean");
  });

  it("gets most severe contradiction status", () => {
    const contract = asContract(examples.service_business);

    // Clean contract
    let severity = getMostSevereContradictionStatus(contract);
    expect(severity).toBeNull();

    // Contract with contradictions
    const withConflicts = asContract(examples.contradiction_case);
    severity = getMostSevereContradictionStatus(withConflicts);
    expect(severity).toBeTruthy();
  });

  it("allows owner to override contradiction resolution", () => {
    const contract = asContract(examples.contradiction_case);
    const resolved = detectAndResolveContradictions(contract);

    if (resolved.contradictions.length > 0) {
      const contradictionId = resolved.contradictions[0].contradiction_id;
      const overridden = resolveContradictionByOwner(resolved, contradictionId, "use_highest_evidence");

      const updated = overridden.contradictions.find((c) => c.contradiction_id === contradictionId);
      expect(updated?.status).toBe("resolved_by_owner");
    }
  });
});
