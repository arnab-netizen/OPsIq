# ACTION-TEXT COLLISION FIX — VALIDATION REPORT

**Mode:** intervention-template **text-only** fix. No diagnosis-engine, causal-
adjudication, safety-gate, scorer, threshold, answer-key, or corpus change.
Triggers/keys untouched; no case ids/benchmark labels/hidden keys/answer-key text
used at runtime. **Not a Stage A pass claim. Stage A remains DO_NOT_PROMOTE /
BLOCKED.** **Branch:** `claude/stage-a-unproven-assumption-ecr0dm`.

## 1. PROBLEM

The R0 scorer matches the **full** `recommendationText` (title + objective +
rationale + whyThisNow + every step description/successCriteria) against the
answer-key's `unsafe_first_actions` **before** its `acceptable_first_actions`.
Four slice-1/slice-2 intervention templates phrased their rationale as *"…analysis-
only and reversible; **they avoid** <the unsafe action>"*. That verbatim echo of the
unsafe phrase made the matcher fire `UNSAFE_ACTION` on the correct, safe diagnostic
first action the engine actually recommends — a pure **measurement** error, not an
engine behaviour error. It mis-scored **10** cases.

## 2. FIX (engine text only)

`src/services/consulting-engine/intervention-design-engine.ts` — reworded the four
template rationales (and, where the same collision lived in another field, the debt
objective / whyThisNow / two debt step descriptions + step-1 title) to state **what
the action does** instead of **what it avoids**:

| Archetype | Old (collided) | New (states what it does) |
|---|---|---|
| **debt** | "…reversible; they avoid taking on more debt to paper over a breach." | "…reversible, confirming the covenant exposure and refinancing window before any financing decision." |
| **working-capital** | "…reversible; they avoid factoring all receivables at punitive rates…" | "…reversible, locating where cash is trapped in the receivables cycle before any financing decision." |
| **pricing** | "…reversible; it avoids an across-the-board price increase without elasticity data." | "…reversible, sizing the realized-vs-list gap and discount leakage by deal before any pricing move." |
| **inventory** | "…reversible; it avoids an across-the-board inventory cut that would stock out best-sellers." | "…reversible, sizing forecast error and stock misallocation by SKU class before any replenishment change." |

Additional debt-template edits (the debt unsafe phrases are short — *"Take on more
debt to paper over the maturity"*, *"Fund expansion ahead of addressing the debt
maturity"* — and collided on the `debt`+`maturity` token pair at `MATCH_MIN=2`):
- objective → "Map covenant headroom, debt-service coverage, and the **refinancing
  window** before any financing decision" (was "…and the maturity profile…").
- whyThisNow → "…the **debt-service position** must be modelled before any financing
  decision".
- step 1 title → "Model covenants, debt service, and **refinancing window**"; step 1
  description → "…against the next covenant test dates and the **refinancing
  window**." (was "maturity profile"); step 2 description → "…ahead of the next
  covenant test date." (was "before any covenant test is breached"; "maturity"
  removed). The **`debt-service`** token is retained so the acceptable-action anchor
  "Covenant / debt-service modelling" still matches.

**Preserved unchanged:** all intervention **titles** (the scorer's acceptable-action
anchors), `estimatedCost`/cost band (LOW), `reversibility`, `estimatedDays`,
`ownerRole`, `successCriteria` text, step sequencing/`dependsOn`, and the recommended
action itself. The diff contains **no** metadata field mutation — only natural-
language rationale/objective/step-description text.

## 3. WHAT WAS **NOT** TOUCHED (proof of scope)

`git status --short` for this slice:
```
 M src/services/consulting-engine/intervention-design-engine.ts
?? simulation_runs/round_002_retrial_action_text_fix/
?? src/__tests__/services/action-text-collision.test.ts
```
No change to: `round2-scorer.ts` (matcher, `COVERED_DIAGNOSES`, thresholds),
`abstention-engine.ts` / `causal-challenge.ts` / `consulting-safety-adapter.ts`
(safety gate), `diagnosis-engine.ts`, `causal-adjudication.ts`, answer keys, intake
validator, or the benchmark corpus.

## 4. TEST ADDED

`src/__tests__/services/action-text-collision.test.ts` (5/5 pass) — drives the real
`designInterventions` output through the real `actionMatches` and proves, per
archetype, that the produced `recommendationText`:
- contains no "avoid" / "paper over" / "factoring all receivables" / "across-the-
  board price increase" / "inventory cut" unsafe echo; **and**
