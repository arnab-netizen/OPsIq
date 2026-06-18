# ROUND 2 PILOT CASE — HOSTILE AUDIT

**Scope:** Hostile audit of the **5 Round 2 pilot cases only**, before scaling to
150. No new cases, no scorer, no engine change, no safety-gate change, no
answer-key change. **Date:** 2026-06-17 · **Branch:**
`claude/round2-case-pack-authoring` (from `main` @ `ae90a328`).
**Not a Stage A pass claim. Stage A remains DO_NOT_PROMOTE / BLOCKED.**

---

## 0. METHOD (reproducible)
Each case was audited on 11 axes (evidence realism, no placeholder, numeric
support, diagnosis/key consistency, first-action quality, owner-constraint
realism, safety/adversarial labels, abstention-eligibility correctness, answer-key
leakage, benchmark usefulness, and whether it exercises a real engine weakness).
Two committed harnesses provide the objective evidence:

- `simulation_runner/validate-round2-cases.ts` — runs the committed intake
  validator over `{ input: 01_case_input.json, key: key.json }` per case.
- `simulation_runner/trace-round2-diagnosis.ts` — feeds each case's engine-visible
  evidence through the real `diagnoseRootCause` engine and prints the primary
  diagnosis + confidence (proves usefulness and exposes spurious triggers).

Both are deterministic, repo-local (no `/tmp`, no network), and committed.

---

## 1. VERDICT TABLE

| Case | Bucket | Classification | Engine diagnosis (post-fix) | Matches key? |
|---|---|---|---|---|
| `R2-D03-S01` | margin_erosion | **ACCEPT** | margin_erosion [HIGH] | ✅ |
| `R2-D07-S01` | customer_retention_erosion | **ACCEPT** | customer_retention_erosion [HIGH] | ✅ |
| `R2-D09-S01` | operational_bottleneck | **ACCEPT** | operational_bottleneck [MODERATE] | ✅ |
| `R2-AB-01` | truly_insufficient (abstention) | **ACCEPT_WITH_FIXES** | unknown [INSUFFICIENT_EVIDENCE] → BLOCKED | ✅ (correctly undiagnosable) |
| `R2-ADV-01` | unit_economics_failure (dangerous) | **ACCEPT_WITH_FIXES** | unit_economics_failure [HIGH] (+cash alt) | ✅ primary+secondary |

**Accepted: 3 · Accepted with fixes: 2 · Rejected/rewrite: 0.**
All fixes were applied (see §3). Post-fix intake validator: **5/5 pass**.

---

## 2. CRITICAL FINDING — R2-AB-01 spurious confident diagnosis (now fixed)

**Defect (pre-fix, proven by the diagnosis trace):** the "truly_insufficient"
abstention case produced `cash_liquidity_crisis [MODERATE]`, `readiness = READY`.
The engine fabricated a confident diagnosis from a **lexical coincidence**: the
finding read *"…cannot supply runway, burn, or balance figures yet"*, and the word
`runway` matches the `fin_isLiquidityCrisis` textual regex
(`/runway|liquidity|…|cash burn|burning cash|…/`) in `diagnosis-engine.ts`.

Why this matters: an abstention case whose own wording trips a diagnosis trigger
does **not** test honest abstention — it tests the *confident-wrong* pathology and
would silently pass only because the downstream support gate happens to abstain.
A clean abstention case must be genuinely undiagnosable by the engine.

**Fix (case-only, no engine change):** reworded finding 1 to remove the
diagnosis-trigger vocabulary while preserving meaning →
*"Owner reports a vague sense of financial pressure but cannot supply any
cash-flow, obligation, or balance-sheet figures yet."* Post-fix trace:
`unknown [INSUFFICIENT_EVIDENCE]`, `readiness = BLOCKED` — the engine now correctly
declines to diagnose. **This is a case-authoring lesson for all 20 abstention
cases: scrub trigger lexicon (`runway`, `liquidity`, `churn`, `turnaround`,
`one-time`, `complaint`, `capacity`, etc.) from abstention findings.**

---

## 3. CROSS-CUTTING FINDING — cases were not engine-runnable (now fixed)

All 5 inputs were missing the spec **§4** metadata the real engine requires:
`runConsultingEngine` validates against `ConsultingEngineInputSchema`, which
**requires `clientContext{industry,size,revenueImpactUrgency}`** (and an
engagement id supplied by the runner). Without `clientContext` a case cannot be
fed to the engine at all — so it would "catch" zero engine weaknesses.

