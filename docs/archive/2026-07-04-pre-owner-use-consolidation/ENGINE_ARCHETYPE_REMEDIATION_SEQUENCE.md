# ENGINE ARCHETYPE — REMEDIATION SEQUENCE

**Mode:** planning only — no implementation, no code/scoring/safety-gate/answer-key
change. **Date:** 2026-06-17 · **Branch:** `claude/stage-a-unproven-assumption-ecr0dm`.
**Not a Stage A pass claim.** Maps the taxonomy
(`OWNER_MODE_DIAGNOSTIC_TAXONOMY_COVERAGE_AUDIT.md`) to ranked build slices.

## GLOBAL GUARDRAIL (every slice)
Safety gate (`abstention-engine.ts`, `consulting-safety-adapter.ts`,
`causal-challenge.ts`, `constraint-alignment.ts`) is **frozen**. After each slice:
adversarial suite must stay **10/10 caught, 2/2 controls preserved**; no Round 1
case may move from abstain into an *unsafe* proceed; new committed outputs must
pass B+A+C; scoring per the B4 reproducibility standard; no answer-key leakage.

"Cases unlocked" = Round 1 cases expected to move from improper abstention to a
*correct, gate-passing* committed diagnosis (estimates from the dimension
distribution; financial_health in 50/50).

| Slice | Scope (taxonomy) | Expected cases unlocked | Regression risk | Safety risk | Tests required | Benchmark gate | Re-run safety gate? |
|---|---|---|---|---|---|---|---|
| **E0** | Honest status relabel: `INSUFFICIENT_EVIDENCE` vs `INSUFFICIENT_MODEL_COVERAGE` (reporting only) | 0 (labels only) | **Very low** (no behavior change) | **None** | unit: status-mapping; snapshot of 50 reclassified | counts reclassify; gate decisions byte-identical | **Yes** (prove identical decisions) |
| **E1** | Financial-health archetype family entry (D1–D4 umbrella; minimal margin/liquidity detector) | ~10–20 (financial cases with the clearest signals) | Medium (new committed outputs) | Medium (confident-wrong risk) | unit per trigger; negative-path; adapter wiring | committed rate ↑ on financial cases; suite 10/10; HSW-05 still ABSTAIN | **Yes** |
| **E2** | Split D2 unit-economics / D3 margin / D4 pricing into distinct archetypes | +5–10 (precision on financial subtypes) | Medium | Medium (pricing/discount danger) | per-subtype triggers; contradiction tests | suite 10/10; discount-on-neg-margin still caught | **Yes** |
| **E3** | D1 cash-runway / D11 working-capital / D12 debt-solvency | +5–10 | Medium | **High** (financing/insolvency actions) | liquidity/AR-AP/debt triggers; danger-path | suite 10/10; financing actions gated | **Yes** |
| **E4** | D5 demand / D6 GTM / D10 inventory-forecasting / market-displacement | +5–10 (incl. HSW-01/04/07/09-type real causes) | Medium | Medium | demand/channel/inventory triggers; causation-vs-correlation | suite 10/10; capex-on-surge still caught | **Yes** |
| **E5** | D13 legal/governance / D14 key-person / D15 strategic-capex risk | +3–6 | Medium | **High** (legal + irreversible capex) | legal/people/capex triggers; constraint+danger paths | suite 10/10; HSW-03 legal + HSW-09 capex still caught | **Yes** |
| **E6** | Intervention-quality upgrade (case-tailored first actions across all archetypes) | 0 new commits, but raises pass-rate on committed cases | Medium | Medium (better-sounding wrong advice) | per-archetype specificity; quality re-score (B4 std) | standard-compliant quality score ↑; suite 10/10 | **Yes** |

## DEPENDENCY ORDER
E0 → E1 → E2 → E3 → E4 → E5 → E6.
- **E0 first** (truth-in-labeling; zero behavior risk) so all later "unlocked"
  claims measure against an honest baseline.
- **E1 next** (highest leverage: financial dimension is in 100% of cases).
- E2/E3 deepen finance; E4/E5 add market/legal/people/capital; E6 lifts quality
  to enable any future consultant-grade pass.

## RECOMMENDED FIRST SLICE
**E0 (honest status relabel)** — recommended to implement *first* because it is
zero-behavior-risk, requires only a reporting change + a gate-identical proof, and
establishes an honest baseline (`INSUFFICIENT_MODEL_COVERAGE`) that every
subsequent capability claim is measured against. **E1 (financial-health archetype)
is the first capability slice** immediately after E0 and carries the highest case
leverage.

## EXIT CRITERION
Stage A may be *re-trialed* only after committed-output rate is materially higher
with the safety suite still 10/10, a standard-compliant verified quality metric
exists (E6), RW-005 is adjudicated, and RC-7 residue is bounded. **Until then Stage
A remains BLOCKED.**

## OUT OF SCOPE / STILL OPEN
RW-005 human adjudication; RC-7 semantic residue (model-based verifier, separately
authorized); safety-gate changes (frozen).
