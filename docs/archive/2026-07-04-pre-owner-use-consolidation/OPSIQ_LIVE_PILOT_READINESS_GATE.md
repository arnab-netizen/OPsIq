# OpsIQ Live-Pilot Readiness Gate

> The exact gates that must ALL be satisfied before OpsIQ may be called `LIVE_PILOT_READY`, and the ordered readiness
> states. This defines the ladder; it does NOT advance OpsIQ up it. Branch `claude/post-corpus-owner-pilot-prep`.

## Readiness states (ordered; a state is claimable only when its predecessor + its own gates hold)
| State | Meaning | Reached when |
|---|---|---|
| **CORPUS_PROVEN** | Broad known-to-unknown simulated reality proven in DB + CI | ✅ NOW — 1,465 counted (1,480 proven) + 50 sims / 427 events, 0 unsafe, 0 live claims |
| **SHADOW_PILOT_PREPARED** | Intake + plan + gates + dashboard defined for a real owner | This prep pack (target of the current work) |
| **SHADOW_PILOT_RUNNING** | A real owner's business is being shadowed (observe + recommend) | When a real owner starts uploading Tier-A data and OpsIQ produces daily plans |
| **LIVE_PILOT_READY** | All gates below satisfied; OpsIQ may drive owner-approved actions | When every gate 1–12 is checked |
| **LIVE_PILOT_RUNNING** | Owner acts on OpsIQ recommendations in the live business | After LIVE_PILOT_READY + owner consent |
| **LIVE_OUTCOME_PROVEN** | Real before/after business metrics show the effect | ONLY after real actuals exist — never before |
| **PUBLIC_SAAS_READY** | Multi-tenant public launch readiness | Explicitly BLOCKED / out of scope here |

## Gates required before `LIVE_PILOT_READY`
1. **Real business data intake completed** — Tier-A intake (revenue, fixed costs, receivables/payables, cash
   obligations + safety threshold) actually loaded for the pilot business.
2. **Missing critical data identified** — every absent Tier-A/B item is explicitly listed and its `need_more_data`
   impact surfaced (no silent gaps).
3. **Owner standing instructions recorded** — the owner's pre-authorised vs reserved decisions captured.
4. **Staff proof workflow ready** — staff can upload proof photos/logs; proof requirement enforced on completions.
5. **Financial baseline created** — cash/margin/runway baseline computed from real figures.
6. **Workload baseline created** — current owner-touch/escalation load measured as the reduction baseline.
7. **Customer complaint baseline created** — complaint rate/theme baseline established.
8. **Daily/weekly review cadence defined** — the owner's review rhythm set and wired to reassessment triggers.
9. **Proof / reassessment loop active** — every recommendation carries a proof requirement + a reassessment trigger.
10. **Expected-vs-actual tracking active** — each recommendation stores expected decision/impact and records the actual.
11. **No live-profit claim until actual result exists** — `LIVE_OUTCOME_PROVEN` withheld until real before/after metrics.
12. **Public SaaS remains blocked** — no multi-tenant/public-launch work; SaaS stays out of scope.

## Hard invariants that never relax across states
- No unsafe/irreversible action ever auto-"proceeds"; material calls stay owner-gated; boundaries/fraud block.
- Confidence never "high" without real provider-backing.
- No live-outcome/profit claim until gate 11 is genuinely met with real metrics.
- Public SaaS (gate 12) stays blocked regardless of pilot progress.

## Current position on the ladder
OpsIQ is at **CORPUS_PROVEN** and, on completion of this prep pack, **SHADOW_PILOT_PREPARED**. It is NOT
`LIVE_PILOT_READY` (gates 1–10 require a real business's data, which does not exist yet) and NOT `LIVE_OUTCOME_PROVEN`
(no real actuals). This document defines the gate; it does not cross it.
