# OPSIQ FULL REPO JARVIS — GAP CLOSURE BURN-DOWN

Base HEAD: `feade32` (main). Tracks every gap from `OPSIQ_FULL_REPO_JARVIS_HOSTILE_GAP_REGISTER.md`.

Status legend: OPEN · IN_PROGRESS · CLOSED_TESTED · CLOSED_CI_PROVEN · DEFERRED_NOT_BLOCKING · HARD_BLOCKED.

Environment constraint recorded up front (governs the DB slices): **no database is reachable in this
environment** — `docker` daemon is down (no socket), the Neon `DATABASE_URL` is unreachable (P1001), and
main-gate CI is runner-starved (runner_id:0, zero steps). Therefore any fix whose closure standard
requires *migration-deploy proof* cannot be proven here and is marked HARD_BLOCKED with an exact plan,
rather than pushed as an unverifiable migration.

| Gap | Sev | Finding (short) | Required closure | Files likely | Tests | Status |
|---|---|---|---|---|---|---|
| GAP-DB-01 | BLOCKER | ~28 owner diagnosis/decision/action/harm models in schema, never migrated, no tables; `owner_input_quality_assessments` is **actively called** (recommendation-input-quality/confidence services) against a non-existent table | additive migration for the *used* table(s) + remove genuinely-dead models; deploy-prove | prisma/schema.prisma, prisma/migrations, recommendation-*-quality/confidence services | prisma validate/generate, migrate deploy, DB tests | **HARD_BLOCKED** (needs DB) — diagnosis + plan recorded |
| GAP-BUDGET-01 | CRITICAL | budget action completion bypasses owner-action gate | call `enforceOwnerActionGates` before material transition + register path | owner-budget/action-link.service.ts, material-gate-registry.ts | gate-called, blocks-when-unsafe, isolation | IN_PROGRESS |
| GAP-UI-01 | CRITICAL | legacy decision page renders governance over MOCK data | guard/retire so production cannot mistake it for real governance | app/decisions/[decisionId]/page.tsx | renders-disabled-notice | IN_PROGRESS |
| GAP-DB-02 | CRITICAL(latent) | unsafe `onDelete: Cascade` over governed records; **no runtime delete path** | restrict cascade / forbid governed delete; migration | schema.prisma | cascade/no-delete | **HARD_BLOCKED** (needs DB) — latent, plan recorded |
| GAP-BUDGET-02 | HIGH | spend committed regardless of HOLD/REQUIRE_OWNER_APPROVAL | enforce decision as a barrier (block unless override) | owner-budget/budget.service.ts, domain/owner-budget/spend-governance.ts | hold-blocks, override-allows, audit | IN_PROGRESS |
| GAP-REC-01 | HIGH | `/api/diagnosis` persists un-arbitrated owner-actionable advice | persist as advisory/unverified, not owner-actionable without arbitration | services/diagnosis.ts | persisted-advisory, not-actionable | IN_PROGRESS |
| GAP-UI-02 | HIGH | DecisionActionPanel posts without required workspaceId | add workspaceId to calls | components/decisions/DecisionActionPanel.tsx | includes-workspaceId | IN_PROGRESS |
| GAP-UI-03 | HIGH | outcome buttons POST to 404 `/success` `/failure` | point to `record-outcome` / `fail` | dashboard/decision/[id]/DecisionDetailView.tsx | calls-existing-route | IN_PROGRESS |
| GAP-ISO-01 | HIGH | legacy consulting models isolate by join, not column workspaceId | guardrail/audit; (schema column change needs DB) | many legacy services | isolation | DEFERRED_NOT_BLOCKING (owner loop column-scoped; plan recorded) |
| GAP-ISO-02 | HIGH | `Engagement.workspaceId` nullable + unindexed | non-null backfill + index (migration) | schema.prisma | — | **HARD_BLOCKED** (needs DB) |
| GAP-DB-03 | HIGH | duplicate Recommendation/Action entities | consolidate / mark legacy `@@ignore` | schema.prisma | — | DEFERRED_NOT_BLOCKING (live entity unambiguous; plan recorded) |
| GAP-CI-01 | HIGH | main-gate CI runner-starved; browser lane absent | add browser lane to ci.yml (yaml); document infra abort | .github/workflows/ci.yml | workflow-valid | IN_PROGRESS (yaml) + CI_INFRA_ONLY |
| GAP-UI-04 | MEDIUM | override reason stripped by route schema | accept + persist override reason | api/decisions/[decisionId]/route.ts, lifecycle svc | reason-reaches-server | IN_PROGRESS |
| GAP-ISO-03 | MEDIUM | `completeTraining` update by id only, no workspace guard, no audit | add workspaceId to where + emit audit | owner-mode/staff-training.service.ts | isolation, audit | IN_PROGRESS |
| GAP-PROOF-01 | MEDIUM | `approveOutcomeVerification` no recorder-vs-verifier SoD | block self-verify | outcome/verification-approval.service.ts | self-verify-blocked | IN_PROGRESS |
| GAP-PROOF-03 | MEDIUM | decision outcome on separate FSM (mitigated: forced unverified) | confirm + test | decision-lifecycle/outcome | unverified-forced | DEFERRED_NOT_BLOCKING (mitigation verified) |
| GAP-REC-02 | MEDIUM | intelligence/recommendations skips arbitration | mark advisory (not persisted governed) | api/intelligence/recommendations | advisory | DEFERRED_NOT_BLOCKING (not persisted governed) |
| GAP-DB-04 | MEDIUM | orphaned models incl InterventionState | remove dead models (schema-only, no DB) | schema.prisma | validate/generate/tsc | DEFERRED (bundled w/ DB-01 plan) |
| GAP-PROOF-02 | LOW | markSuccess/markFailure ungated dead code | remove or guard | execution/execution-service.ts | unreachable | IN_PROGRESS |
| GAP-REC-03 | LOW | owner-now-view unsafeToGuide hardcoded false | defense-in-depth (secondary gates cover) | owner-now-view.service.ts | — | DEFERRED_NOT_BLOCKING |
| GAP-REC-04 | LOW | dormant ungated advisory/LLM engines | no route caller | ai/*, growth/* | — | DEFERRED_NOT_BLOCKING (unreachable) |
| GAP-PROOF-04 | LOW | owner actions self-attested evidence (by design) | classified | owner-*/action.service.ts | existing | DEFERRED_NOT_BLOCKING (by design) |
| GAP-DB-05 | LOW/INFO | Engagement index gap; migration_lock.toml absent | index (DB) + add lock file | migrations | — | PARTIAL (lock file local; index HARD_BLOCKED) |
| GAP-CI-03 | MEDIUM | 23 quarantined test files | tracked debt | quarantine.json | — | DEFERRED_NOT_BLOCKING (acknowledged) |
| GAP-CI-04 | MEDIUM | DI-only blind spots (budget/UI) | new route/service tests via this closure | tests | added in slices 2-7 | IN_PROGRESS |

Closure commits and evidence are appended to `OPSIQ_FULL_REPO_JARVIS_GAP_CLOSURE_REPORT.md`.
