# OPSIQ DB BLOCKER — SCHEMA DRIFT MAP

Branch: `claude/full-repo-jarvis-db-blocker-closure` (from main `2c79c5e`).

## Method
- Schema `@@map` table names: 193. Tables created by the 93 migrations (quoted + unquoted
  `CREATE TABLE` forms): 164. Drift = schema tables with **no** `CREATE TABLE` in any migration.
- Service usage confirmed via Prisma client accessor (`db.<model>`), excluding the generated client.

## Drift result: 28 missing tables + 1 ignored model

| Table (model) | Expected table | Migration creating it | Service usage | Status | Action |
|---|---|---|---|---|---|
| `owner_input_quality_assessments` (OwnerInputQualityAssessment) | yes | **none** | **ACTIVE** — `recommendation-input-quality.service` + `recommendation-confidence.service` → `gate-enforcement-policy` → `enforceOwnerGatesForPromotion` (recommendation promotion gate) | **active missing table** | **migrate** (new migration) |
| `owner_input_records` (OwnerInputRecord) | yes | none | FK parent of the active table | missing migration | migrate (FK dependency) |
| `owner_recommendations`, `owner_recommendation_evidence`, `owner_recommendation_assumptions`, `owner_recommendation_constraints`, `owner_recommendation_verifications` | yes | none | none (no `db.` accessor) | schema-only | migrate (coherent block) |
| `owner_decisions`, `owner_decision_rights`, `owner_decision_memories` | yes | none | none | schema-only | migrate |
| `owner_actions`, `owner_action_execution_logs` | yes | none | none (`OwnerAction` matches were `ownerActionRequired`/`…RedTeam…`, not the model) | schema-only | migrate |
| `owner_benefits`, `owner_benefit_reviews` | yes | none | none | schema-only | migrate |
| `owner_blockers` | yes | none | none | schema-only | migrate |
| `owner_evidence_records`, `owner_evidence_verifications`, `owner_validation_criteria` | yes | none | none | schema-only | migrate |
| `owner_harm_events`, `owner_failure_adjudications`, `owner_causal_attributions`, `owner_learning_eligibility_reviews` | yes | none | none | schema-only | migrate |
| `owner_overreliance_acknowledgements`, `owner_diagnosis_evidence`, `owner_data_provenance_records`, `owner_missing_data_flags` | yes | none | none | schema-only | migrate |
| `owner_business_state_snapshots`, `owner_business_metrics_timeline` | yes | none | none | schema-only | migrate |
| `recommendations_legacy` (RecommendationLegacy) | n/a | none | none — model is `@@ignore` | ignored | **no action** (Prisma ignores; no table needed) |

### Why migrate the whole block (not remove)
The one **active** table (`owner_input_quality_assessments`) has a NOT-NULL FK to
`owner_input_records`, which in turn anchors the rest of the diagnosis→input→recommendation→
decision→benefit→action→evidence→harm→causal→learning subsystem. The block is FK-interconnected,
so the active table cannot be created in isolation. Migrating the coherent block is additive, makes
the deployed DB match `schema.prisma` (eliminating the drift), fixes the active runtime bug, and is
provable by `prisma migrate deploy` on a fresh CI database. Removal would require unravelling the FK
chain and rewriting the live promotion gate — higher risk for no benefit.

## Fix applied
- New migration `prisma/migrations/20260628200000_owner_diagnosis_decision_harm_lifecycle/migration.sql`
  — 28 `CREATE TABLE IF NOT EXISTS` + 85 indexes + 32 FK constraints, generated from the schema via
  `prisma migrate diff --from-empty --to-schema` (Prisma-generated DDL, not hand-authored), extracted
  for exactly the 28 missing tables. All FK targets resolve within (migrated ∪ block); no dangling refs.
- Added `prisma/migrations/migration_lock.toml` (provider postgresql) — closes GAP-DB-05 and enables
  Prisma migration tooling to identify the connector.
- `[db]` proof: `src/__tests__/owner-mode/owner-diagnosis-lifecycle.db.test.ts` — count() on the block
  tables + a real write/read round-trip on the active table + workspace isolation.

## Other DB gaps (separate slices)
- GAP-DB-02 (cascade restriction) and GAP-ISO-02 (Engagement workspaceId non-null/index) are addressed
  in later slices and require schema + migration changes kept consistent.

## Proof
`prisma validate` + `generate` pass offline; `tsc` clean. `prisma migrate deploy` + the `[db]` test are
proven by GitHub Actions `ci.yml` (ephemeral postgres:16) on this branch — see the closure report for
the run ID and result.
