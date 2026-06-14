/**
 * B01 — Machine-Readable Business Facts Contract (canonical internal language).
 *
 * Post-Owner-Mode module B01. This is the canonical, machine-readable shape that
 * every later data-intake / connector / diagnosis path must map business data
 * INTO before it can drive recommendations. It is the single internal language
 * for "what we know about this business".
 *
 * Pure and deterministic: no DB, no API, no UI, no LLM, no I/O. This file is the
 * Zod SOURCE OF TRUTH; `contracts/business-facts.schema.json` is generated from
 * it (see `scripts/generate-business-facts-schema.ts`) so the JSON Schema cannot
 * drift from this definition.
 *
 * DATA_MODEL_REUSE_CHECK (execution_post_owner_mode.md §37.13):
 *   - existing_models_checked: OwnerDataIntake (prisma), IntakeResult /
 *     NormalizedRecord (src/domain/owner-intake/types.ts), intake DTOs
 *     (src/domain/data-intake/intake-contracts.ts).
 *   - existing_fields_reused: IntakeSource → extraction_method vocabulary,
 *     owner-confirmation semantics → validation_status, source/timestamp idea.
 *   - new_models_required: BusinessFact (atomic, lineage-bearing fact) and the
 *     BusinessFactsContract envelope. The existing intake produces flat
 *     NormalizedRecord rows (Record<string, number|string|null>) with NO
 *     fact_id, unit, currency, period, source-location, confidence, or
 *     per-fact validation status — so it cannot represent a single auditable
 *     fact. B01 adds that atomic representation.
 *   - why_existing_models_are_insufficient: rows are not facts; diagnosis needs
 *     per-fact evidence/confidence/lineage, not opaque row maps.
 *   - migration_risk: none in this slice (additive contract only; no schema/DB
 *     change, no existing file edited). Adapter plan in
 *     contracts/business-facts-migration.md.
 *
 * TENANT_ISOLATION_CHECK (§38.6): business_profile carries workspace_id +
 *   business_id as the tenant key so every facts envelope is workspace-owned by
 *   construction; persistence (a later slice) must scope on workspace_id.
 *
 * UNTRUSTED_INPUT_SAFETY_CHECK (§38.7): facts carry source_document_id +
 *   source_location lineage and are validated as DATA ONLY. Nothing in this
 *   contract is ever interpreted as an instruction; values are scalars/strings.
 */
import { z } from "zod/v4";

// --- Versioning --------------------------------------------------------------

/** Semantic version of the business-facts contract. Bump on shape changes. */
export const BUSINESS_FACTS_SCHEMA_VERSION = "1.0.0";

// --- Vocabularies ------------------------------------------------------------

/**
 * How a fact's value was obtained. Aligned with the existing intake sources
 * (src/domain/owner-intake/types.ts INTAKE_SOURCES) plus derived/estimate
 * methods that intake rows cannot express.
 */
export const EXTRACTION_METHODS = [
  "manual_entry",
  "csv_import",
  "xlsx_import",
  "google_sheets_import",
  "accounting_export",
  "pos_export",
  "bank_statement",
  "api_sync",
  "ocr",
  "calculation",
  "owner_estimate",
] as const;
export type ExtractionMethod = (typeof EXTRACTION_METHODS)[number];
export const extractionMethodSchema = z.enum(EXTRACTION_METHODS);

/**
 * Per-fact validation lifecycle. `draft` until an owner/system confirms it —
 * mirrors Module 10's owner-confirmation guardrail (connector data never drives
 * a diagnosis until confirmed). `unknown` marks an intentionally-null value.
 */
export const FACT_VALIDATION_STATUSES = [
  "draft",
  "owner_confirmed",
  "system_validated",
  "rejected",
  "unknown",
] as const;
export type FactValidationStatus = (typeof FACT_VALIDATION_STATUSES)[number];
export const factValidationStatusSchema = z.enum(FACT_VALIDATION_STATUSES);

/** Tax basis of a financial fact (kept explicit; "unknown" when not provable). */
export const TAX_BASES = ["inclusive", "exclusive", "not_applicable", "unknown"] as const;
export type TaxBasis = (typeof TAX_BASES)[number];
export const taxBasisSchema = z.enum(TAX_BASES);

/** Gross vs net classification for financial facts. */
export const GROSS_NET = ["gross", "net", "not_applicable", "unknown"] as const;
export type GrossNet = (typeof GROSS_NET)[number];
export const grossNetSchema = z.enum(GROSS_NET);

/** Source document kinds (lineage). Evidence-level ranking is refined in B04. */
export const SOURCE_DOCUMENT_KINDS = [
  "manual_owner_entry",
  "csv",
  "xlsx",
  "google_sheet",
  "pdf_statement",
  "screenshot_ocr",
  "accounting_system_export",
  "pos_export",
  "bank_api",
  "crm_export",
  "other",
] as const;
export type SourceDocumentKind = (typeof SOURCE_DOCUMENT_KINDS)[number];
export const sourceDocumentKindSchema = z.enum(SOURCE_DOCUMENT_KINDS);

