# Phase 4 — Item 2: Post-migration proof plan (VERIFICATION-ONLY)

**Date:** 2026-07-08
**Branch:** `claude/phase-4-post-migration-proof-plan`
**Commit subject:** `Phase 4: prepare post-migration proof plan`
**Classification:** verification-only. **The owner has NOT approved running the production migration.
No migration was run. No production database was touched. No secrets were read or changed.**

---

## A. Purpose
Phase 4 Item 1 (PR #202, merged `ff131191`) added honest schema-drift detection and an OWNER-RUN-ONLY
migration runbook for the confirmed Phase 3 residual: the production database is behind on the additive
migration `20260625120000_owner_mode_execution_tables`, so a default-select `workspace_memberships`
read at `demo-permission-proof` returns a (now correctly classified) `schema_drift` 500.

This item prepares the **post-migration verification** that must run once the owner approves and the
migration is applied — plus the explicit approval gate. It changes no product code and runs nothing
against production.

## B. Files created
- `docs/audits/2026-07-08-phase-4-post-migration-proof/FINAL_REPORT.md` (this)
- `docs/audits/2026-07-08-phase-4-post-migration-proof/POST_MIGRATION_CHECKLIST.md`
- `docs/audits/2026-07-08-phase-4-post-migration-proof/EVIDENCE_LEDGER.json`

## C. Files changed
None (docs-only PR).

## D. The approval gate (HARD)
Production migration execution is authorized ONLY when the repository owner states, verbatim:

> **"I approve running the production migration."**

No other phrasing suffices. Until then, this is verification-only; automation/agents must not
self-authorize, and CI must never run the migration or require production credentials.

## E. What is prepared
`POST_MIGRATION_CHECKLIST.md` provides, in order:
1. The required explicit approval phrase (hard gate).
2. Pre-migration backup/snapshot check.
3. Target-environment confirmation (production DIRECT/non-pooler endpoint; secrets never echoed).
4. Migration confirmation (`20260625120000_owner_mode_execution_tables`; additive/idempotent).
5. Migration command labelled OWNER-RUN ONLY unless the approval phrase is given.
6. Expected output/evidence to capture (no secrets).
7. Post-migration smoke sequence: login 200 · dashboard 200 · `demo-permission-proof` 200 /
   `permission_ready` (not `schema_drift`, not 500) · `/api/engagements` 200 · membership/default-select
   path healthy · unauthorized still denied · no auth bypass · smoke green end-to-end.
8. Stop conditions (halt + restore).
9. Rollback/escalation plan (snapshot restore; no hand-written `DROP` on production).
10. Final production-health classification criteria (HEALTHY / BLOCKED / FAILED).

## F. Safety confirmations
- [x] No production migration run.
- [x] No production database touched.
- [x] No production secrets read or changed.
- [x] No product code changed (docs-only).
- [x] No auth/membership bypass; the plan re-verifies that unauthorized access stays denied.
- [x] The smoke remains honest (PASS only on a satisfied DB contract; the plan verifies the drift is
      actually resolved, not masked).

## G. Validation
Docs-only change. `tsc`/`lint`/tests are unaffected (no code/test files). CI must still pass on the PR.

## H. Stop state
After this PR merges and main is verified green, **Phase 4 readiness is complete**. The next action —
running the production migration — is **blocked on the explicit owner approval phrase** (§D). No
further phase begins without new owner instruction.

## I. If/when the owner approves (future, separate action)
Follow `MIGRATION_RUNBOOK.md` (Item 1) → take snapshot → `prisma migrate deploy` on the production
DIRECT URL → run `POST_MIGRATION_CHECKLIST.md` §6 → classify per §9. Stop on any failure (§7) and
restore (§8). Capture evidence (status codes + classifications; no secrets) into a new
`EVIDENCE_LEDGER.json` run record.
