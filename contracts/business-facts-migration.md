# Business Facts Contract — Migration & Adapter Plan

Per execution_post_owner_mode.md §37.14, B01 must define how existing Owner-Mode
records and the existing intake pipeline map INTO the canonical business-facts
contract — without breaking the current diagnosis/dashboard flow.

## 1. Existing concepts and their mapping target

| Existing repo concept | File / model | Maps to business-facts |
|---|---|---|
| `IntakeResult` (normalized candidate) | `src/domain/owner-intake/types.ts` | the envelope of facts (one `IntakeResult` → one or more `BusinessFact`s across categories) |
| `NormalizedRecord` (flat row) | `src/domain/owner-intake/types.ts` | a set of `BusinessFact`s, one per metric cell in the row |
| `IntakeSource` | same | `extraction_method` vocabulary (csv_upload→csv_import, google_sheets→google_sheets_import, etc.) |
| owner-confirmation guardrail | Module 10 engine | `validation_status` (`draft` until `owner_confirmed`) |
| `OwnerDataIntake` (prisma) | `prisma/schema.prisma` | persistence anchor → becomes a `source_document` + the facts derived from it |
| Owner-Mode domain metrics (finance/cashflow/sales/...) | `src/domain/owner-*` engines | each engine's deterministic metric becomes a `BusinessFact` with `extraction_method: "calculation"` |

## 2. Direction of adapters (no breaking change now)

This slice is **contract-only**. No existing code is modified, so the current
proven Owner-Mode loop is unaffected. Adapters are introduced in later slices:

- **B02 (intake L1):** CSV/XLSX/manual rows → `BusinessFact` drafts under a new
  `source_document`. Draft facts (`validation_status: "draft"`) must NOT drive a
  high-confidence diagnosis until owner-confirmed (preserves Module 10 guardrail).
- **B09 (evidence-backed diagnosis):** diagnosis reads the facts envelope instead
  of raw rows; each domain engine's computed metric is emitted as a
  `calculation`-method fact citing the facts it was derived from.

## 3. Field-level adapter sketch (intake row → facts)

```
for each NormalizedRecord row in IntakeResult:
  doc = source_document {
    source_document_id = intake.id
    kind              = mapIntakeSourceToKind(intake.source)
    label             = intake.source + " " + intake.generatedAt
    received_at       = intake.generatedAt
  }
  for each (canonicalField, value) in row:
    fact = BusinessFact {
      fact_id            = intake.id + ":" + rowIndex + ":" + canonicalField
      metric             = canonicalField
      value              = value            // may be null → validation_status unknown
      unit               = fieldSpec.unit ?? inferUnit(canonicalField)
      currency           = isFinancial(category) ? business.base_currency : undefined
      period_start/end   = intake reporting window
      source_document_id = doc.source_document_id
      source_location    = "row " + rowIndex + " / " + canonicalField
      extraction_method  = mapIntakeSourceToMethod(intake.source)
      confidence_score   = methodBaseConfidence(method)   // refined by B03/B04
      validation_status  = intake.ownerConfirmed ? "owner_confirmed" : "draft"
      created_at/updated_at = now
    }
```

## 4. Backward compatibility guarantees

- Adding the contract introduces **no** Prisma migration and **no** change to any
  existing API/UI/engine, so existing validated Owner-Mode records keep working.
- When persistence is added (later slice) it will be **additive** tables keyed by
  `workspace_id` (tenant isolation, §38.6); existing records are never rewritten.
- A future **major** contract bump must ship an adapter that upgrades stored
  envelopes in place or on read, so no historical facts are invalidated.

## 5. Out of scope for this slice

- DB persistence of facts (no `BusinessFact` table yet).
- Wiring any diagnosis path to consume facts.
- Data-quality scoring (B03), evidence hierarchy ranking (B04), normalization
  (B07) — these consume the contract but are separate modules.