/** The financial fact categories that REQUIRE a currency ("currency if financial"). */
export const FINANCIAL_CATEGORIES = ["financials", "debt", "cash"] as const;
export type FinancialCategory = (typeof FINANCIAL_CATEGORIES)[number];

// --- Primitive field schemas -------------------------------------------------

const isoDateSchema = z.iso.date(); // YYYY-MM-DD
const isoDateTimeSchema = z.iso.datetime(); // RFC 3339 / ISO 8601
const currencySchema = z.string().regex(/^[A-Z]{3}$/, "ISO 4217 3-letter currency code");
const idSchema = z.string().min(1);

// --- BusinessFact (the atomic, lineage-bearing unit) -------------------------

/**
 * One atomic business fact. Every required field from
 * execution_post_owner_mode.md §8 is present. `value` may be null ONLY when
 * validation_status is "unknown" (intentionally-missing value), enforced below.
 */
export const businessFactSchema = z
  .object({
    fact_id: idSchema,
    metric: z.string().min(1),
    value: z.union([z.number(), z.string(), z.null()]),
    unit: z.string().min(1),
    /** Required for financial categories; enforced at the envelope level. */
    currency: currencySchema.optional(),
    /** Financial qualifiers (kept explicit; default "unknown" not assumed). */
    tax_basis: taxBasisSchema.optional(),
    gross_or_net: grossNetSchema.optional(),
    period_start: isoDateSchema,
    period_end: isoDateSchema,
    source_document_id: idSchema,
    source_location: z.string().min(1),
    extraction_method: extractionMethodSchema,
    confidence_score: z.number().min(0).max(1),
    validation_status: factValidationStatusSchema,
    created_at: isoDateTimeSchema,
    updated_at: isoDateTimeSchema,
  })
  .refine((f) => f.period_end >= f.period_start, {
    message: "period_end must be on or after period_start",
    path: ["period_end"],
  })
  .refine((f) => (f.value === null ? f.validation_status === "unknown" : true), {
    message: "null value requires validation_status 'unknown'",
    path: ["value"],
  });
export type BusinessFact = z.infer<typeof businessFactSchema>;

// --- Envelope sub-objects ----------------------------------------------------

export const businessProfileSchema = z.object({
  /** Tenant key — every facts envelope is workspace-owned by construction. */
  workspace_id: idSchema,
  business_id: idSchema,
  name: z.string().min(1),
  industry: z.string().min(1),
  /** Free-form stage label (e.g. "early", "growth", "distressed"). */
  stage: z.string().min(1),
  country: z.string().min(2).max(2).optional(), // ISO 3166-1 alpha-2
  /** Default reporting currency for the business (per-fact may still override). */
  base_currency: currencySchema,
});
export type BusinessProfile = z.infer<typeof businessProfileSchema>;

export const reportingPeriodSchema = z
  .object({
    period_start: isoDateSchema,
    period_end: isoDateSchema,
    label: z.string().min(1),
    timezone: z.string().min(1).optional(), // IANA tz, e.g. "Asia/Kolkata"
  })
  .refine((p) => p.period_end >= p.period_start, {
    message: "period_end must be on or after period_start",
    path: ["period_end"],
  });
export type ReportingPeriod = z.infer<typeof reportingPeriodSchema>;

export const sourceDocumentSchema = z.object({
  source_document_id: idSchema,
  kind: sourceDocumentKindSchema,
  label: z.string().min(1),
  received_at: isoDateTimeSchema,
  /** Optional opaque origin reference (filename, connector job id, etc.). */
  origin_reference: z.string().optional(),
});
export type SourceDocument = z.infer<typeof sourceDocumentSchema>;

export const SEVERITIES = ["low", "medium", "high", "critical"] as const;
export const severitySchema = z.enum(SEVERITIES);

export const riskSchema = z.object({
  risk_id: idSchema,
  description: z.string().min(1),
  severity: severitySchema,
  related_fact_ids: z.array(idSchema),
});
export type Risk = z.infer<typeof riskSchema>;

export const CONSTRAINT_CATEGORIES = [
  "budget",
  "time",
  "staff",
  "geography",
  "legal_payment",
  "data_availability",
  "risk_appetite",
  "business_stage",
  "owner_goal",
  "channel_limit",
  "execution_capacity",
  "cash_runway",
] as const;
export const constraintCategorySchema = z.enum(CONSTRAINT_CATEGORIES);

export const constraintSchema = z.object({
  constraint_id: idSchema,
  category: constraintCategorySchema,
  description: z.string().min(1),
  /** Hard constraints cannot be violated by a primary recommendation (B08). */
  hard: z.boolean(),
});
export type Constraint = z.infer<typeof constraintSchema>;

export const confidenceSchema = z.object({
  /** Overall confidence in this facts envelope, 0..1. */
  overall_score: z.number().min(0).max(1),
  /** Optional 0..100 data-quality score (computed by B03 later). */
  data_quality_score: z.number().min(0).max(100).optional(),
  basis: z.string().min(1),
});
export type Confidence = z.infer<typeof confidenceSchema>;

