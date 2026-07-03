# OpsIQ Runtime-Readiness Remediation Tracker

> Master status board for the blockers/majors in `OPSIQ_HOSTILE_READINESS_AUDIT.md`, sliced per
> `OPSIQ_RUNTIME_READINESS_REMEDIATION_PLAN.md`. Statuses: TODO / IN_PROGRESS / PR_OPEN / MERGED / DEFERRED.
> Base: `main @ bfa427a2`. Do not begin a later priority until the prior priority is merged or explicitly authorized.

| ID | Title | Severity | Slice | Status | Branch/PR | Tests | CI | Merge | Notes |
|----|-------|----------|-------|--------|-----------|-------|----|----|-------|
| B1 | Critical ingestion domains (capacity + workload) unwritable | BLOCKER | P0-A | PR_OPEN | `claude/runtime-readiness-p0-ingestion-unblock` | 12 pass (6 route + 6 DB) | pending | no | Enforced write routes added; DB proof of the need_more_data unblock; CSV/UI/browser → P0-B |
| B2 | manual-entry/CSV intake dead-ends (no materialization) | BLOCKER | P0-B | TODO | — | — | — | no | Next slice after P0-A |
| B5 | Proof loop production-inert (no proof ever demanded) | BLOCKER | P1-A | MERGED | `#81` (squash `b793792`) | 6 DB pass (create-path wiring, gate blocks, submit works, loop closes, no-proof frees, isolation) + 508+1521 no-regression | green | yes | Create path added (POST /api/owner/tasks → assignDelegatedTask): task+proofRequirement+PENDING_SUBMISSION proof wired so completeTask gate fires. Owner assignment UI/browser → P1-B. No FSM/gate change |
| M5 | Owner workload / standing instructions unwritable | MAJOR | P1-B | TODO | — | — | — | no | Workload half rides P0-A; standing-instructions in P1-B |
| B3 | No quantified profit/growth upside reaches owner | BLOCKER | P2-A | MERGED | `#82` (squash `a6c5f99`) | 4 supporting-figures + 5 component pass; 1090 corpus/owner-mode no-regression | green | yes | Threads already-computed runway/monthly-net/receivables into a read-only "Supporting figures" block on the supervisor summary. Contract-margin/net-ROAS excluded until M3/P2-B; break-even not computed live (noted). No fabrication |
| M3 | Hardcoded margin constants (18/22/30) in live plan path | MAJOR | P2-B | PR_OPEN | `claude/runtime-readiness-p2b-margin-constants` | 2 M3 + 11 scenario-binding pass; 1092 corpus/owner-mode no-regression | pending | no | Injection replaced with the owner's REAL revenue/costOfGoods; paymentTermsDays omitted (no snapshot field). below_margin still binds from real data (bad_contract scenario green). No fabrication |
| B6 | Decision/operator learning store write-only | BLOCKER | P3-A | MERGED | `#84` (squash `5acd162`) | 5 learning-readback pass; 2366 services no-regression (1 pre-existing unrelated legal-text fail) | green | yes | Recommendation path now reads real OperatorItem prior-failure history (workspace-scoped) and lowers confidence + discloses. Pure, no new store. Dead store found to write to a NONEXISTENT table (throws/swallowed) → M7 deletes it next |
| M7 | Two learning subsystems (one dead) — duplicate split | MAJOR | P3-A2 | MERGED | `#85` (squash `86db5b8`) | 114 execution/operator/intelligence + 2366 services no-regression (same pre-existing legal-text fail) | green | yes | Deleted dead non-persisting store (learning/store.ts, metrics/decision-metrics-service.ts + ignored test) + swallowed writer calls in operator/store + execution-service. Lint errors 2155→2112. No behavior change |
| M9 | Outcome loop records but does not steer recommendations | MAJOR | P3-A3 | MERGED | `#86` (squash `433f28c`) | 5 steering + 184 owner-budget + 61 owner-budget-DB no-regression | green | yes | composeUpdatedPlan now reads persisted FundedInitiativeOutcome; a prior FAILED (safeForLearning) initiative DEFERS the matching candidate + adds guard signal + what-not-to-do. reassessBudget loads the history. No new store |
| M8 | Scheduled reassessment is dead code | MAJOR | P3-B | MERGED | `#87` (squash `75a1294`) | 4 due-scanner DB + 3 route-auth + 1 trigger + 262 owner-budget no-regression | green | yes | scanDueReassessments re-runs reassessBudget for overdue-open OwnerBudgetActions (scheduled_review_due trigger; idempotent per day) via a fail-closed token-gated internal route. No new engine/cron. CI fix: governed error handling |
| B4 (part 1) | Auth route-scanner non-blocking + incorrect-auth routes | BLOCKER | P4-A1 | MERGED | `#88` (squash `960b0dc`) | auth-scanner 0 criticals (was 4); 186 route no-regression | green | yes | Promoted auth-governance-scanner to blocking CI; fixed 4 route-auth criticals (3 pre-existing + M8 route) to typed UnauthorizedError |
| B4 (part 2) | eslint strict-auth violations (dead legacy-auth imports) | BLOCKER | P4-A2 | PR_OPEN | `claude/runtime-readiness-p4a2-strict-auth-eslint` | tsc + ratchet (2112→2098); 1137 route no-regression | pending | no | Removed 14 DEAD legacy-auth imports from 7 canonical routes → strict-auth 30→16. Remaining 16 (active-legacy-auth routes + auth libs) = careful follow-up migrations |
| B4 | Ratcheted/quarantined safety gates (2155 errors, 30 strict-auth) | BLOCKER | P4-A | TODO | — | — | — | no | Drive strict-auth to 0; promote scanner to blocking |
| M1 | Fabricated verified-session authz state | MAJOR | P4-B | TODO | — | — | — | no | Fetch real workspace.isActive + limits |
| M2 | Governed decision transition TOCTOU race | MAJOR | P4-C | TODO | — | — | — | no | updateMany status-guard + count assert |
| M4 | Log-only escalations/alerts | MAJOR | P4-D | TODO | — | — | — | no | Honesty-label delivery state first |
| M6 | Multi-workspace owner pinned to first membership | MAJOR | P4-E | TODO | — | — | — | no | Deterministic orderBy now; switcher later |
| MINOR-1 | Nullable businessId invisibility | MINOR | P0-A/P4 | PR_OPEN | this slice | covered | pending | no | Capacity/workload routes require businessId in path (always plan-visible) |
| MINOR-2 | internal/* diagnostic routes + hardcoded demo-password | MINOR | P4-F | TODO | — | — | — | no | Remove hardcoded credential; gate non-prod |
| MINOR-3 | execution-stub.ts unlocked status→executed footgun | MINOR | P4-F | TODO | — | — | — | no | Delete dead stub |
| MINOR-4 | external-systems `not implemented` throws | MINOR | DEFERRED | DEFERRED | — | — | — | — | External integrations explicitly out of scope |

## Rules
- One slice per PR. No gate weakened. No duplicate engine. No parallel AI brain. No AI autonomy.
- Do not start public SaaS / billing / launch / integrations / external automation until P0–P3 are MERGED and verified.
- Deferrals must be justified in Notes (only MINOR-4 is deferred, because external integrations are out of scope).
- A slice is MERGED only with CI green + a final hostile re-read + all no-regression gates green.

## Current position
P0-A in progress on branch `claude/runtime-readiness-p0-ingestion-unblock`. Nothing merged yet from this tracker.
Honest classification unchanged: `BUSINESS_REALITY_KNOWN_TO_UNKNOWN_READY_MERGED` (corpus/judgment) — runtime-readiness
remains blocked until at least P0–P3 are closed.
