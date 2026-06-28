# OPSIQ FULL REPO JARVIS — FINAL READY AUDIT

Branch `claude/full-repo-jarvis-db-blocker-closure`. Honest end-state after the final closure pass.
GitHub Actions runners healthy.

| # | Readiness criterion | Status | Evidence |
|---|---|---|---|
| 1 | No BLOCKER/CRITICAL/HIGH **code/schema** gaps remain | ✅ | DB-01/02/05, ISO-02, DB-03 closed; owner-flow safety (budget/diagnosis/UI/proof/training) closed prior |
| 2 | Full DB suite green | ❌ OPEN | Pre-existing flaky suite (snapshot_data/canonical_events/owner_financial_snapshots); diagnostic lane added but the single-worker suite runs 20+ min and did not yield a clean failure list this pass |
| 3 | `ci.yml` green or red is infra-only | ⚠️ | Red is flaky **tests** (same on main), not infra; not yet stabilised |
| 4 | Playwright owner-flow lane exists and passes | ⚠️ PARTIAL | Lane implemented (`owner-e2e.yml`); the app **boots in CI** (build+seed+`next start` succeed — `next-server` running) but the browser test step fails (login/render assertion) — not yet green |
| 5 | DB schema/migration gaps closed | ✅ CI-proven | run `28338068307` (migrate deploy of all migrations + `[db]` proof) |
| 6 | Budget contradiction closed | ✅ | GAP-BUDGET-01/02 (prior pass) |
| 7 | Diagnosis unsafe-advice closed | ✅ | GAP-REC-01 (prior pass) |
| 8 | Legacy UI closed | ✅ | GAP-UI-01/02/03/04 (prior pass) |
| 9 | Workspace isolation proven | ✅ | bizScope owner gate; ISO-02 (engagement NOT NULL+index); schema-hardening tests |
| 10 | Owner DB-route loop proven | ✅ CI-proven | `owner-loop.db.test.ts` green in run `28338068307` |
| 11 | Browser owner flow proven | ❌ OPEN | see #4 — lane built, not yet green |
| 12 | No repo-wide bypass contradicts Jarvis gates | ✅ | budget gated, diagnosis advisory, proof FSM single-writer, RBAC 133/133 (prior audits) |
| 13 | Cascade audit complete | ✅ | GAP-DB-02 broader sweep: proof/audit/event records protected; operational cascades classified safe + regression-guarded (`schema-hardening.test.ts`) |
| 14 | Behavioral validation may start | ❌ NOT YET | criteria 2, 4, 11 open |

## What is genuinely closed and CI-proven this lineage
- GAP-DB-01 (schema/migration drift incl. active missing table) — run `28337363604`.
- GAP-DB-05 (`migration_lock.toml`).
- GAP-DB-02 (governed verification proof RESTRICT) + **broader cascade audit complete** — run `28338068307` + `schema-hardening.test.ts`.
- GAP-ISO-02 (Engagement workspaceId NOT NULL + index) — run `28338068307`.
- GAP-DB-03 (duplicate dead entities removed).

## What remains OPEN (honestly, not deferred)
- **GAP-CI-FLAKE-01** — full DB suite not yet stabilised. The diagnostic lane (`flake-diagnose.yml`, JSON
  reporter) was added to extract the exact failing tests, but the single-worker full suite is extremely
  slow (20+ min, possibly a hanging test) and did not complete with a clean failure list in this pass. The
  failure **classes** are known (canonical_events DELETE attempts, snapshot_data FK on workspace delete,
  owner_financial_snapshots duplicate period key) with a precise remediation (per-test `randomUUID`
  workspaces/businesses/periods; never `deleteMany` canonical_events; create workspace before snapshot).
  Pre-existing and red on main (`28336343760`).
- **GAP-E2E-01** — browser owner-flow lane (`owner-e2e.yml`) implemented and the app boots in CI; the
  Playwright test step (login → owner control center render) is not yet green and needs 1–2 iterations on
  the auth/selector flow.

## Honest classification
**REMAINING_GAPS_OPEN** — all BLOCKER/CRITICAL/HIGH **code & schema** gaps are CI-proven closed and the
cascade audit is complete, but the full DB suite is not yet green and the browser owner-flow lane is not
yet green. **Behavioral validation may NOT start yet.** Not `DB_SUITE_STABLE_E2E_OPEN` (DB suite not
stabilised), not `E2E_PROVEN_DB_FLAKES_REMAIN` (E2E not proven), not `READY_FOR_BEHAVIORAL_VALIDATION`.
