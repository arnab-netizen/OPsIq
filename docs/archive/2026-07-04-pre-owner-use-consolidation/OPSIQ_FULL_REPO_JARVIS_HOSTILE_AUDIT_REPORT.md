# OPSIQ FULL REPO-WIDE JARVIS HOSTILE AUDIT REPORT

## 1. Scope statement
This is a **full repo-wide** read-only hostile audit of OpsIQ on `main`, audited from first principles —
**not** limited to the Jarvis 360 branch, owner-mode files, prior reports, or top gaps. Every API route,
service, domain engine, recommendation/advisory path, finance/budget path, proof/completion path, UI
caller, Prisma model, migration, CI workflow, and the composed system were inspected. Default stance:
*not repo-wide proven = not safe.* No source, test, migration, or workflow was modified. Findings were
verified by reading the cited code; agent results were independently spot-checked and severities
calibrated to runtime reachability.

## 2. Branch / HEAD / status
- Branch: `main` · HEAD: `fc65b3d` (audited code = merge commit `227b034`; HEAD adds only audit docs).
- Working tree: clean (only audit report files created by this prompt are added).
- Previous main HEAD: `5385d26` · Merge commit: `227b034` (parents `5385d26` + `c7cd674`).

## 3. Commands run (on the merged tree)
| Command | Result |
|---|---|
| `npx tsc --noEmit` | exit 0, clean |
| `npm run build` (next build) | compiled + full route manifest, success |
| `npm run governance:scan:strict` | 36 frozen / 0 new → pass |
| `npm run audit:wrapped-handlers:ratchet` | 29 baseline / 0 new → pass |
| `npm run lint:ratchet` | 2154 ≤ 2155 baseline → pass |
| `npx prisma validate` | valid |
| `vitest run src/__tests__/owner-mode src/__tests__/owner-budget` | 368 passed, 23 `[db]` skipped |
| DB lane (`TEST_WITH_DB=true` full vitest) | **NOT runnable locally** (no Postgres / Prisma engine fetch blocked) — runs in CI only |
| Playwright | **NOT run** (not in the main CI gate; 6 specs exist in `tests/browser/`) |

## 4. CI evidence inspected
- `5385d26` (prev main) run `28308777696` — **success**. Parents of the merge are green on identical code.
- `227b034` (merge) run `28334628190` — **failure, infrastructure abort**: both jobs `runner_id:0`, ~1s, zero steps.
- `ab95175` (docs-only) run `28334829907` — **failure, identical abort** (`runner_id:0`, 2-3s, zero steps). A docs-only commit aborting the same way proves the failure is GitHub Actions runner unavailability, not code.
- API re-run refused (`403 Resource not accessible by integration`). **No green post-merge CI observed** (GAP-CI-01).
- vitest runs in 6 workflows; Playwright only in `lane-b-db-test.yml` (not `ci.yml`). Quarantine: 23 files / 52 failing tests, non-blocking (GAP-CI-03).

## 5. Route inventory summary
- 302 API route files; 170 define a mutation method (POST/PUT/PATCH/DELETE).
- 273/302 carry an auth/enforcement symbol; **all 133 owner routes** use `withCanonicalEnforcement`.
- 6 mutation routes without a wrapper — all legitimately protected (signup/login bcrypt-session, Stripe signature fail-closed, `submit-external` disabled, internal demo diagnostic-key-gated). **No unprotected business-state mutation route.**

