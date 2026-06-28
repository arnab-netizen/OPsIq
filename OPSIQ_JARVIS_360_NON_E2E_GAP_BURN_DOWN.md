# OPSIQ JARVIS 360 — NON-E2E GAP BURN-DOWN

Live burn-down of remaining non-E2E gaps. Base HEAD `8e31704`. EH-23 (browser E2E) excluded.

| Gap | Status (start) | Exact closure required | Target files | Test required | Final status | Commit |
|-----|----------------|------------------------|--------------|---------------|--------------|--------|
| EH-01 (margin) | PARTIAL | margin gate in owner-action gate for growth/pricing domains; block known-below-floor | owner-action-gate.service.ts | below-margin block / unknown allow | CLOSED_TESTED | Slice 3 |
| EH-14 | OPEN | bind owner completion to proof FSM; legacy verify cannot complete proof-required | task-completion + action services | proof-gated completion route + DB | OPEN | — |
| EH-05 | OPEN | persist + surface arbitration verdict | recommendation gen + schema + UI | verdict persisted/visible | OPEN | — |
| EH-22/EH-06 | OPEN | runtime seed/import route + DB owner loop | new seed route + [db] test | DB loop | OPEN | — |
| EH-03/EH-04 | OPEN | owner UI action controls | owner page + routes | render/caller test | OPEN | — |
| EH-07/EH-08 | OPEN | live training/process triggers from runtime sources | completion → training/process | trigger tests | OPEN | — |
| EH-15 | PARTIAL | live approval memory in a real owner approval path | approval flow + caller | reuse test | OPEN | — |
| EH-10/EH-19/EH-25 | PARTIAL | memory/self-eval consequences surfaced; live opportunity guardrails | gate + control center | suppress/surface tests | PARTIAL | — |
| EH-17 | OPEN | live marketing/opportunity/contract guardrails | decision flow | reject/defer tests | OPEN | — |
| EH-20/EH-21 | OPEN | compliance boundary runtime + reassessment surfaced | gate + control center | defer tests | OPEN | — |
| EH-28 | OPEN | completion audit inside tx | task-completion.service | — | OPEN | — |
| EH-29 | OPEN | block-metrics window param/documented | owner-block-metrics | — | OPEN | — |
| EH-30 | OPEN | override high-visibility event | gate/completion | override event test | OPEN | — |
| EH-23 | E2E_ONLY | Playwright CI lane | ci | browser | E2E_ONLY_REMAINING | — |

Honest constraint recorded up-front: DB-backed proofs (EH-22 seed persistence, EH-14 DB route test, the
Slice-13 DB owner loop) can be **authored** here but can only be **executed/proven in CI** — there is no
local Postgres in this container (TEST_WITH_DB needs a running DB; the Prisma engine download is also
network-blocked). That is not a hard blocker for authoring, but DB *proof* depends on the CI run.
