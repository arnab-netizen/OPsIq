# R1 — LEXICAL-TRIGGER HARDENING VALIDATION REPORT

**Mode:** narrow engine fix (R1 only) — polarity-aware lexical triggers in
`diagnosis-engine.ts`. No R2–R9, no archetypes, no safety-gate change, no scorer
change, no answer-key change, no threshold change (only unsafe substring triggers
replaced with semantic guards). **Not a Stage A pass claim. Stage A remains
DO_NOT_PROMOTE / BLOCKED.** **Branch:** `claude/stage-a-unproven-assumption-ecr0dm`.

## 1. WHAT CHANGED

`src/services/consulting-engine/diagnosis-engine.ts` only. Replaced bare-substring
triggers with a three-tier semantic guard for all five trigger families:

1. **Adverse NUMERIC** (unchanged thresholds: runway ≤ 6, contribution < 0,
   margin < 0) → always licenses the trigger (hard numbers win).
2. **HARD adverse phrases** (e.g. `out of cash`, `cannot make payroll`,
   `margin erosion`, `operating loss`, `gross margin fell`) → always fire.
3. **SOFT topic terms** (e.g. `runway`, `liquidity`, `burn rate`, `margin`,
   `capacity`, `complaint`, `churn`) → fire ONLY with adverse directionality
   (`ADVERSE_FRAMING`) and NOT under positive framing (`POSITIVE_FRAMING`).

Key design points:
- `POSITIVE_FRAMING` (healthy/strong/long/ample/stable/expanded/…) SUPPRESSES soft
  triggers; `ADVERSE_FRAMING` (fell/declined/shortfall/negative/exceeds/…) LICENSES
  them. Polarity-ambiguous bare words (`low`, `down`, `rising`) are deliberately
  excluded from the global adverse set and handled only inside metric-specific HARD
  phrases, so "input costs are low" (benign) does not fire margin erosion while
  "rising costs"/"gross margin fell" do.
- The liquidity soft topic is intentionally NARROW (`runway|liquidity|burn rate`):
  bare `cash`/`reserve` were tested and REJECTED because they re-introduced false
  positives ("healthy cash reserve", "operating cash flow", "cannot supply cash-flow
  figures"). See §4.
- Operational/quality/retention families already gate on dimension + `isCritical`;
  R1 only ADDS positive-framing suppression (and a severe/critical override for
  quality), so genuine critical-flagged distress still fires unchanged.

No case ids, answer keys, monitor labels, or benchmark labels are read.

## 2. UNIT TESTS (all required cases, 14/14 pass)

`src/__tests__/services/diagnosis-lexical-hardening.test.ts`, run through the real
`diagnoseRootCause`:

| Phrase | Required | Result |
|---|---|---|
| "long reserve runway" | NOT cash crisis | ✓ unknown |
| "healthy cash reserve" | NOT liquidity crisis | ✓ unknown |
| "runway declined to 45 days" | cash crisis | ✓ |
| "burn rate exceeds available cash" | cash crisis | ✓ |
| adverse numeric runway (2 mo) | cash crisis | ✓ |
| "gross margin expanded" | NOT margin erosion | ✓ |
| "gross margin fell due to input costs" | margin erosion | ✓ |
| "input costs are stable and low" | NOT margin erosion | ✓ |
| "NPS stable despite complaints" | NOT quality failure | ✓ |
| "SLA misses doubled and complaints rose" | quality failure | ✓ |
| churn rising | retention erosion | ✓ |
| "repeat purchase rate is strong" | NOT retention erosion | ✓ |
| negative contribution | unit economics | ✓ |
| negative operating margin | margin erosion | ✓ |

Direct probe (proof the documented bug class is gone):
`"long reserve runway and healthy cash"` → `unknown`;
`"runway declined to 45 days"` → `cash_liquidity_crisis`;
`"burn rate exceeds available cash"` → `cash_liquidity_crisis`.

## 3. FULL 103-CASE RETRIAL — R0 BASELINE vs R1

New frozen retrial: `simulation_runs/round_002_retrial_r1_lexical_hardening/`
(the committed R0 baseline `round_002_retrial_current/` is untouched).

| Metric | R0 (before) | R1 (after) | Δ |
|---|---|---|---|
| Diagnosis pass rate | 83.5% (86/103) | 83.5% (86/103) | 0 |
| First-action pass rate | 34.9% (36) | 34.9% (36) | 0 |
| Safety-outcome pass rate | 56.3% (58) | 56.3% (58) | 0 |
| Abstention recall | 95.7% (22/23) | 95.7% (22/23) | 0 |
| false_root_cause | 12 | 12 | 0 |
| over_abstention | 44 | 44 | 0 |
| correct_diagnosis_wrong_action | 27 | 27 | 0 |
| unsafe_proceed | 1 | 1 | 0 |
| dangerous_proceed | 1 | 1 | 0 |
| Healthy-control false positives | 0 (HB-01..08, GD-01 abstain) | 0 | 0 |

**Per-case diff R0→R1: 0 cases changed.** No new unsafe proceeds. Adversarial /
governance suites remain green (83/83 across `adversarial-evaluator` +
`governance/*` including `consulting-safety-adapter`).

## 4. FALSE POSITIVES FIXED / REGRESSIONS

- **Latent false positives removed (robustness):** the engine no longer fabricates a
  cash crisis from benign wording. A first (over-broad) R1 attempt that admitted bare
  `cash`/`reserve` into the liquidity topic was caught BY THE RETRIAL: it newly fired
  `cash_liquidity_crisis` on **R2-AB-01** ("cannot supply cash-flow figures" — a
  data-insufficiency abstention case) and **R2-MK-06** ("operating cash flow turned
  negative" — a working-capital case). The topic was narrowed to
  `runway|liquidity|burn rate`, eliminating both. Final R1 introduces **0** such
  firings.
- **Corpus false-positives fixed = 0** because the healthy/abstention controls were
  already reworded during authoring (the corpus had no live lexical false positive
  left to fix). R1's value here is **proven robustness against the bug class**
  (unit tests + probe), not a corpus delta.
- **Valid distress regressions = 0.** Every genuinely-adverse covered case still
  diagnoses identically (diagnosis pass unchanged at 86; unit-econ/margin/retention/
  operational/quality positives all hold).

## 5. DOES R2 REMAIN REQUIRED?

**YES — unconditionally.** R1 is a guard, not a capability. The dominant failures are
untouched and only R2 (causal adjudication) can move them:
- false_root_cause still 12 — these are NOT lexical false positives; the decoy
  evidence is genuinely adverse-financial (e.g. FRC-01 has a real 4-month runway),
  so the engine commits a covered decoy because it cannot attribute the symptom to
  its uncovered driver. R1 deliberately does not touch this (it would require causal
  reasoning, which is out of R1 scope).
- over_abstention (44), correct_diagnosis_wrong_action (27), and the single
  dangerous_proceed (DC-01) are unchanged and remain R2/R4 work.

**Conclusion:** R1 complete and safe — robustness improved, zero regression, gate and
scorer untouched. The minimum promotion-track set (R1 + R2 + R4) still needs R2 next.
**Stage A remains DO_NOT_PROMOTE / BLOCKED.**
