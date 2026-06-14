/**
 * B01 integration groundwork — adapter from the existing Module 10 intake output
 * (`IntakeResult` of `NormalizedRecord` rows) INTO the canonical business-facts
 * contract (B01). This makes the contract consumable and proves the migration
 * plan in `contracts/business-facts-migration.md` with running code.
 *
 * Pure and deterministic: no DB, no I/O, no LLM. Does NOT modify the intake
 * engine or any proven Owner-Mode path. The adapter produces a CANDIDATE
 * contract and validates it against the Zod contract, failing CLOSED on any
 * invalid/untrusted value (e.g. a non-ISO currency from an uploaded cell) rather
 * than emitting an invalid fact (§38.7 untrusted-input safety).
 *
 * Owner-confirmation guardrail (Module 10 / execution.md §17) is preserved:
 * facts inherit `validation_status: "draft"` until the intake is owner-confirmed,
 * so converted facts cannot silently drive a high-confidence diagnosis.
 */
import type { IntakeFieldSpec, IntakeResult, IntakeSource, NormalizedRecord } from "@/domain/owner-intake/types";
import type { IntakeTargetDomain } from "@/domain/owner-intake/field-specs";
import {
  businessFactsContractSchema,
  BUSINESS_FACTS_SCHEMA_VERSION,
  type BusinessFact,
  type BusinessFactsContract,
  type BusinessProfile,
  type ExtractionMethod,
  type FactCategoryKey,
  type MissingData,
  type SourceDocument,
  type SourceDocumentKind,
} from "./contract";

// --- Deterministic mapping tables --------------------------------------------

/** Intake source → canonical extraction_method (no guessing; explicit map). */
const SOURCE_TO_METHOD: Record<IntakeSource, ExtractionMethod> = {
  csv_upload: "csv_import",
  manual_form: "manual_entry",
  google_sheets: "google_sheets_import",
  email_import: "manual_entry",
  accounting_export: "accounting_export",
  pos_order_upload: "pos_export",
  bank_statement: "bank_statement",
  lead_import: "csv_import",
};

/** Intake source → default source-document kind (lineage). */
const SOURCE_TO_DOC_KIND: Record<IntakeSource, SourceDocumentKind> = {
  csv_upload: "csv",
  manual_form: "manual_owner_entry",
  google_sheets: "google_sheet",
  email_import: "other",
  accounting_export: "accounting_system_export",
  pos_order_upload: "pos_export",
  bank_statement: "bank_api",
  lead_import: "crm_export",
};

/** Base confidence per extraction method (refined later by B03/B04). */
const METHOD_BASE_CONFIDENCE: Record<ExtractionMethod, number> = {
  manual_entry: 0.5,
  csv_import: 0.7,
  xlsx_import: 0.7,
  google_sheets_import: 0.7,
  accounting_export: 0.85,
  pos_export: 0.8,
  bank_statement: 0.95,
  api_sync: 0.9,
  ocr: 0.45,
  calculation: 0.7,
  owner_estimate: 0.4,
};

/** Intake target domain → primary contract fact category. */
const DOMAIN_PRIMARY_CATEGORY: Record<IntakeTargetDomain, FactCategoryKey> = {
  finance: "financials",
  sales: "sales",
  operations: "operations",
  sop: "operations", // sop is an execution domain; its metrics live under operations
  marketing: "marketing",
};

/** Explicit per-field category overrides where a field clearly belongs elsewhere. */
const FIELD_CATEGORY_OVERRIDE: Record<string, FactCategoryKey> = {
  cashOnHand: "cash",
};

const FINANCIAL_CATEGORIES = new Set<FactCategoryKey>(["financials", "debt", "cash"]);

/** Row-metadata field names that are consumed, not emitted as facts. */
const METADATA_FIELDS = new Set(["periodStart", "periodEnd", "currency"]);

export function mapIntakeSourceToExtractionMethod(source: IntakeSource): ExtractionMethod {
  return SOURCE_TO_METHOD[source];
}

function categoryForField(domain: IntakeTargetDomain, fieldName: string): FactCategoryKey {
  return FIELD_CATEGORY_OVERRIDE[fieldName] ?? DOMAIN_PRIMARY_CATEGORY[domain];
}

// --- Adapter input/output ----------------------------------------------------

export interface IntakeConversionInput {
  intake: IntakeResult;
  targetDomain: IntakeTargetDomain;
  fieldSpecs: IntakeFieldSpec[];
  /** Stable id of the originating intake record (e.g. OwnerDataIntake.id). */
  sourceDocumentId: string;
  /** Human label for the source document; defaults from the intake source. */
  sourceDocumentLabel?: string;
}

export interface AssembleContractInput {
  businessProfile: BusinessProfile;
  conversion: IntakeConversionInput;
  confidenceBasis?: string;
  now?: Date;
}

export type AssembleResult =
  | { ok: true; contract: BusinessFactsContract }
  | { ok: false; errors: Array<{ path: string; message: string }> };

interface ConversionOutput {
  factsByCategory: Record<FactCategoryKey, BusinessFact[]>;
  sourceDocument: SourceDocument;
  missingData: MissingData[];
  periodStart: string | null;
  periodEnd: string | null;
}

function emptyCategories(): Record<FactCategoryKey, BusinessFact[]> {
  return {
    financials: [],
    sales: [],
    customers: [],
    marketing: [],
    operations: [],
    inventory: [],
    staffing: [],
    debt: [],
    cash: [],
  };
}

