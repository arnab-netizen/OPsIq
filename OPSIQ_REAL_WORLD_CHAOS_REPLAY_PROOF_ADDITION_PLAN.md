# OpsIQ Real-World Chaos Replay — Proof Addition Plan (move beyond RUNTIME_REPLAY_PROVEN)

> Test/fixture/report additions only. No production/runtime/UI/service behaviour change. Goal: lift the
> honest ceiling from `CHAOS_REPLAY_RUNTIME_REPLAY_PROVEN` toward `CHAOS_REPLAY_DB_BROWSER_REPRESENTATIVE_PROVEN`,
> without overclaiming.

- **Branch:** `claude/real-world-chaos-replay-audit` · **HEAD:** `d54356af3ce623394fcf377c04d81a53049e3e11`

## Empirical grounding (measured this session, DB-backed)
Seeding the 10 owner-scenario profiles as full real rows and running the real `getOwnerWholeBusinessPlan`:
all 10 → `criticalDomainsAllReal=true`, `confidence=medium`, and resolve to **`blocked`** (proof_fraud,
vendor_compliance) or **`owner_decision_required`** (the other 8). `canProceed=false` for all 10.

**Honest consequence:** the supervisor is **conservative by design** — any binding constraint routes to an
**owner decision** or a **block**; it does **not** emit `proceed`/`cautious_proceed` for a business that has
a binding constraint (a chaos scenario, by definition, does). So realistic chaos action-status coverage is
`{blocked, owner_decision_required, need_more_data}`. We will prove those honestly and **report** that
`proceed`/`cautious_proceed` are not reachable for binding-constraint chaos data (a safety property, not a
gap to fake). This means `REAL_WORLD_CHAOS_REPLAY_READY` (which the prompt ties to a full proceed spectrum)
is **not** honestly claimable; the realistic ceiling is **DB/BROWSER_REPRESENTATIVE_PROVEN**.

## 1. DB-backed chaos scenarios to add (§2)
A new `chaos-db-replay.db.test.ts` seeds **10 isolated** businesses (via `seedScenarioBusiness`, real rows)
and runs the real `getOwnerWholeBusinessPlan`, mapping to the 10 required themes:
1. laundry quality/capacity blocks marketing → `marketing_blocked` (capacity_feasibility)
2. housekeeping fake proof / staff overload → `proof_fraud` (proof_fraud_block)
3. B2B bad payment terms → `bad_contract` (below_margin)
4. multi-location owner workload/control → `multi_location_remote` (owner_workload)
5. restaurant quality vs growth → `delivery_capacity` (capacity_feasibility)
6. high-revenue/profit-loss trap → `cash_crisis` (cash_survival)
7. vendor discount vs quality risk → `vendor_compliance` (compliance_block)
8. cyber/payment-fraud → `proof_fraud` (proof_fraud_block, fraud disposition)
9. good growth opportunity with safeguards → `growth_scale` (profitable_growth)
10. owner decision required with sufficient data → `cash_crisis`/`bad_contract` (owner_decision_required)

Asserts (per scenario): isolated workspace+business rows; data actually read (criticalDomainsRealProviderBacked);
supervisor summary returned; expected dominant; expected action status (blocked / owner_decision_required);
missing-data/confidence behaviour (confidence never high); profit/cash/workload impact where relevant; proof +
reassessment present; **no cross-business / cross-workspace leakage**; no static/fallback (found:false for a
foreign business). Each DB scenario is graded against a **hand-authored independent expectation** (see §3).

## 2. Playwright chaos scenarios to add (§3)
A new `tests/browser/19-chaos-replay.spec.ts` seeds ≥5 chaos businesses and renders the command-center
SupervisorSummary panel in a **real browser** (3 also at mobile viewport): laundry capacity-blocks-marketing,
B2B bad-payment-terms, high-revenue/profit-loss, owner-pressure bad idea, good-growth-with-safeguards. Asserts
the panel renders runtime-fed dominant / action status / do-not-do / missing-data / confidence / impact /
proof-reassessment / owner-delegate, advanced reasoning collapsed, blocked/need-more-data never reads
"Proceed", mobile bounded. Wire into the `owner-pilot-e2e` CI lane. **If a full Next build + Playwright cannot
run in this environment, the spec is authored + CI-wired and executed on PR CI — reported honestly as
CI-pending, not claimed as locally passed.**

## 3. Independent gold cases to add (§4) — reduces circularity
A new `independent-gold.ts` fixture with **15 hand-authored** gold cases (one per category). Each carries a
**hand-authored** expectedDominant / expectedModules / expectedDoNotDo / expectedSafeAction / expectedRationale
/ expectedActionStatus — authored from business reasoning, **not** copied from `arbitrate()` or runtime output,
**not** the corpus `goldSkeleton`. A test runs each through the **real** runtime (and DB for a subset) and
asserts the engine **independently agrees** with the hand-authored expectation (a disagreement is a real
finding, not auto-pass). Lock-before-output + post-output-mutation-fails enforced. This drops circularity to
**LOW** for the 15 independent cases (the 165 derived cases remain MEDIUM and are reported as such).

## 4. Source-breadth additions (§5)
The 15 independent gold cases each carry a **new, distinct real public source** (15 new `SRC-…` records,
schema-valid + privacy-clean, defined test-side so production register is untouched). Used-unique sources
across counted (165 chaos + 15 gold) = 11 + 15 = **26** (≥26 target); the 15 gold categories each gain a
second unique source (≥10 categories with >1 source). New sources span customer reviews, owner complaints,
B2B terms, franchise disputes, staff/vendor issues, cyber/payment fraud, sector failures, high-revenue/low-
profit, shutdown/pivot.

## 5. Action dispositions to cover (§6) — honestly
Prove ≥2 each of `blocked`, `owner_decision_required`, `need_more_data` from real runtime/DB. Attempt a crafted
`cautious_proceed` (mild non-high-risk, owner-approval-free, medium confidence) and a `proceed` (healthy,
high-confidence, low-risk). **If the conservative design does not produce them, report that honestly** rather
than fake — and cap the classification accordingly.

## 6. Minimum-code approach
All additions are test/fixture/spec/report files + (only if required for CI) a workflow YAML edit. No
production/runtime/UI/service code is modified. Reuses `seedScenarioBusiness`, `getOwnerWholeBusinessPlan`,
`runOwnerAdvice`, `buildSupervisorSummary`, `auditReplay`, the `SupervisorSummary` panel, and the source
register's privacy gates.

## 7. Expected classification after proof
Honestly: **`CHAOS_REPLAY_DB_REPRESENTATIVE_PROVEN`** (DB-of-chaos proven + independent gold lowers
circularity + source breadth met + action statuses `{blocked, owner_decision_required, need_more_data}` proven)
— advancing to **`CHAOS_REPLAY_DB_BROWSER_REPRESENTATIVE_PROVEN`** once the chaos Playwright spec executes
green (locally or on PR CI). **Not** `REAL_WORLD_CHAOS_REPLAY_READY`, because the conservative supervisor does
not emit `proceed`/`cautious_proceed` for binding-constraint chaos data (so the full action-status spectrum the
READY gate requires is not honestly demonstrable without changing production logic, which is out of scope).
