# Business Facts Contract — Version

**Current version:** `1.0.0`
**Module:** B01 — Machine-Readable Business Facts Contract
**Status:** `IMPLEMENTED_CONTRACT_ONLY_NOT_INTEGRATED`
(per execution_post_owner_mode.md §37.14 — schema + examples + tests exist; no
diagnosis/intake path consumes it yet. Integration is a later B-slice.)

## Source of truth

The **Zod schema** in `src/domain/business-facts/contract.ts`
(`businessFactsContractSchema`) is the authoritative definition. The JSON Schema
at `contracts/business-facts.schema.json` is **generated** from it by
`scripts/generate-business-facts-schema.ts` and verified non-stale by a test, so
the two can never drift.

## What the JSON Schema covers vs. what Zod adds

`business-facts.schema.json` captures the **structural** contract (objects,
fields, types, enums, ranges). The following **cross-field referential rules**
are enforced only by the Zod `.refine()`s (JSON Schema draft-2020-12 cannot
express them concisely) and are part of the contract:

1. **currency-if-financial** — facts in `financials`, `debt`, `cash` MUST carry a
   3-letter ISO 4217 `currency`.
2. **source lineage integrity** — every `fact.source_document_id` MUST resolve to
   a declared entry in `source_documents`.
3. **unique fact_id** — `fact_id` is unique across the entire envelope.
4. **reference integrity** — every `contradiction.fact_ids` and
   `risk.related_fact_ids` MUST resolve to a real fact.
5. **null discipline** — a `null` fact `value` is allowed ONLY when
   `validation_status` is `"unknown"` (intentionally-missing value).
6. **period ordering** — `period_end >= period_start` on facts and the reporting
   period.

## Required objects (§8)

`business_profile`, `reporting_period`, `source_documents`, `financials`,
`sales`, `customers`, `marketing`, `operations`, `inventory`, `staffing`,
`debt`, `cash`, `risks`, `constraints`, `confidence`, `missing_data`,
`contradictions`.

## Required per-fact fields (§8)

`fact_id`, `metric`, `value`, `unit`, `currency` (if financial), `period_start`,
`period_end`, `source_document_id`, `source_location`, `extraction_method`,
`confidence_score`, `validation_status`, `created_at`, `updated_at`.
Optional financial qualifiers: `tax_basis`, `gross_or_net` (B07 normalization).

## Regenerating the JSON Schema

```bash
npx tsx scripts/generate-business-facts-schema.ts          # write
npx tsx scripts/generate-business-facts-schema.ts --check  # fail if stale
```

## Change policy

- **patch** (`1.0.x`): docs, descriptions, additive optional fields that do not
  break existing valid payloads.
- **minor** (`1.x.0`): new optional objects/fields, new enum members appended.
- **major** (`x.0.0`): any field removal/rename, required-field addition, or enum
  removal. A major bump REQUIRES an entry in `business-facts-migration.md` and an
  adapter so older Owner-Mode records keep validating.

## History

| Version | Date       | Notes                                            |
|---------|------------|--------------------------------------------------|
| 1.0.0   | 2026-06-14 | Initial canonical contract (B01 slice 1).        |
