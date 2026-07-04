# OpsIQ Wave 6 — Escalation / Action Schema Fix Report + Tier-2 Hostile Audit

> Standard: `OPSIQ_HOSTILE_RUNTIME_AUDIT_STANDARD.md` v3.0. Audit tier: **Tier 2** (a reachable runtime path that
> threw). **CI was NOT triggered by this work.** Branch `claude/runtime-readiness-wave6-escalation-action-schema`;
> base `main @ ce9a43b6`; working tree at the committed HEAD. Migration-free; no invented column; no gate weakened.

## 1. What changed (diff scope — §9)
| File | Class | Change |
|---|---|---|
| `src/services/escalation.ts` | production service | `detectHighPriorityOverdueActions` rewritten off the phantom `Action.priority`/`dueDate`/`workspaceId` fields: engagement-relation workspace scope + `dueAt` + priority derived from the linked `Recommendation` (two-step lookup). `(a: any)` casts removed. |
| `src/services/action.ts` | production service | `detectOverdueActions` no longer reads `action.priority` or writes the phantom `db.action.update({ data: { priority } })`; keeps honest overdue detection + now passes `workspaceId` to the `ACTION_OVERDUE` audit event (previously fail-safe-dropped). |
| `src/__tests__/services/escalation/overdue-escalation.db.test.ts` | test | 6 DB proofs |
| `*_PLAN.md`, `*_DECISION.md`, this report, `*_EVIDENCE_LEDGER.json` | docs | plan-first + decision memo + audit |
No route/schema/auth/UI/migration/workflow file touched. No threshold/ratchet/scanner/baseline change (§9.3 clean).

## 2. Root cause (§14, §18)
The Prisma `Action` model has **no `priority`, no `dueDate` (it is `dueAt`), and no `workspaceId`** column, and
**no `recommendation` relation object** (only a nullable `recommendationId` scalar). Two "overdue-action
escalation" functions still referenced those phantom fields → `PrismaClientValidationError` at runtime. Wave 1's
`RUNTIME_SCHEMA_QUERY_SWEEP` rescoped other Action/KPI/Finding `workspaceId` queries but missed these two because
they additionally carry the phantom `priority`, whose resolution is a schema decision (memo).

## 3. Claim-to-proof matrix (§10)
| Claim | Required layer | Actual | Evidence | Verdict |
|---|---|---|---|---|
| `detectHighPriorityOverdueActions` no longer throws and returns a `high_priority_overdue` alert for an overdue action whose Recommendation is critical | real DB (un-mocked service) | **DB** | test #1 | PASS |
| Priority is really derived from `Recommendation` (not "any overdue") | DB | **DB** | test #2 (non-critical rec → no alert), #3 (critical rec but not overdue → no alert) | PASS |
| No fabricated priority for actions without a recommendation | DB | **DB** | test #4 (overdue, no rec → no alert) | PASS |
| Workspace isolation | DB | **DB** | test #5 (foreign workspace → no alert) | PASS |
| `detectOverdueActions` no longer throws on the phantom-column write, and records the `ACTION_OVERDUE` audit event; the action is not mutated with a phantom column | DB | **DB** | test #6 (result returned, `action.overdue` audit row present, `version` unchanged = 1) | PASS |
| Add an `Action.priority` column | — | **NOT DONE (by decision)** | decision memo Option (B) | HONEST NON-CLAIM |
| Auto-escalate priority on overdue | — | **NOT DONE (product decision, unwired fn)** | decision memo sub-decision | HONEST NON-CLAIM |

## 4. Reachability (§11)
`detectHighPriorityOverdueActions` ← `checkEngagementEscalations` ← Phase-7 re-evaluation loop
(`re-evaluation.ts:793`) **and** `POST /api/engagements/[engagementId]/escalation-checks`. This is the wired owner
runtime path the fix restores. `detectOverdueActions` has **no production caller** (only `__ignored_tests__`); its
fix removes a latent phantom-write and is non-blocking for the owner shadow-pilot path (decision memo).

## 5. Data lineage (§12)
`Action.dueAt < now` + `status ∈ open` + `Action.recommendationId → Recommendation.priority = "critical"` (same
workspace) → `high_priority_overdue` alert + `ESCALATION_ALERT_HIGH_PRIORITY_OVERDUE` audit event. Priority is read
from the real, existing `Recommendation.priority` (`@@index([priority])`) — no invented column, no fabricated value.

## 6. HTTP / honesty (§20, §22)
No route touched. The service now returns a real alert or `null` (no throw), so the escalation-checks route and the
Phase-7 loop stop turning into 400/500. Incomplete signal (no critical recommendation) → honest `null`, not a
fabricated escalation. No `any`, fallback, placeholder, or stub added; two pre-existing `(a: any)` casts removed.

## 7. Local proof (§4, no CI triggered)
- `tsc --noEmit` ✓ (0 errors); `lint:ratchet` **PASS** (2082 ≤ 2155, `changed_file_lint_errors: 0`);
  `governance:scan:strict` **32 frozen, 0 new**; `governance:scan:auth` **all routes comply**.
- **DB (local Postgres 16)**: `overdue-escalation.db.test.ts` **6/6 pass**.
- **No-regression**: `re-evaluation-workspace-scope.db.test.ts` + `schema-query-sweep.db.test.ts` **8/8**;
  `api/actions.test.ts` **128/128**.

## 8. Final hostile self-audit (§34)
Production or seeded? **Production** — the test drives the real, un-mocked `detectHighPriorityOverdueActions` /
`detectOverdueActions`. Would it have thrown before? **Yes** — the phantom `priority`/`dueDate`/`workspaceId` args.
Priority real or invented? **Real** — read from `Recommendation.priority`; no column added. Isolation proven?
**Yes** (test #5). Fabrication? **No** — no-recommendation and non-critical cases yield `null`. Write-only loop?
**No** — the alert feeds the escalation route/re-eval and emits an audit event. Overclaim? **No** — adding
`Action.priority` and auto-escalating a shared recommendation are explicitly NOT done and are documented decisions.
Any gate weakened? **No**.

## 9. CI status (§1.1 / §35)
**CI was not triggered by this work.** Per the user's instruction, the PR is held until PR #101 (Wave 5) is green;
required CI on this branch is evaluated only after the PR opens naturally. Until then:
`CI_REQUIRED_BUT_NOT_TRIGGERED_BY_AUDIT`.

## 10. Classification
**`OVERDUE_ESCALATION_SCHEMA_RESOLVED_DB_PROVEN`** — the wired escalation path no longer throws and derives priority
from the real `Recommendation` source with DB proof + isolation; the latent phantom-write in `detectOverdueActions`
is removed and its audit event is now recorded; the "add `Action.priority`" / "auto-escalate shared recommendation"
questions are resolved by an explicit decision memo (no guess, no migration). Merge is gated on required CI green +
a final hostile audit after the PR opens.
