# OPSIQ JARVIS 360 — NON-E2E GAP BURN-DOWN

Live burn-down of remaining non-E2E gaps. Base HEAD `8e31704`. EH-23 (browser E2E) excluded.

| Gap | Status (start) | Exact closure required | Target files | Test required | Final status | Commit |
|-----|----------------|------------------------|--------------|---------------|--------------|--------|
| EH-01 (margin) | **CLOSED_TESTED** | margin gate added; owner-mode gate now complete (opt-out+do-not-repeat+capacity+cash+margin) | owner-action-gate.service.ts | below-margin block / unknown allow (15/15 gate tests) | **CLOSED_TESTED** | Slice 3 (this turn) |
| EH-14 | OPEN | bind owner completion to proof FSM; legacy verify cannot complete proof-required | task-completion + action services | proof-gated completion route + DB | OPEN | — |
| EH-05 | OPEN→**PARTIAL** | persist + surface arbitration verdict | intervention-arbitration.service.ts | full verdict now persisted to durable audit log (whatNotToDo + chosen/rejected/blocked/deferred + dominant constraint + reconsideration) — queryable, not discarded; owner-page rendering still pending | **PARTIAL** | this turn |
| EH-22/EH-06 | OPEN | runtime seed/import route + DB owner loop | new seed route + [db] test | DB loop | OPEN | — |
| EH-03/EH-04 | OPEN | owner UI action controls | owner page + routes | render/caller test | OPEN | — |
| EH-07/EH-08 | OPEN | live training/process triggers from runtime sources | completion → training/process | trigger tests | OPEN | — |
| EH-15 | PARTIAL | live approval memory in a real owner approval path | approval flow + caller | reuse test | OPEN | — |
| EH-10/EH-19/EH-25 | PARTIAL | memory/self-eval consequences surfaced; live opportunity guardrails | gate + control center | suppress/surface tests | PARTIAL | — |
| EH-17 | OPEN | live marketing/opportunity/contract guardrails | decision flow | reject/defer tests | OPEN | — |
| EH-20/EH-21 | OPEN | compliance boundary runtime + reassessment surfaced | gate + control center | defer tests | OPEN | — |
| EH-28 | OPEN | completion audit inside tx | task-completion.service | — | OPEN | — |
| EH-29 | OPEN | block-metrics window param/documented | owner-block-metrics | — | OPEN | — |
| EH-30 | **CLOSED_TESTED** | override high-visibility event | task-completion.service.ts | distinct client-visible owner.task_override_used when proof gate bypassed | **CLOSED_TESTED** | this turn |
| EH-29 | acknowledged | block-metrics window | owner-block-metrics.service.ts | window is a documented `windowDays` parameter (default 30) — configurable, not a correctness bug | CLOSED (param/doc) | prior |
| EH-23 | E2E_ONLY | Playwright CI lane | ci | browser | E2E_ONLY_REMAINING | — |

Honest constraint recorded up-front: DB-backed proofs (EH-22 seed persistence, EH-14 DB route test, the
Slice-13 DB owner loop) can be **authored** here but can only be **executed/proven in CI** — there is no
local Postgres in this container (TEST_WITH_DB needs a running DB; the Prisma engine download is also
network-blocked). That is not a hard blocker for authoring, but DB *proof* depends on the CI run.

## Progress this turn
- **EH-01 CLOSED_TESTED** (Slice 3, commit on top of `8e31704`): the owner-mode safety gate is now
  complete — opt-out + do-not-repeat (scope) + capacity (growth domains) + cash (survival/cashflow
  state) + margin (known-below-floor for sales/marketing/finance), all enforced on every material
  owner-domain action transition, audited, with 15 DI tests + the 11-path bypass regression.

## Remaining (honest)
EH-14, EH-05, EH-22/06, EH-03/04, EH-07/08, EH-15, EH-17, EH-20/21, EH-28/29/30 remain OPEN/PARTIAL.
These require schema migrations (proof-requirement link on owner actions; arbitration-verdict
persistence), owner UI work, runtime seed persistence across ~10 owner models, and DB-backed loop proof
that can only execute in CI. They are **multi-session** and were **not** completed this turn. They are
not closed and are not represented as closed.