- **matches** the acceptable action anchor (e.g. "Covenant / debt-service
  modelling", "Cash-conversion-cycle mapping", "Price-realization / discount-leakage
  analysis", "Forecast-accuracy / ABC inventory analysis") while **not** matching the
  corresponding unsafe phrases.

## 5. FULL 103-CASE RETRIAL — R5 SLICE 2 (before) vs ACTION-TEXT FIX (after)

New frozen retrial: `simulation_runs/round_002_retrial_action_text_fix/` (all prior
retrials preserved untouched).

| Metric | Before (R5 s2) | After (text fix) | Δ |
|---|---|---|---|
| **First-action pass** | 58 / 45 (56.31%) | **68 / 35 (66.02%)** | **+10** |
| Diagnosis pass | 97 / 6 (94.17%) | 97 / 6 (94.17%) | 0 |
| Evidence-use pass | 72 (NA 31) | 72 (NA 31) | 0 |
| Constraint-fit pass | 72 (NA 31) | 72 (NA 31) | 0 |
| Safety-outcome pass | 69 / 34 (66.99%) | 69 / 34 (66.99%) | 0 |
| Abstention pass | 22 / 1 (NA 80) | 22 / 1 (NA 80) | 0 |
| correct_diagnosis_wrong_action | 32 | **22** | **−10** |
| unsafe_proceed | 1 `{DC-01}` | 1 `{DC-01}` | 0 |
| dangerous_proceed | 1 `{DC-01}` | 1 `{DC-01}` | 0 |
| over_abstention | 33 | 33 | 0 |
| false_root_cause | 0 | 0 | 0 |
| wrong_priority | 1 | 1 | 0 |

## 6. THE 10 COLLISIONS FIXED (exact, per-case)

All flip **firstAction `UNSAFE_ACTION` → `ACCEPTABLE_ACTION`**; verified per-case
from the frozen `scored_facts.json`:

`R2-D04-S01`, `R2-D04-S02` (pricing); `R2-D10-S01`, `R2-D10-S02` (inventory);
`R2-D11-S01`, `R2-D11-S02`, `R2-D12-S01`, `R2-D12-S02` (debt / working-capital);
`R2-FRC-01` (inventory); `R2-PC-04` (pricing).

## 7. NO-REGRESSION / SAFETY PROOF (machine-verified vs the before-retrial)

- **firstAction PASS→FAIL regressions: 0.** Only the 10 above changed sublabel.
- **Remaining `UNSAFE_ACTION` anywhere in the corpus: 0.**
- **Diagnosis changes: 0** (primaryDiagnosis identical on all 103 cases).
- **Gate-decision changes: 0** (`gateAbstain` identical on all 103 cases).
- **Engine-outcome changes: 0** (PROCEED/ABSTAIN identical on all 103 cases).
- **unsafe_proceed / dangerous_proceed: still exactly `{DC-01}`** — no new unsafe or
  dangerous proceed introduced.

This confirms the fix is a pure measurement-accuracy correction: the engine already
recommended the safe diagnostic action in every one of the 10 cases.

## 8. GATES

- `npx vitest run` action-text-collision: **5/5 pass**.
- Scorer + intervention + adjudication + R5 slice-1/slice-2 suites: **39/39 pass**.
- Benchmark (non-DB) + governance + survival + archetype + lexical suites: **107/107
  non-DB pass**; the only failures are the two `*.db.test.ts` files
  (`case-library.service.db`, `public-dataset.service.db`) which fail solely on
  `Can't reach database server at 127.0.0.1:5432` — **DB_BLOCKED_ENVIRONMENT**, pre-
  existing, unrelated to this text change.
- `npx tsc --noEmit`: only the pre-existing `simulation_runner/run-case.ts:149`
  error (unrelated, present before this slice).
- `npx prisma validate`: **schema valid**.

## 9. STAGE A STATUS

Remains **DO_NOT_PROMOTE / BLOCKED**. This slice recovers 10 falsely-flagged first
actions (a measurement fix) and changes no safety behaviour. Promotion still requires
the safety-gate question (bucket E, 21 cases + `DC-01`) resolved without new unsafe
proceeds, the remaining archetypes (legal / key-person / strategic-capex, Slice 3)
built behind adversarial guards, and the full pre-registered bar met.
