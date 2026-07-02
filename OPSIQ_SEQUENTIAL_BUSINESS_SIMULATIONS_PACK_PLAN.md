# OpsIQ Sequential Business Simulations Pack (≥50) — Plan

> Pack 10 of the known-to-unknown corpus (Step 7 of the Business Reality Corpus execution chain). A NEW artifact
> shape: multi-event, time-ordered business SIMULATIONS (not single scenarios). Committed BEFORE implementation,
> per the chain's plan-first rule, and defines the minimum concrete schema/service/interface groundwork so later
> modules (Step 8 final audit + any future outcome-loop work) do not require rewrites.

## 1. Purpose
Prove OpsIQ makes the RIGHT governed decision at each step of a business EVOLVING over time. A simulation is a
time-ordered sequence of 7–30 events; each event is a business-state moment that the REAL `getOwnerWholeBusinessPlan`
path resolves to a decision (proceed / cautious / need_more_data / owner_decision / blocked). Across the sequence
OpsIQ tracks the starting state → per-event decisions + proof + reassessment → a final state, with an expected
actual-vs-expected note, a governed learning note (no promotion), a workload trace, a failure condition, and a
recovery path. This proves the **expected-vs-actual outcome loop (module 9)** and **shadow-pilot / owner-unavailable
(module 30)** surfaces at the sequence level — WITHOUT any live data or new engine. Expected-only, never proven-actual.

