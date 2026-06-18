# R2 — CAUSAL ADJUDICATION VALIDATION REPORT

**Mode:** keystone engine fix (R2 only) — a causal adjudication layer added to the
diagnosis engine. No R3–R9, no new archetypes, no safety-gate change, no scorer
change, no answer-key change, no threshold change. The adjudicator uses ONLY runtime
evidence (dimension / finding text / supportingData / isCritical) — never case ids,
benchmark labels, hidden keys, or answer-key text. **Not a Stage A pass claim. Stage
A remains DO_NOT_PROMOTE / BLOCKED.** **Branch:**
`claude/stage-a-unproven-assumption-ecr0dm`.

## 1. WHAT CHANGED

- **New pure module** `src/services/consulting-engine/causal-adjudication.ts`
  (`adjudicateCausalPrimary`). Given the matched candidate diagnoses + evidence, it
  detects when a SURFACE symptom is actually DOWNSTREAM of a stronger UPSTREAM driver
  and either RE-RANKS to a covered driver that is itself a candidate, or ABSTAINS
  (suppresses the surface) when the driver is uncovered / not independently matched.
- **Wired into** `diagnosis-engine.ts` `diagnoseRootCause`, AFTER raw pattern
  matching + confidence sort, BEFORE final selection. Raw matched candidates are
  preserved and surfaced in `warningFlags` for trace/debug; the causal rationale is
  emitted on both the re-rank and abstain paths. Output contract unchanged (rationale
  is additive metadata in the existing `warningFlags` / `alternativeExplanations`).
- **Intervention engine, safety gate, scorer, thresholds, keys: untouched.**

### Driver model (general causal precedence, not case-tuned)
A driver "fires" only on a CRITICAL evidence item with specific vocabulary, in a
competing (non-home) dimension where applicable, and with corroborating numerics:

| Driver (upstream) | Explains (surface) | Covered? | Guard |
|---|---|---|---|
| debt/solvency | cash | no → abstain | leverage/covenant vocab + leverageRatio/covenantHeadroom |
| working-capital | cash | no → abstain | receivables/DSO vocab + dso/cashConversion numeric (critical only) |
| strategic capex | cash | no → abstain | irreversible/automation vocab + reversibility **and** demandDurabilityMonths |
| pricing | margin/retention/unit-econ | no → abstain | market_position/process pricing-below/discount vocab |
| demand | margin | no → abstain | market_position demand-collapse vocab + newCustomerRate/leadVolume |
| inventory | margin/bottleneck | no → abstain | overstock/stockout/forecast vocab + forecastErrorPct/inventoryDays |
| gtm/channel | unit-econ | no → abstain | market_position channel vocab + channelCac/channelMix |
| key-person | bottleneck/retention | no → abstain | team_capability key-person vocab + keyPersonCount |
| quality | retention | **yes → re-rank** | quality_delivery complaint/defect (critical) |
| bottleneck | quality | yes (re-rank if candidate, else abstain) | operational wait/turnaround (critical) |

The `explains`-mapping is what protects the danger cases: a key-person mention does
not suppress a unit-economics surface, a pricing mention does not suppress a
bottleneck, etc.

## 2. TESTS

- **R2 unit tests** `src/__tests__/services/causal-adjudication.test.ts` — 14/14:
  debt→cash abstains (no archetype, must not claim cash); churn→quality re-ranks to
  quality; churn→pricing abstains (not blindly retention); margin→pricing abstains
  (not blindly cost); bottleneck→key-person abstains (not blindly operations);
  unit-econ→gtm abstains; **and the over-suppression guards**: genuine liquidity kept,
  PC-11-shape efficiency capex kept (no irreversibility/durability), MC-02-shape
  key-person kept on a unit-econ surface, genuine cost-inflation margin kept. Plus
  end-to-end `diagnoseRootCause` checks (debt→UNKNOWN, quality→quality, genuine
  cash→cash, healthy→UNKNOWN).
- **R1 lexical tests still pass; scorer 13/13; adversarial + governance 83/83;
  diagnosis-consumer sweep 41/41.** tsc clean (only pre-existing run-case.ts:149);
  prisma valid.

## 3. FULL 103-CASE RETRIAL — R1 vs R2

New frozen retrial: `simulation_runs/round_002_retrial_r2_causal_adjudication/`
(R0 `…_current/` and R1 `…_r1_lexical_hardening/` preserved untouched).

