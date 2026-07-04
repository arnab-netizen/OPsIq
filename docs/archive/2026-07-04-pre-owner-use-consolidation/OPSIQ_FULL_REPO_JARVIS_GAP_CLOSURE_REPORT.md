# OPSIQ FULL REPO JARVIS — GAP CLOSURE REPORT

1. **Branch:** `main`
2. **Base HEAD:** `feade32`
3. **Final HEAD:** (this commit — see git log; closure commits `5d7ac1a`, `53fd3ad`)
4. **Working tree:** clean
5. **Total gaps:** 24
6. **Gaps closed (locally proven):** 10 — GAP-BUDGET-01, GAP-BUDGET-02, GAP-UI-01, GAP-UI-02, GAP-UI-03, GAP-UI-04, GAP-ISO-03, GAP-PROOF-01, GAP-PROOF-02, GAP-REC-01.
7. **Gaps still open / HARD_BLOCKED (environment):** 4 — GAP-DB-01 (BLOCKER), GAP-DB-02 (CRITICAL, latent), GAP-ISO-02 (HIGH), GAP-CI-01 (HIGH, CI infra).
8. **Deferred non-blockers:** GAP-ISO-01, GAP-DB-03, GAP-DB-04, GAP-DB-05, GAP-REC-02/03/04, GAP-PROOF-03/04, GAP-CI-03.
9. **CI infra-only:** GAP-CI-01 — main-gate CI is runner-starved (runner_id:0, zero steps; reproduced on a docs-only commit). Cannot be fixed from the repo.
10. **Files changed:** `owner-budget/action-link.service.ts`, `owner-budget/budget.service.ts`, `owner-mode/material-gate-registry.ts`, `domain/constants/audit-events.ts`, `owner-mode/staff-training.service.ts`, `app/decisions/[decisionId]/page.tsx`, `app/dashboard/decision/[id]/DecisionDetailView.tsx`, `app/api/decisions/[decisionId]/route.ts`, `services/decisions/decision-lifecycle.service.ts`, `services/outcome/verification-approval.service.ts`, `services/execution/execution-service.ts`, `services/diagnosis.ts`, `__tests__/owner-mode/staff-training.test.ts`, `.claude/governance-baseline.json`.
11. **Migrations added:** none (see §15 — DB migrations are HARD_BLOCKED here; none were authored unverifiably).
12. **Tests added:** 2 DI tests for `completeTraining` (workspace isolation + audit). Existing budget gate coverage extended to budget via the `material-gate-registry.test.ts` registry entry.
13. **Commands run:** `tsc --noEmit` (clean), `next build` (compiles), `governance:scan:strict` (0 new), `lint:ratchet` (clean), `audit:wrapped-handlers:ratchet` (clean), `vitest` owner-mode+owner-budget (371), diagnosis (24), decisions/outcome (458), `prisma validate` (valid). DB-lane + Playwright not runnable (no DB / runner-starved).
14. **CI runs checked:** prior main runs — parents green (`5385d26`); merge `227b034` + docs `ab95175` aborted infra (no runner). New closure commits will trigger CI but the runner-starvation persists; documented, not pretended green.
15. **DB / migration status:** **HARD_BLOCKED.** No DB reachable (`docker` daemon down; Neon P1001; CI runner-starved), so migration authoring/deploy proof is impossible here. Verified diagnosis: ~28 owner diagnosis/decision/action/harm models are declared but never migrated, and `owner_input_quality_assessments` is actively called against a missing table. Exact safe remediation recorded in `OPSIQ_FULL_REPO_JARVIS_POST_FIX_AUDIT.md` (run `prisma migrate dev` for the used table; remove or migrate the dead models; restrict governed cascades; non-null+index `Engagement.workspaceId`). No unverifiable migration was pushed.
16. **Budget contradiction status:** **CLOSED.** Budget action completion now passes `enforceOwnerActionGates` (cash/cashflow/compliance/do-not-repeat) and is registry-guarded; spend HOLD/REQUIRE_OWNER_APPROVAL is enforced into a non-committed state + audited unless explicitly overridden. Budget can no longer commit what the Jarvis gate would block.
17. **Diagnosis / recommendation status:** **CLOSED for the safety property.** Diagnosis advice is persisted as low-reliability AI proposals in non-actionable status; it cannot become owner-actionable without the gated promotion path. (Arbitration-on-promotion is a tracked follow-up, not a born-validated bypass.)
18. **Legacy decision UI status:** **CLOSED.** Mock-governance page redirects to the canonical secured route; outcome buttons hit the real `record-outcome`/`fail` routes; override reason is persisted; the broken panel is unreachable.
19. **Isolation status:** training completion is now workspace-scoped + audited (GAP-ISO-03 CLOSED). Legacy consulting-model column-vs-join isolation (GAP-ISO-01) and `Engagement.workspaceId` non-null+index (GAP-ISO-02) require schema migration → HARD_BLOCKED; the owner-mode loop is already column-scoped and safe.
20. **DB cascade / schema status:** HARD_BLOCKED (needs migration). Latent only — no runtime delete path reaches the governed cascades.
21. **Proof / outcome verification status:** proof FSM invariant intact; outcome-verification self-verify blocked (GAP-PROOF-01 CLOSED); dead ungoverned writers fail-closed (GAP-PROOF-02 CLOSED).
22. **Playwright / browser status:** browser specs exist in `tests/browser/`; not in the main CI gate and not runnable here (runner-starved). E2E remains unproven (E2E_ONLY).
23. **May behavioral validation start?** **No.** One BLOCKER (GAP-DB-01) and the DB-schema CRITICAL/HIGH gaps remain open, HARD_BLOCKED by the absence of a database in this environment. The code-level safety contradictions (budget bypass, diagnosis, decision UI, outcome SoD, training isolation) are closed, so the *owner co-pilot* surface is materially safer — but the prompt's bar (DB blocker fixed) is not met here.
24. **Final classification:** **CRITICALS_CLOSED_HIGHS_OPEN.**
   - All locally-provable code-level CRITICAL/HIGH safety gaps are CLOSED and tested (budget contradiction, mock-governance UI, diagnosis advice, decision-outcome routes, outcome SoD).
   - The remaining open items are exclusively the **DB-migration class** (BLOCKER GAP-DB-01, CRITICAL-latent GAP-DB-02, HIGH GAP-ISO-02) and **GAP-CI-01** (CI runner infra) — every one HARD_BLOCKED by environment (no Postgres, no CI runners), with an exact, ready-to-run remediation. Not `BLOCKER_CRITICAL_HIGH_CLOSED` (the DB blocker is not closed) and not `READY_FOR_BEHAVIORAL_VALIDATION` (its DB-blocker precondition is unmet).

## Merge recommendation
Do not merge yet (and none performed). The closure commits are safe, tested, and reduce real risk, but
the DB BLOCKER must be closed in a database-enabled environment first. Recommended path: run the §15
remediation + the DB-lane and Playwright in CI on a runner-healthy environment, then re-audit.

## Remaining blockers
1. GAP-DB-01 (BLOCKER) — schema/migration drift incl. an actively-called missing table. Needs a DB.
2. GAP-DB-02 / GAP-ISO-02 (CRITICAL-latent / HIGH) — cascade restriction + Engagement workspace non-null/index. Needs a DB.
3. GAP-CI-01 (HIGH) — main-gate CI runner provisioning (infra; outside the repo).
