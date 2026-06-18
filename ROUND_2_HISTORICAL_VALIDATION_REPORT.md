# ROUND 2 — REAL-WORLD HISTORICAL VALIDATION REPORT

**Mode:** validation-infrastructure build + honest status. No engine, safety gate,
scorer, benchmark corpus, answer-key, or promotion-rule change (the stop conditions are
respected — this slice adds a NEW, separate validation harness + suite directory).
**Branch:** `claude/stage-a-unproven-assumption-ecr0dm`. **Not a Stage A pass claim.
Stage A remains INTERNAL_OWNER_MODE_TRIAL_ONLY; public-ready BLOCKED.**

## HEADLINE — SOURCING_BLOCKER (cannot collect source-verified real cases in this environment)

The mission requires **50+ publicly documented real-world business cases** with
pre-decision data, constraints, timeline, and known outcome. This environment **cannot
collect or verify** such cases, and **fabricating them is forbidden**:

- **Network/source verification is blocked.** `WebFetch` returns **HTTP 403** on every
  primary domain (re-confirmed this run on `sec.gov`); `web.archive.org` is disallowed;
  only `WebSearch` snippets are available. The project's own
  `ROUND_2_SOURCE_VERIFICATION_BATCH_1_REPORT.md` already established this and ruled that
  **"search snippets are not full-text verification"** → 0 records can be source-verified
  here.
- **Fabrication is prohibited.** `ROUND_2_REAL_WORLD_SOURCE_STANDARD.md` defines
  `REAL_SOURCE_BACKED` (a resolvable citation + hidden `source.json`) as **the only class
  that counts**. LLM-recalled or invented "real-world" cases are not source-backed; a
  historical-alignment score computed on them would be **fraudulent external validation**
  — precisely the kind of unreproducible self-score this programme already retracted (the
  5.21/10 manual score). CLAUDE.md forbids fake implementations.

Therefore **0 cases were collected**, **0 blind replays were run**, and **no alignment
score is reported** (a real number cannot be produced honestly here). What this slice
delivers instead is the complete, integrity-enforcing **harness + schema**, ready to run
the moment source-verified cases are added in a fetch-capable environment.

## WHAT WAS BUILT (real, non-fabricating deliverables)

1. **Blind-replay harness** — `simulation_runner/run-historical-validation.ts`. Reads
   OUTCOME-HIDDEN cases, runs the live pipeline (`runConsultingEngine` →
   `consulting-safety-adapter`) on pre-decision data only, and scores OpsIQ's blind
   output against a HIDDEN `outcome.json` (never seen by the engine). Read-only of the
   engine; no gate/scorer/corpus/key modification. Compiles clean (tsc) and runs.
2. **Case-grounding schema** — `simulation_runs/historical_validation/README.md`. Defines
   the outcome-hidden `01_case_input.json`, the hidden `outcome.json` ground truth, and
   the `source.json` record per the source standard.
3. **Integrity gate (enforced + verified)** — the harness scores ONLY cases whose
   `outcome.json.grounding_class === "REAL_SOURCE_BACKED"` and **rejects all others**.
   Verified this run: a `PURE_SYNTHETIC` probe case was rejected
   (`rejected (ungrounded): 1`, scored 0), confirming no synthetic/fabricated case can
   ever contribute to the alignment score.

## SCORING CONTRACT (computed automatically once real cases exist)

| Score | Definition |
|---|---|
| historical_alignment | engine direction matches the documented good outcome: on a FAILED actual decision, OpsIQ aligns by NOT recommending the harmful path (abstain or beneficial alternative); on a SUCCESS, by recommending the beneficial path |
| diagnosis_agreement | engine primary diagnosis vs documented expert diagnosis (normalized) |
| action_agreement | engine first action lexically matches a documented beneficial action |
| safety | engine never ships a documented-harmful action (abstaining counts safe) |
| counterfactual_review | share of cases where OpsIQ was not worse than the actual decision |

Per-case classification: `OPSIQ_BETTER` / `OPSIQ_WORSE` / `OPSIQ_MATCHED`.

## CURRENT RESULT (machine artifact `_HISTORICAL_VALIDATION_RESULT.json`)

```
casesPresent: 0 · rejectedUngrounded: 0 · blindReplaysCompleted: 0 · scores: null
opsiq_better: [] · opsiq_worse: [] · opsiq_matched: []
```

## RECOMMENDATION

1. **Do NOT fabricate the 50 cases** to produce a number — it would be a fraudulent
   external-validation claim and would violate the source standard and no-fake-data rule.
2. **Run the real sourcing path in a fetch-capable environment.** Use the existing
   `ROUND_2_REAL_CASE_SOURCING_PLAN.md` + `ROUND_2_SOURCE_VERIFICATION_WORKFLOW.md` to
   collect and full-text-verify 50+ REAL_SOURCE_BACKED cases (SEC filings, court records,
   reputable case studies, post-mortems), write the hidden `source.json` + `outcome.json`,
   and drop them into `simulation_runs/historical_validation/`.
3. **Then run** `run-historical-validation.ts` to produce the five scores and the
   better/worse/matched breakdown. Until then, Stage A's public-ready promotion remains
   correctly BLOCKED on source verification (gate G9 of the final readiness audit).
4. The harness + schema are complete and verified, so step 3 is mechanical once the cases
   exist — no further engineering is required for the validation itself.

## STATUS

Real-world historical validation is **BLOCKED_NEEDS_REAL_SOURCES** (environment cannot
verify sources; fabrication forbidden). Infrastructure: **READY**. Stage A remains
INTERNAL_OWNER_MODE_TRIAL_ONLY / public-ready BLOCKED.