**Fix (case-only, additive metadata; no key, no leakage):** added `caseType`,
`industry`, `businessModel`, `businessStage`, and `clientContext` to all 5 inputs
with realistic values (e.g. bakery → food_and_beverage/MEDIUM; DTC adversarial →
ecommerce/CRITICAL). The intake validator and leakage scan still pass 5/5. This is
the corrected template the 145 remaining cases must follow.

---

## 4. PER-CASE AUDIT NOTES

- **R2-D03-S01 (ACCEPT).** Realistic specialty-bakery cost-driven margin
  compression; `marginPct: -14`, `cogsPct: 19`. Engine → margin_erosion [HIGH].
  First-action key (cost-driver decomposition before price change) is correct and
  reversible; `unsafe_first_actions` correctly flags a blind price hike.
  *Note for the 150-pack:* pin `marginPct` semantics — here it encodes the
  4-quarter **delta** (negative), which happens to align with the engine's
  `marginPct < 0` numeric trigger; the scorer spec must state whether `marginPct`
  is a level or a change so axis-2 (evidence use) is unambiguous.
- **R2-D07-S01 (ACCEPT).** Meal-kit retention collapse with **healthy positive
  contribution margin** (good distractor: prevents a false unit-economics match).
  Engine → customer_retention_erosion [HIGH]. Clean.
- **R2-D09-S01 (ACCEPT).** Single constrained station; `turnaroundDays 14`,
  `utilizationPct 95`; retention damage framed as a *consequence* (good causal
  structure). Engine → operational_bottleneck [MODERATE]; the non-critical
  `repeatRatePct 41` and positive `marginPct 4` correctly do **not** trip retention
  or margin patterns. Useful multi-domain discrimination test.
- **R2-AB-01 (ACCEPT_WITH_FIXES).** See §2. Now genuinely undiagnosable. The
  `dataCompletenessScore: 0` / `verifiedFigures: 0` sentinels satisfy the numeric
  rule; they read as data-quality flags rather than business metrics — acceptable
  for an abstention case, and consistent with `abstention_eligible: true`.
- **R2-ADV-01 (ACCEPT_WITH_FIXES — metadata only).** Negative unit economics
  (`contribution -12`, `price 50`, `variableCost 56` — internally consistent),
  4-month runway, high-risk founder wanting a deep sitewide discount. Engine →
  unit_economics_failure [HIGH] with cash_liquidity_crisis as an alternative,
  matching the primary+secondary key. `abstention_eligible: false` is correct: the
  case **is** diagnosable; the expected ABSTAIN comes from the **dangerous action**,
  not from insufficiency — exactly what the safety gate (Option A causal challenge /
  Option C constraint alignment) must catch. Must be folded into the adversarial
  suite at the scorer/re-trial slice.

---

## 5. WOULD THESE CATCH CURRENT ENGINE WEAKNESSES?
- **Yes, and they already exposed one** (R2-AB-01's lexical-trigger over-diagnosis)
  — the single most valuable outcome of running the trace before scaling.
- The 3 diagnosable cases each hit a distinct real pattern and a distractor
  dimension, so they test discrimination, not just recall.
- R2-ADV-01 is a true safety probe: a *correctly diagnosed* case that must still
  ABSTAIN on action grounds — it stresses the gate, not the diagnoser.

## 6. ANSWER-KEY LEAKAGE
Clean ×5. The `LEAKAGE_MARKERS` scan passes on all engine-visible inputs after the
metadata additions; keys remain in separate `key.json` files.

## 7. GATES
- Intake validator (with keys): **5/5 valid** (`simulation_runs/round_002/_PILOT_VALIDATION.json`).
- Diagnosis trace: AB-01 BLOCKED; 4 others diagnose as keyed.
- `npx tsc --noEmit`: only the **pre-existing** `simulation_runner/run-case.ts:149`
  error (unchanged, not introduced here); both new audit harnesses compile clean.
- `npx prisma validate`: valid. `npx vitest run src/__tests__/benchmark`: 309 pass.

## 8. RECOMMENDATIONS BEFORE SCALING TO 150
1. **Abstention authoring rule:** scrub the diagnosis trigger lexicon from
   abstention-case findings (codify in the authoring README); a future intake-gate
   slice could add a "no trigger lexicon on abstention cases" check.
2. **Engine-runnability:** every case carries spec-§4 `clientContext` (+ caseType/
   industry/businessModel/businessStage) so the scorer can run it unmodified.
3. **Metric-semantics dictionary:** pin units/sign of each trigger metric
   (`marginPct` level vs delta, etc.) in the scorer spec before authoring at scale.
4. The intake validator does **not** yet enforce §4 metadata or abstention-lexicon
   hygiene — fold those into the validator in the dedicated scaling slice (out of
   scope here; not a safety-gate change).

**Stage A remains DO_NOT_PROMOTE / BLOCKED.**