## 6. Mutation / recommendation path inventory (gating posture)
| Path class | Gated? | Notes |
|---|---|---|
| Owner-domain actions (7 services) | ✅ owner-action gate before persist | registry-enforced regression test |
| DelegatedTask completion | ✅ proof FSM (sole writer) | self-review/duplicate/stale blocked; AI cannot accept |
| Recommendation promotion | ✅ `enforceOwnerGatesForPromotion` (single chokepoint, `recommendation.ts:720`) | cash/margin/confidence/business-impact |
| Recommendation generation via `/api/diagnosis` | ❌ un-arbitrated, un-gated (GAP-REC-01) | persisted; promotion still gated |
| `/api/intelligence/recommendations` | ⚠️ data-sufficiency only (GAP-REC-02) | no arbitration/cash/margin; not persisted governed |
| **Budget action completion** | ❌ **bypasses owner-action gate** (GAP-BUDGET-01) | not in material-gate registry |
| **Budget spend commit** | ❌ **HOLD decision advisory only** (GAP-BUDGET-02) | row persisted regardless |
| Budget line allocation | ⚠️ advisory reassess (GAP-BUDGET-03) | no override reason |
| Owner approvals | ✅ memory/standing-instruction auto-handle | workload reduction operational |
| Decision lifecycle outcomes | ⚠️ separate FSM; forced `unverified` (GAP-PROOF-03) | verify SoD weak (GAP-PROOF-01) |
| AI/LLM advice | ✅ guardrail but **dormant** (no route caller) | latent (GAP-REC-04) |

## 7. DB / model / migration audit
- 193 models; 167 CREATE TABLE across 93 migrations.
- **BLOCKER (GAP-DB-01):** ~28 owner diagnosis/recommendation/decision/action/harm/learning models declared in schema with **no migration and no code** (`owner_recommendations`/`owner_decisions`/`owner_actions`/`owner_harm_events` verified absent). Schema is ahead of the DB; the canonical owner decision/harm lifecycle is declared but unrealized. The proven owner spine uses a **separate, migrated** table set and is unaffected.
- **HIGH (GAP-DB-02, latent):** unsafe `onDelete: Cascade` from `OwnerBusiness`/`ClientAccount` over governed records — but **no runtime delete path exists**, so latent.
- **HIGH (GAP-DB-03):** duplicate/collapsed Recommendation (×3) and Action entities.
- **HIGH (GAP-ISO-01/02):** legacy consulting models isolate by `engagementId` join, not column `workspaceId`; `Engagement.workspaceId` nullable + unindexed.
- **MEDIUM (GAP-DB-04):** orphaned models incl. `InterventionState` (a mandated dimension).
- Migrations are additive and ordered (no `DROP TABLE`/`DROP COLUMN`; merge sequence clean); `migration_lock.toml` absent.

## 8. UI caller audit
- **CRITICAL (GAP-UI-01):** legacy `/decisions/[decisionId]` page renders Approve/Reject/Override over hardcoded MOCK data + empty audit trail — a fake governed surface.
- **HIGH (GAP-UI-02):** `DecisionActionPanel` posts without the route-required `workspaceId` → all actions fail generically; reason hidden.
- **HIGH (GAP-UI-03):** `DecisionDetailView` posts outcomes to non-existent `/success` and `/failure` routes (real: `record-outcome`/`fail`) → outcome recording silently 404s (breaks the validation feedback loop).
- **MEDIUM (GAP-UI-04):** override reason stripped by the route schema; client-supplied timestamp ignored.
- **Healthy:** owner command center + owner budget page use secured routes, surface server rejections (409 gate/proof blocks), render approvals-avoided + reassessments-due; no client-only role gating; no UI calls public/demo routes.

## 9. Test / CI audit
- Owner spine: unit + service + `[db]` coverage, regression-locked (gate-registry, completion-bypass). Strong.
- **Gaps:** no route-contract test caught the budget gate bypass (GAP-BUDGET-01/02) or the decision-UI route drift (GAP-UI-02/03) → DI-only coverage missed them (GAP-CI-04). Browser flow not in the main gate (GAP-CI-02). 23 quarantined files (GAP-CI-03). Main-gate CI runner-starved (GAP-CI-01).

## 10. Composition audit
- Owner can complete one business loop from the command center (proven service + `[db]`). ✅
- **Budget module can approve/commit what Jarvis would block** (GAP-BUDGET-01/02). ❌
- Diagnosis emits advice outside arbitration; action still gated. ⚠️
- Proof FSM not bypassable by the verify module ✅; outcome-verification SoD weak ⚠️.
- No cross-workspace influence in owner-mode ✅; legacy path discipline-dependent ⚠️.
- Manager/operator cannot mutate owner-only state (server-enforced) ✅; no public/demo exposure ✅.

