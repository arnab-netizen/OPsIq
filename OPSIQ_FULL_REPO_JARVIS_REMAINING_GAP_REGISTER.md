# OPSIQ FULL REPO JARVIS — REMAINING GAP REGISTER

Branch: `claude/full-repo-jarvis-db-blocker-closure` (base main `2c79c5e`, HEAD `f09a457`).
Closure is proven by GitHub Actions (runners healthy; `ci.yml` + `db-blocker-proof.yml` run on this branch).

Status: OPEN · IN_PROGRESS · CLOSED_LOCAL · CLOSED_CI_PROVEN · DEFERRED_NOT_BLOCKING · HARD_BLOCKED.

| Gap | Source | Sev | Finding | Path | Why it matters | Required closure | Files | Tests | DB/CI proof | Status | Commit/Evidence |
|---|---|---|---|---|---|---|---|---|---|---|---|
| GAP-DB-02 | full-repo audit | HIGH (latent) | 96 `onDelete: Cascade` FKs rooted at `OwnerBusiness` (+ ClientAccount) over governed records (`*Verification`/`*Finding`/`*Action`/snapshots). No runtime delete path exists. | schema FKs | Deleting a business/workspace would silently hard-delete validation evidence + governed records with no audit. | Change governed validation-evidence FKs `Cascade`→`Restrict`; migration; migrate-deploy proof | `prisma/schema.prisma`, new migration | cascade behavior `[db]` | migrate deploy GH Actions | CLOSED_CI_PROVEN | 81c4943; run 28338068307 |
| GAP-ISO-02 | full-repo audit / DB closure | HIGH | `Engagement.workspaceId` nullable + no `@@index([workspaceId])` (relation already `onDelete: Restrict`). | schema + queries | Null-workspace engagements escape workspace filters; unindexed workspace joins. | Add `@@index([workspaceId])`; backfill + `SET NOT NULL` migration (CI-safe on empty DB; documented prod backfill) | `prisma/schema.prisma`, new migration | engagement workspace `[db]` | migrate deploy GH Actions | CLOSED_CI_PROVEN | 81c4943; run 28338068307 |
| GAP-CI-FLAKE-01 | DB closure | MEDIUM | Full `ci.yml` DB suite red on **main and branch** — pre-existing test-isolation races: `canonical_events is append-only` DELETE attempts, `snapshot_data_workspace_id_fkey`, `owner_financial_snapshots` duplicate-key. Not caused by Jarvis changes. | event-sourcing/phase-3 `[db]` tests | Reduces full-suite CI confidence. | Identify offending tests; fix cleanup/keys without weakening assertions; keep a stable DB proof lane authoritative | specific `*.db.test.ts`, `db-blocker-proof.yml` | targeted DB lane | GH Actions | IN_PROGRESS | baseline run 28336343760 (main) red |
| GAP-E2E-01 | full-repo audit | MEDIUM | Playwright/browser not in main gate; owner browser flow unproven. | CI / `tests/browser/*` | Browser owner-flow not proven before usability claims. | Add lane if safe, else precise plan + keep classification below browser-proven | `.github/workflows`, report | browser spec | GH Actions (if added) | IN_PROGRESS (Option B plan) | — |
| GAP-DB-05b | DB closure | LOW | `migration_lock.toml` was absent (added). Verify no other Prisma-tooling gap. | migrations | Prisma tooling needs connector. | Confirm lock present | `prisma/migrations/migration_lock.toml` | n/a | already CI-proven (run 28337363604) | CLOSED_CI_PROVEN | `90deb54` |
| GAP-REC-01-followup | full-repo closure | MEDIUM | Diagnosis advice marked advisory; arbitration-on-promotion is a tracked follow-up (action already gated). | `diagnosis.ts` / promotion gate | Advice quality. | Confirm not a born-validated bypass (already closed); arbitration follow-up non-blocking | — | existing | — | DEFERRED_NOT_BLOCKING | prior closure |
| GAP-ISO-01 | full-repo audit | HIGH | Legacy consulting models isolate by engagement→workspace join, not column. | many services | Discipline-dependent isolation on legacy path. | Owner loop is column-scoped (safe); legacy column migration is large/out-of-scope-risk | legacy schema | — | — | DEFERRED_NOT_BLOCKING | owner loop safe |
| GAP-DB-03 | full-repo audit | HIGH | Duplicate Recommendation/Action entities; `OwnerRecommendation`/`OwnerDecision`/`OwnerAction` removed in DB-blocker work. | schema | Ambiguity. | The dead duplicates were removed (DB-blocker commit `242bf5f`); live entity now unambiguous | `schema.prisma` | — | CI-proven (run 28337363604) | CLOSED_CI_PROVEN | `242bf5f` |
| GAP-PROOF/UI/BUDGET (prior) | full-repo closure | — | Budget gate, diagnosis advisory, decision UI, outcome SoD, training isolation. | services/UI | Owner-flow safety. | Closed + tested in prior pass (commits `5d7ac1a`, `53fd3ad`) | — | existing | — | CLOSED_LOCAL | prior pass |

## Notes
- The owner-mode safety spine, budget gate (GAP-BUDGET-01/02), diagnosis advisory (GAP-REC-01), legacy
  decision UI (GAP-UI-01/02/03/04), outcome SoD (GAP-PROOF-01), training isolation (GAP-ISO-03), and the
  DB blocker (GAP-DB-01) were closed in prior passes; this register tracks the residual HIGH/MEDIUM items.
- This pass: close GAP-DB-02 + GAP-ISO-02 (CI-proven), characterize + triage GAP-CI-FLAKE-01, plan GAP-E2E-01.