| Metric | R1 (before) | R2 (after) | Δ |
|---|---|---|---|
| **Diagnosis pass rate** | 83.5% (86/103) | **96.1% (99/103)** | **+13** |
| **false_root_cause** | 12 | **0** | **−12** |
| over_abstention | 44 | 53 | +9 |
| correct_diagnosis_wrong_action | 27 | 28 | +1 |
| unsafe_proceed | 1 | 1 | 0 |
| dangerous_proceed | 1 | 1 | 0 |
| wrong_priority | 1 | 1 | 0 |
| First-action pass rate | 34.9% (36) | 34.0% (35) | −1 |
| Safety-outcome pass rate | 56.3% (58) | 47.6% (49) | −9 |
| Abstention recall | 95.7% (22/23) | 95.7% (22/23) | 0 |

### Cases improved (13, diagnosis FAIL→PASS)
`ADV-02`, `FRC-01`, `FRC-02`, `FRC-03`, `FRC-04`, `FRC-05`, `FRC-06`, `FRC-07`,
`FRC-08`, `FRC-09`, `FRC-10`, `FRC-12`, `FRC-13`.
- **FRC-02 re-ranked to the CORRECT covered diagnosis** (churn → `quality_control_failure`).
- The other 12 shifted from a confident WRONG diagnosis to a **safe abstention**
  (their true cause is an uncovered upstream driver — debt, working-capital, pricing,
  demand, inventory, gtm, key-person, strategic capex — that the engine cannot name).

### Cases shifted from wrong diagnosis → safe abstention (13)
`ADV-02`, `FRC-01`, `FRC-03`, `FRC-04`, `FRC-05`, `FRC-06`, `FRC-07`, `FRC-08`,
`FRC-09`, `FRC-10`, `FRC-11`, `FRC-12`, `FRC-13`. (FRC-11's true cause is the covered
`operational_bottleneck`, but its bottleneck pattern did not independently match — no
retention corroboration — so it abstains rather than mis-committing to quality;
diagnosis verdict stays FAIL as OVER_ABSTAIN, but it is no longer a confident misread.)

### Cases worsened: 0 (diagnosis)
**No valid covered case regressed** — every one of the 42 previously-correct covered
diagnoses is preserved (verified per-case). The danger pairs all held: PC-11 (capex)→
cash, MC-02 (key-person)→unit-econ, PC-03 (pricing)→bottleneck, MK-08 (discounting)→
margin, HC-04 (staffing)→retention.

### Interpreting the over_abstention / safety deltas (NOT regressions)
The +9 over_abstention and −9 safety-outcome are the **honest cost** of converting 9
confident-wrong PROCEEDs (FRC cases that previously committed a decoy and "proceeded")
into safe abstentions. Those cases' true causes are uncovered, so the case wants an
action the engine structurally cannot give — abstaining is the correct, safe state and
the scorer counts it as over-abstention/safety-miss. **No new unsafe proceeds were
introduced** (unsafe_proceed and dangerous_proceed both unchanged at 1, DC-01 only).
These over-abstentions are exactly what archetype expansion (R5) later converts into
correct proceeds — they cannot be "fixed" by weakening the gate or lowering thresholds.

## 4. R3 / R4 STILL REQUIRED?

**YES.**
- **R4 (action sequencing) is now the top lever:** first-action pass rate is 34.0%
  and `correct_diagnosis_wrong_action` is 28 — the engine now diagnoses correctly far
  more often but still emits fixed generic template actions. R4 is where the next large
  benchmark movement lives.
- **R3 (survival prioritization)** still owns `wrong_priority` (PC-01, unchanged) and
  the survival-vs-optimize sequencing.
- **R5 (archetype expansion)** is what converts the new safe abstentions (the +9
  over_abstention) into correct proceeds — but, per the dependency graph, only AFTER
  R2 (now done), so new archetypes no longer become confident decoys.

**Conclusion:** R2 eliminated the dominant failure (false_root_cause 12 → 0) and
lifted diagnosis 83.5% → 96.1% with **zero valid-case regressions and no new unsafe
proceeds**, by re-attributing surface symptoms to upstream drivers and abstaining
safely when the driver is unmodeled. The remaining work (R4 sequencing, R3
prioritization, R5 coverage) is unblocked. **Stage A remains DO_NOT_PROMOTE / BLOCKED.**