/** Normalize an uploaded currency cell to an ISO-4217-shaped token (fail-closed downstream). */
function normalizeCurrency(raw: NormalizedRecord[string]): string | undefined {
  if (typeof raw !== "string") return undefined;
  const t = raw.trim().toUpperCase();
  return t === "" ? undefined : t;
}

/**
 * Convert one IntakeResult's rows into categorized facts + lineage + missing-data.
 * Numeric/currency spec fields become facts; period/currency are row metadata.
 * A null required numeric field becomes a `missing_data` entry (not a guessed fact).
 */
function convertIntakeResult(input: IntakeConversionInput, now: Date): ConversionOutput {
  const { intake, targetDomain, fieldSpecs, sourceDocumentId } = input;
  const method = mapIntakeSourceToExtractionMethod(intake.source);
  const confidence = METHOD_BASE_CONFIDENCE[method];
  const nowIso = now.toISOString();

  const byCategory = emptyCategories();
  const missingData: MissingData[] = [];
  const specByName = new Map(fieldSpecs.map((f) => [f.name, f]));
  const emittableFields = fieldSpecs.filter((f) => f.type === "number" || f.type === "currency");

  let minStart: string | null = null;
  let maxEnd: string | null = null;

  intake.records.forEach((record, idx) => {
    const rowNum = idx + 1;
    const periodStart = typeof record.periodStart === "string" ? record.periodStart : null;
    const periodEnd = typeof record.periodEnd === "string" ? record.periodEnd : null;
    const rowCurrency = normalizeCurrency(record.currency);

    if (periodStart && (minStart === null || periodStart < minStart)) minStart = periodStart;
    if (periodEnd && (maxEnd === null || periodEnd > maxEnd)) maxEnd = periodEnd;

    // A row with no valid period cannot place its facts in time → record as missing.
    if (!periodStart || !periodEnd) {
      missingData.push({
        field: `row ${rowNum}: periodStart/periodEnd`,
        reason: "Intake row is missing a valid reporting period; facts not emitted.",
        blocking: true,
      });
      return;
    }

    for (const field of emittableFields) {
      const raw = record[field.name];
      const category = categoryForField(targetDomain, field.name);
      const isFinancial = FINANCIAL_CATEGORIES.has(category);
      const isMonetary = field.type === "currency";

      if (raw === null || raw === undefined) {
        missingData.push({
          field: `row ${rowNum}: ${field.name}`,
          reason: "Value missing or invalid in intake; not emitted as a fact.",
          blocking: Boolean(field.required),
        });
        continue;
      }
      if (typeof raw !== "number") {
        // Defensive: emittable fields are numeric; a non-number is treated as missing.
        missingData.push({
          field: `row ${rowNum}: ${field.name}`,
          reason: "Non-numeric value for a numeric field; not emitted.",
          blocking: Boolean(field.required),
        });
        continue;
      }

      const fact: BusinessFact = {
        fact_id: `${sourceDocumentId}:r${rowNum}:${field.name}`,
        metric: field.name,
        value: raw,
        unit: isMonetary ? rowCurrency ?? "currency" : "count",
        ...(isFinancial || isMonetary ? { currency: rowCurrency } : {}),
        period_start: periodStart,
        period_end: periodEnd,
        source_document_id: sourceDocumentId,
        source_location: `row ${rowNum} / ${field.name}`,
        extraction_method: method,
        confidence_score: confidence,
        validation_status: intake.ownerConfirmed ? "owner_confirmed" : "draft",
        created_at: nowIso,
        updated_at: nowIso,
      };
      byCategory[category].push(fact);
    }
  });

  const sourceDocument: SourceDocument = {
    source_document_id: sourceDocumentId,
    kind: SOURCE_TO_DOC_KIND[intake.source],
    label: input.sourceDocumentLabel ?? `${intake.source} import`,
    received_at: intake.generatedAt.toISOString(),
  };

  return { factsByCategory: byCategory, sourceDocument, missingData, periodStart: minStart, periodEnd: maxEnd };
}

/**
 * Assemble a full, VALIDATED business-facts contract from a single intake
 * conversion plus the owning business profile. Returns a discriminated result;
 * on any contract violation (including an untrusted/invalid currency cell) it
 * returns `ok: false` with errors — it never emits an invalid contract.
 */
export function assembleBusinessFactsContract(input: AssembleContractInput): AssembleResult {
  const now = input.now ?? new Date();
  const conv = convertIntakeResult(input.conversion, now);

  const periodStart = conv.periodStart ?? input.conversion.intake.generatedAt.toISOString().slice(0, 10);
  const periodEnd = conv.periodEnd ?? periodStart;

  const allFacts = Object.values(conv.factsByCategory).flat();
  const overall =
    allFacts.length > 0
      ? allFacts.reduce((s, f) => s + f.confidence_score, 0) / allFacts.length
      : 0;

  const candidate = {
    schema_version: BUSINESS_FACTS_SCHEMA_VERSION,
    business_profile: input.businessProfile,
    reporting_period: {
      period_start: periodStart,
      period_end: periodEnd,
      label: `${periodStart} → ${periodEnd}`,
    },
    source_documents: [conv.sourceDocument],
    ...conv.factsByCategory,
    risks: [],
    constraints: [],
    confidence: {
      overall_score: Number(overall.toFixed(4)),
      basis:
        input.confidenceBasis ??
        `Derived from ${input.conversion.intake.source} intake (${allFacts.length} facts), unconfirmed drafts capped pending owner review.`,
    },
    missing_data: conv.missingData,
    contradictions: [],
  };

  const result = businessFactsContractSchema.safeParse(candidate);
  if (result.success) return { ok: true, contract: result.data };
  return {
    ok: false,
    errors: result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
  };
}