## 2. Branch & base
- Branch: `claude/sequential-business-simulations-pack`
- Base: `main` @ `d3b78b95` (PR #74 merge — Ugly/Tail-Risk/Crisis Pack 150). Confirmed present before branching.

## 3. Simulation count & taxonomy
Minimum **50** simulations; final **50**. Each simulation has **7–30 events**. Taxonomy:
| category | sims | events/sim |
|---|---|---|
| `normal_week` | 10 | 7–10 |
| `slow_leakage` | 10 | 10–20 |
| `growth` | 8 | 10–18 |
| `staff_proof_gaming` | 8 | 10–18 |
| `cash_crisis` | 5 | 15–30 |
| `customer_vendor` | 4 | 10–18 |
| `owner_unavailable` | 3 | 10–18 |
| `extreme_crisis` | 2 | 20–30 |
Total **50** simulations (~600–800 events). No filler; each event is a distinct authored business moment.

## 4. NEW schema/interface groundwork (the concrete contract)
`src/domain/scenarios/business-simulation.ts` — a zod schema + types, the minimum concrete groundwork:
- `SimulationEvent`: `{ eventId, sequenceIndex, dayOffset, title, seed: ScenarioSeedPlan, expectedDecision (action
  status), expectedDominant (Constraint), expectedProofRequired[], expectedReassessment[], workloadImpact
  ("low"|"medium"|"high") }`.
- `BusinessSimulation`: `{ simulationId, category, startingState (string + first-event ref), events[] (7–30, unique
  eventIds, monotonic sequenceIndex + dayOffset), expectedFinalState (string + final disposition), expectedActualVsExpected
  (string, labelled "expected only, not proven actual"), expectedLearning (string, governed re-eval note; NO
  promotion), failureCondition (string), recoveryPath (string), sourceRefs[], independentGold (bool),
  countedForReadiness/synthetic/liveDataBacked (bookkeeping) }`.
- `businessSimulationSchema` with refinements: 7–30 events, unique eventIds, monotonic sequence + non-decreasing
  dayOffset, every event's `expectedDecision`∈ the 5 statuses, `liveDataBacked=false`, a failureCondition + a
  recoveryPath present, `expectedActualVsExpected` carries the "expected only" honesty marker.
This schema is additive and self-contained (does not touch `business-reality-scenario.ts` or any engine); later
modules can import `BusinessSimulation` without a rewrite.

## 5. Mechanism (reuse the DB-proven seed path — NO new engine)
Each event carries a `ScenarioSeedPlan` (the exact primitive the 6 prior packs proved). The DB harness, for each
event, seeds a fresh isolated business to the event's state via the proven `seedScenarioBusiness` +
`chaosScenarioToKnobs`, runs the REAL `getOwnerWholeBusinessPlan`, and asserts the runtime resolves the event's
`expectedDecision` + `expectedDominant` (+ need_more_data provider-gate + safety + proof/reassessment). A simulation
passes iff ALL its events pass. The time sequence is the ordered events; starting state = event 1, final state =
event N. Per-event dominants use only the DB-proven constraints (profitable_growth / cash_survival / below_margin /
capacity_feasibility / owner_workload / compliance_block / proof_fraud_block). No `customer_quality` dependency.

## 6. Per-category evolution design (honest, safety-preserving)
- `normal_week`: healthy routine week — proceed/cautious/owner mix, ends stable.
- `slow_leakage`: gradual margin/complaint/cash drift — early need_more_data → owner_decision as it confirms.
- `growth`: scaling decisions surface — owner-gated, ends owner-decision or stable pilot.
- `staff_proof_gaming`: gaming attempts across the week — blocked (proof_fraud) + owner.
- `cash_crisis`: cash deteriorates event-by-event — owner_decision → blocked (insolvency line); recovery path noted.
- `customer_vendor`: a key account/vendor issue evolves — owner-gated.
- `owner_unavailable`: owner away — decisions HOLD for owner (owner_decision) / escalate; nothing auto-proceeds
  that needs the owner (proves shadow-pilot / owner-unavailable restraint).
- `extreme_crisis`: fraud + safety + legal compound — mostly blocked/owner, recovery path noted.
Every simulation ends with a failureCondition (what breaks it) and a recoveryPath (governed re-evaluation route).

## 7. Sources & gold
~24 privacy-clean composite/sector sources (`SRC-SIM-*`, `sourceRecordSchema`-valid, `privacyRisk` low, no PII),
one+ per category + the routine/boundary/fraud/continuity anchors. **≥10 independent gold** simulations. Every
simulation source-backed.

## 8. Proof plan
- **Schema + invariant tests** (`business-simulation-pack.test.ts`): 50 sims, taxonomy counts, unique simulationIds,
  7–30 events each, unique/monotonic events, schema-valid, source-backed, gold ≥10, every event decision ∈ 5
  statuses, hard safety rules (no event that needs the owner / crosses a boundary / is missing data / is gamed ever
  proceeds; owner_unavailable sims never auto-proceed an owner-gated event; extreme_crisis sims are block/owner
  dominant; every sim has a failureCondition + recoveryPath; expectedActualVsExpected carries the "expected only"
  marker; no live claim).
- **DB proof** (`business-simulation-db.db.test.ts`): walk EVERY event of ALL 50 sims through the REAL
  `getOwnerWholeBusinessPlan`; assert per-event decision + dominant + safety + proof/reassessment; a sim passes iff
  all its events pass; all five statuses appear across the corpus; cross-workspace isolation. Ledger →
  `OPSIQ_SEQUENTIAL_SIMULATIONS_PACK.run.json` (per-sim + per-event pass/fail).
- **Desktop + mobile Playwright** (`41-simulations-desktop.spec.ts`, `42-simulations-mobile.spec.ts`): render a
  representative event from **≥20** simulations desktop + **≥20** mobile; status matches the event's expected
  decision; no boundary/fraud/owner-gated event reads "Proceed"; no horizontal overflow. Shardable via
  `SIM_SHARD_INDEX`/`SIM_SHARD_TOTAL`. CI-gated.
- **CI workflow** (`sequential-simulations.yml`): `sim-db` (all events) + 2-shard `sim-browser` (≥20/≥20). Additive.

## 9. Coverage matrix
Update `OPSIQ_BUSINESS_REALITY_MODULE_COVERAGE_MATRIX.md`: add the 50 simulations (~600–800 events) row; bring the
**expected-vs-actual outcome loop (9)** and **shadow-pilot / owner-unavailable (30)** modules to full coverage;
note the cumulative single-scenario corpus stays 1480 and simulations are counted separately (50 sims).

## 10. Hard rules honoured
No TODO/stub/placeholder. No business logic in UI. Reuses centralized runtime + policy. Additive schema-compatible
data + one new self-contained simulation schema (no change to existing schema → all 1480 prior scenarios stay
valid). Every simulation reduces risk or improves proof coverage. No fabricated volume, no filler, no weakened
gate, no lowered threshold, no deleted test.

## 11. What this pack does NOT claim
- Does **not** prove live outcome/profit improvement — actual-vs-expected is expected-only (no live data;
  `liveDataBacked=false` on all 50). The simulations prove OpsIQ's per-step DECISION correctness over time, not a
  live business result.
- Does **not** make OpsIQ autonomous — owner-gated and blocked events stay owner/professional-routed; the
  `owner_unavailable` sims explicitly prove decisions HOLD for the owner.
- Does **not** solve unknown-unknowns or unblock public SaaS.
- Does **not** promote any learning to a global brain — the learning note is a per-sim governed re-evaluation
  observation, never a promotion.

## 12. Merge gate
Merge only when: DB (all events of all 50 sims) green in CI, desktop+mobile ≥20/≥20 shards green, ALL prior lanes
green (no regression), ratchet unchanged, and a final read-only hostile audit passes. Classification target on
merge: `SEQUENTIAL_SIMULATIONS_PACK_READY`.
