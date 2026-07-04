# OPSIQ DB BLOCKER — POST-FIX AUDIT

Branch: `claude/full-repo-jarvis-db-blocker-closure` (from main `2c79c5e`).
GitHub Actions DB proof: `ci.yml` runs `prisma migrate deploy` + the full DB test suite against an
ephemeral `postgres:16` service (no secret needed; the configured secret DB is for the neon workflows).

| DB blocker | Original finding | Fix commit | Migration file | Schema file | DB test | GH Actions run | Result |
|---|---|---|---|---|---|---|---|
| GAP-DB-01 | ~28 owner decision/harm models declared but never migrated; `owner_input_quality_assessments` actively read by the recommendation promotion gate against a missing table | `242bf5f` | `20260628200000_owner_diagnosis_decision_harm_lifecycle/migration.sql` | `prisma/schema.prisma` (26 dead models removed) | `owner-diagnosis-lifecycle.db.test.ts` | **run `28337363604` (`8b112ce`) — `DB Blocker Proof` workflow GREEN**: migrate deploy + the `[db]` round-trip test + owner-loop `[db]` test all pass | **CLOSED_CI_PROVEN** |
| GAP-DB-05 | `migration_lock.toml` absent | `90deb54` | `prisma/migrations/migration_lock.toml` | — | n/a (migrate deploy uses it) | run `28337363604` | **CLOSED_CI_PROVEN** |
| GAP-DB-02 | unsafe `onDelete: Cascade` over governed records (latent — no runtime delete path) | — | — | — | — | — | **OPEN (separate slice)** — latent; addressed next |
| GAP-ISO-02 | `Engagement.workspaceId` nullable + unindexed | — | — | — | — | — | **OPEN (separate slice)** — needs backfill+index migration |

## What the CI run proves (run 28336952996, commit 242bf5f, real runner 1000016484)
Green steps (in order): Set up job · Init postgres container · Checkout · Node · `npm ci` ·
Governance scan · **tsc** · **prisma validate** · **prisma migrate deploy** ✅ · prisma generate ·
**next build** ✅ · wrapped-handler ratchet ✅ · lint job ✅. The maintained DB test suite
(`TEST_WITH_DB=true`, includes `owner-diagnosis-lifecycle.db.test.ts` + the owner-loop and
owner-budget `[db]` tests) runs as the final blocking step.

The decisive fact: **`prisma migrate deploy` applied all 93 prior migrations + the new
`20260628200000` migration to a fresh PostgreSQL and succeeded.** The first attempt (run
`28336701468`) failed at exactly this step with `foreign key constraint
owner_recommendations_workspaceId_fkey cannot be implemented: key columns "workspaceId" and "id"
are of incompatible types: text and uuid` — proving the 26 dead models were non-functional
(text-vs-uuid FK mismatch), which is why they were never migrated. Removing them and migrating only
the correct, actively-used input-quality chain produced a clean deploy.

## Active-bug closure detail (GAP-DB-01)
`owner_input_quality_assessments` is read by `enforceInputQualityForPromotion`
(`recommendation-input-quality.service`) and `enforceConfidenceForPromotion`
(`recommendation-confidence.service`), both invoked by `gate-enforcement-policy` →
`enforceOwnerGatesForPromotion` (the recommendation promotion gate). With the table now created
(+ its FK parent `owner_input_records`), the gate's `findFirst` no longer hits a missing relation.
The `[db]` test writes a real `owner_input_record` + `owner_input_quality_assessment` and reads it
back (the exact query the gate runs), plus asserts workspace isolation.

## Remaining DB gaps (not in this slice)
- **GAP-DB-02** (cascade restriction): change governed `onDelete: Cascade` → `Restrict`/`SetNull` in
  schema + a migration. Latent (no runtime delete path), so no active danger; addressed next.
- **GAP-ISO-02** (Engagement workspaceId non-null + index): needs a backfill-safe migration.

If any DB blocker here were OPEN/PARTIAL due to code, work continues. GAP-DB-01 (the BLOCKER) and
GAP-DB-05 are CI-proven closed; GAP-DB-02 and GAP-ISO-02 are the next slices.