export const missingDataSchema = z.object({
  field: z.string().min(1),
  reason: z.string().min(1),
  /** True when absence blocks a high-confidence recommendation. */
  blocking: z.boolean(),
});
export type MissingData = z.infer<typeof missingDataSchema>;

export const CONTRADICTION_STATUSES = [
  "no_conflict",
  "minor_conflict",
  "material_conflict",
  "critical_conflict",
  "unresolved",
  "resolved_by_owner",
  "resolved_by_source_priority",
] as const;
export const contradictionStatusSchema = z.enum(CONTRADICTION_STATUSES);

export const contradictionSchema = z.object({
  contradiction_id: idSchema,
  description: z.string().min(1),
  /** Conflicting numbers are flagged, never averaged (B06). >=2 facts. */
  fact_ids: z.array(idSchema).min(2),
  status: contradictionStatusSchema,
});
export type Contradiction = z.infer<typeof contradictionSchema>;

// --- Top-level contract envelope ---------------------------------------------

const factCategoriesShape = {
  financials: z.array(businessFactSchema),
  sales: z.array(businessFactSchema),
  customers: z.array(businessFactSchema),
  marketing: z.array(businessFactSchema),
  operations: z.array(businessFactSchema),
  inventory: z.array(businessFactSchema),
  staffing: z.array(businessFactSchema),
  debt: z.array(businessFactSchema),
  cash: z.array(businessFactSchema),
} as const;

/** The ordered list of fact-bearing category keys. */
export const FACT_CATEGORIES = Object.keys(factCategoriesShape) as Array<keyof typeof factCategoriesShape>;

const baseContractSchema = z.object({
  schema_version: z.string().min(1),
  business_profile: businessProfileSchema,
  reporting_period: reportingPeriodSchema,
  source_documents: z.array(sourceDocumentSchema),
  ...factCategoriesShape,
  risks: z.array(riskSchema),
  constraints: z.array(constraintSchema),
  confidence: confidenceSchema,
  missing_data: z.array(missingDataSchema),
  contradictions: z.array(contradictionSchema),
});

/** Collect every fact in the envelope with its category, for cross-checks. */
function allFactsOf(c: z.infer<typeof baseContractSchema>): Array<{ fact: BusinessFact; category: string }> {
  const out: Array<{ fact: BusinessFact; category: string }> = [];
  for (const category of FACT_CATEGORIES) {
    for (const fact of c[category]) out.push({ fact, category });
  }
  return out;
}

/**
 * The full canonical contract with referential-integrity refinements:
 *  - currency required on facts in financial categories ("currency if financial")
 *  - every fact.source_document_id resolves to a declared source_document
 *  - fact_id unique across the whole envelope
 *  - every contradiction.fact_ids and risk.related_fact_ids resolve to real facts
 */
export const businessFactsContractSchema = baseContractSchema
  .refine(
    (c) => {
      const financial = new Set<string>(FINANCIAL_CATEGORIES);
      return allFactsOf(c).every(
        ({ fact, category }) => !financial.has(category) || typeof fact.currency === "string",
      );
    },
    { message: "facts in financial categories (financials/debt/cash) require a currency", path: ["financials"] },
  )
  .refine(
    (c) => {
      const docIds = new Set(c.source_documents.map((d) => d.source_document_id));
      return allFactsOf(c).every(({ fact }) => docIds.has(fact.source_document_id));
    },
    { message: "every fact.source_document_id must reference a declared source_document", path: ["source_documents"] },
  )
  .refine(
    (c) => {
      const ids = allFactsOf(c).map(({ fact }) => fact.fact_id);
      return new Set(ids).size === ids.length;
    },
    { message: "fact_id must be unique across the entire contract", path: ["financials"] },
  )
  .refine(
    (c) => {
      const factIds = new Set(allFactsOf(c).map(({ fact }) => fact.fact_id));
      const refs = [
        ...c.contradictions.flatMap((x) => x.fact_ids),
        ...c.risks.flatMap((x) => x.related_fact_ids),
      ];
      return refs.every((id) => factIds.has(id));
    },
    { message: "contradiction.fact_ids and risk.related_fact_ids must reference real facts", path: ["contradictions"] },
  );
export type BusinessFactsContract = z.infer<typeof businessFactsContractSchema>;

/** The structural (refinement-free) schema, used to emit JSON Schema. */
export const businessFactsContractStructuralSchema = baseContractSchema;

/**
 * Validate an unknown payload against the canonical contract.
 * Returns a discriminated result so callers never throw on bad input.
 */
export function parseBusinessFactsContract(
  data: unknown,
):
  | { ok: true; value: BusinessFactsContract }
  | { ok: false; errors: Array<{ path: string; message: string }> } {
  const result = businessFactsContractSchema.safeParse(data);
  if (result.success) return { ok: true, value: result.data };
  return {
    ok: false,
    errors: result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
  };
}