## 11. All gaps found
1 BLOCKER (GAP-DB-01), 3 CRITICAL (GAP-BUDGET-01, GAP-UI-01, GAP-DB-02-latent), 9 HIGH
(GAP-BUDGET-02, GAP-REC-01, GAP-UI-02, GAP-UI-03, GAP-ISO-01, GAP-ISO-02, GAP-DB-03, GAP-CI-01,
plus latent GAP-DB-02 reachability), 7 MEDIUM, 4 LOW/INFO. Full detail with file:line, runtime path,
bypass, and status in **OPSIQ_FULL_REPO_JARVIS_HOSTILE_GAP_REGISTER.md**.

## 12. Repo-wide bypasses found
- **Budget action completion** bypasses the owner-action safety gate (GAP-BUDGET-01).
- **Budget spend commit** ignores the HOLD/REQUIRE_OWNER_APPROVAL governance decision (GAP-BUDGET-02).
- **`/api/diagnosis`** generates + persists advice bypassing arbitration (GAP-REC-01; action still gated).
- No proof/completion bypass on the DelegatedTask FSM (core invariant holds).
- No RBAC/auth bypass on any business-state mutation route.

## 13. Duplicate engines / orphaned models / UI-API mismatches / CI gaps
- Duplicate: Recommendation ×3, Action (legacy + dead `OwnerAction` + per-module). Orphans: ~28 un-migrated owner-lifecycle models + ~13 others (incl. `InterventionState`). UI-API mismatch: GAP-UI-01/02/03/04. CI: GAP-CI-01 (runner), GAP-CI-02 (no browser gate), GAP-CI-03 (quarantine), GAP-CI-04 (DI-only blind spots).

## 14. Remaining Jarvis blockers
GAP-DB-01 (schema drift), GAP-BUDGET-01/02 (budget bypass), GAP-UI-01/02/03 (decision UI + feedback loop),
GAP-REC-01 (un-arbitrated advice), GAP-CI-01 (green post-merge CI), GAP-ISO-03 (training isolation/audit).

## 15. May behavioral validation start?
**Not yet.** Behavioral validation requires a trustworthy end-to-end surface. Two conditions are violated:
(a) the budget module can commit decisions the Jarvis gate would block (GAP-BUDGET-01/02) — behavioral
data would be governed inconsistently; (b) the decision-outcome UI posts to 404 routes (GAP-UI-03) — the
predicted-vs-actual feedback loop, which behavioral validation depends on, does not persist. The owner
command-center loop itself is sound and could be validated in isolation, but the repo as a whole is not
ready for system-wide behavioral validation until the budget bypass and the decision-outcome path are
closed (and ideally a green post-merge CI run is observed).

## 16. Final classification
**OWNER_FLOW_DB_ROUTE_PROVEN_BUT_REPO_GAPS_EXIST.**

Rationale: the owner-mode safety spine (gate on all 7 domain services, proof FSM single-writer, do-not-repeat,
self-eval→memory, opportunity, compliance, RBAC 133/133, control center) is genuinely proven at service +
`[db]` layer and unaffected by the merge. But the repo-wide audit found verified CRITICAL/HIGH bypasses
**outside** that spine — the budget module contradicts the Jarvis gates, `/api/diagnosis` emits
un-arbitrated advice, the legacy decision UI is mock/broken, and a 28-model schema/migration drift leaves
the canonical owner decision/harm lifecycle unrealized. Per the classification rules, this is **not**
`READY_FOR_BEHAVIORAL_VALIDATION` (which requires *no* critical/high repo-wide bypass and that
finance/budget not contradict the gates) and **not** `REPO_WIDE_OWNER_FLOW_PROVEN_EXCEPT_E2E` (the gaps
are not E2E-only). The owner DB-route loop is proven; repo-wide gaps remain.
