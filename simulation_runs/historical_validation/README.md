# Round 2 — Real-World Historical Validation Suite

Blind-replay validation of OpsIQ against **publicly documented, source-verified**
real-world business cases with known outcomes. This suite is **separate** from the Round 2
benchmark corpus (`simulation_runs/round_002/`): it does not read, modify, or score the
benchmark corpus, answer keys, scorer, safety gate, or diagnosis engine. Harness:
`simulation_runner/run-historical-validation.ts`.

## Integrity rule (binding)

Only **REAL_SOURCE_BACKED** cases (per `ROUND_2_REAL_WORLD_SOURCE_STANDARD.md`) may be
placed here and scored. Synthetic, illustrative, or LLM-recalled cases are **forbidden**
in this suite — a historical-alignment score computed on invented cases would be
fraudulent external validation. The harness enforces this: it scores only cases whose
`outcome.json.grounding_class === "REAL_SOURCE_BACKED"` and rejects all others.

## Per-case layout

```
case_<ID>/
  01_case_input.json   # ENGINE-VISIBLE, OUTCOME-HIDDEN (pre-decision only)
  outcome.json         # HIDDEN ground truth — NEVER passed to the engine
  source.json          # hidden source record per ROUND_2_REAL_WORLD_SOURCE_STANDARD §2
```

### `01_case_input.json` (outcome-hidden engine input)
- `caseId`: stable id
- `businessProblem`: the pre-decision framing, with the actual outcome removed
- `evidence[]`: `{ dimension, finding, isCritical?, confidence?, supportingData? }` — only
  data knowable **before** the decision (pre-decision data + constraints + timeline)
- `clientContext?`: `{ industry, size, revenueImpactUrgency }`
- `ownerConstraintProfile?`: owner time/budget/capacity/legal/runway constraints

The outcome, the expert diagnosis, and what actually happened MUST NOT appear here.

### `outcome.json` (hidden ground truth, read only by the harness scorer)
- `grounding_class`: must be `REAL_SOURCE_BACKED`
- `expert_diagnosis`: documented root cause / consensus diagnosis (normalized to an
  engine archetype label where applicable)
- `expert_first_action`: what experts/the business actually decided to do first
- `actual_decision`: the decision actually taken
- `outcome_polarity`: `SUCCESS` | `FAILURE` | `MIXED` (how the actual decision turned out)
- `harmful_actions[]`: action phrasings the record shows were value-destroying
- `beneficial_actions[]`: action phrasings aligned with what actually worked
- `citation`: resolvable source (mirrors `source.json`)

### `source.json`
Full source record per `ROUND_2_REAL_WORLD_SOURCE_STANDARD.md` §2 (citation, source_type,
published/accessed dates, evidence_extracted, source_backed_metrics, reliability A–D,
inferred_vs_stated).

## Scores produced (per `run-historical-validation.ts`)
- **historical_alignment** — engine direction matches the documented good outcome:
  on a FAILED actual decision, OpsIQ aligns by NOT recommending the harmful path
  (abstain or recommend a beneficial alternative); on a SUCCESS, by recommending the
  beneficial path.
- **diagnosis_agreement** — engine primary diagnosis vs documented expert diagnosis.
- **action_agreement** — engine first action matches a documented beneficial action.
- **safety** — engine never ships a documented-harmful action (abstaining counts safe).
- **counterfactual_review** — share of cases where OpsIQ was not worse than the actual
  decision (OPSIQ_BETTER or OPSIQ_MATCHED).
- Per-case classification: `OPSIQ_BETTER` / `OPSIQ_WORSE` / `OPSIQ_MATCHED`.

## Current status
**0 source-verified cases present.** The environment cannot perform full-text source
verification (WebFetch returns HTTP 403 on primary domains; web archive disallowed;
search snippets are explicitly not verification per the source standard). Until
source-verified cases are added in a fetch-capable environment, the harness reports
`NO_CASES` and computes no alignment score. See `ROUND_2_HISTORICAL_VALIDATION_REPORT.md`.
