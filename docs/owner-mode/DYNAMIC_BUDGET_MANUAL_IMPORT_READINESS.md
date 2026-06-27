# Dynamic Budget — Manual / Import-Ready Data Input Layer

Gives the Dynamic Budget module a single, honest **source-confidence** layer for owner-
provided data, so manual/import-ready inputs improve recommendation quality while being
labelled by their true confidence — never as a live/verified feed.

Owner Mode only. **Minimum-code, no duplication, no new table, no live integrations.** The
module already ingests owner data through manual/import-ready surfaces (spend entries,
working-capital items, archetype metrics), each carrying `sourceType` + a last-touch
timestamp. This slice unifies how their confidence/staleness is judged. Gate 10 / `execution.md`
/ billing / stripe untouched. **Not OWNER_MODE_READY.**

## What was implemented
- **Pure classifier** `src/domain/owner-budget/import-source.ts`:
  - `classifySourceConfidence({ sourceType, lastVerifiedAt, staleAfterDays, asOf })` →
    `{ confidence, stale, dataInsufficient, reason }`.
  - `isStaleSource(...)` and `aggregateSourceConfidence(...)` (weakest-input wins).
  - Honesty rules: MANUAL/UPLOAD/IMPORT ≤ PARTIAL; SYSTEM = OPERATIONAL; only RECONCILED →
    VERIFIED; ESTIMATED = UNVERIFIED; stale downgrades one level toward UNVERIFIED;
    missing/unknown source ⇒ data-insufficient.
- **Reuse (consolidation, behaviour-preserving):** the archetype-metric derivation now uses
  the shared `isStaleSource` for stale exclusion instead of an inline cutoff — one tested
  definition of staleness across the import-ready surfaces.

## Required metadata (already carried by the existing surfaces)
Every manual/import-ready record carries (or derives): `workspaceId`, `businessId`,
`sourceType`, `sourceRef`, `createdBy/enteredBy`, `confidenceState` (verification),
`createdAt/updatedAt` (last-touch ⇒ staleness via `staleAfterDays`). The working-capital
items (PR #45) and archetype metrics (PR #48) already persist these; this slice formalises
how their confidence is computed.

## Behaviour proven
- Manual source lowers confidence vs verified/reconciled; stale source lowers confidence;
  missing/unknown source ⇒ data-insufficient (unit tests).
- Malformed source type rejected/treated as insufficient (unit tests; record-time validation
  already enforced by the per-surface Zod schemas + metric-type allowlist).
- Source data is workspace-scoped; cross-workspace read/write blocked (existing `[db]` proofs
  for working-capital items + archetype metrics).
- Reassessment consumes source metadata: the archetype-metric path (DB-proven) excludes stale
  sources via the shared classifier → honest `archetype_data_insufficient`; existing `[db]`
  tests still green (behaviour unchanged when no import data exists).
- No live-feed overclaim in docs or UI (working-capital UI explicitly labels manual/import).

## Tests
8 unit (`import-source.test.ts`) + reuse proven by the archetype-metric unit + `[db]` suites.
Regression owner-budget + services **201/201**. `tsc` 0; `lint:ratchet` PASS. No schema.

## What remains
- A unified persisted "source registry" table is intentionally NOT added — it would duplicate
  the per-domain manual/import-ready models and is a product-policy decision; the per-surface
  models + this shared classifier are the import-readiness layer. Live feeds remain deferred.

## Classification
`DYNAMIC_BUDGET_IMPORT_READINESS_DB_PROVEN` — the shared source classifier is consumed by the
DB-proven archetype-metric reassessment path (and reused across the manual/import-ready
surfaces), proven by unit + existing `[db]` tests. **Not OWNER_MODE_READY.**
