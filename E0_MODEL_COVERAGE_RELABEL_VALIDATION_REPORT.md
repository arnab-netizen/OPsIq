# E0 — MODEL-COVERAGE RELABEL VALIDATION REPORT

**Scope:** Implement **E0 only** — honest abstention-reason relabel (reporting
clarity). **Date:** 2026-06-17 · **Branch:** `claude/stage-a-unproven-assumption-ecr0dm`
**Constraints honored:** no diagnosis logic / scoring / thresholds / safety-gate
behavior / answer-key / benchmark-expected-outcome change; no new diagnoses or
archetypes. **Not a Stage A pass claim.**

---

## 1. WHAT CHANGED (additive, reporting only)

| File | Change |
|---|---|
| `src/services/governance/coverage-classifier.ts` *(new)* | Pure `classifyAbstentionCoverage` → `INSUFFICIENT_MODEL_COVERAGE` \| `INSUFFICIENT_EVIDENCE` \| `NOT_APPLICABLE`. |
| `simulation_runner/apply-abstention.ts` | Adds a `model_coverage_reason` **annotation** to the output object. |
| `simulation_runner/adversarial-probe-run.ts` | Adds the same annotation to probe outputs. |
| `src/__tests__/governance/coverage-classifier.test.ts` *(new)* | 5 unit tests. |

The classifier reads only `engineStatus`, `committed`, and evidence
`dimension`/`isCritical`. It **does not** touch `assessSafety`, the engine status,
`abstention_state`, thresholds, or any decision field. The relabel is an extra
field, not a status change.

### Rule
- committed (status ≠ INSUFFICIENT_EVIDENCE) → `NOT_APPLICABLE`
- INSUFFICIENT_EVIDENCE + no evidence → `INSUFFICIENT_EVIDENCE`
- INSUFFICIENT_EVIDENCE + evidence only in domains with no archetype (and no
  critical evidence in a supported domain) → `INSUFFICIENT_MODEL_COVERAGE`
- INSUFFICIENT_EVIDENCE + critical evidence in a supported domain → `INSUFFICIENT_EVIDENCE`

---

## 2. DECISION BYTE-EQUIVALENCE (16_* Option C vs 17_* E0)

Compared every decision field (`engine_status`, `abstain`, `abstention_state`,
`is_safe`, `confidence_adjustment`, `unsafe_conditions`, `escalation_required`,
`fallback_action`, `derived_inputs`, `causal_challenge`, `constraint_alignment`,
and `abstention_decision` excluding its per-run `timestamp`/`review_date`):

- **Substantive decision mismatches: 0 / 50.** Decisions are byte-equivalent.
- The only differences are (a) the **new** `model_coverage_reason` field and
  (b) non-deterministic `timestamp`/`review_date` inside `abstention_decision`
  (a fresh `new Date()` per run — not a decision).

| | 16_* (Option C) | 17_* (E0) |
|---|---|---|
| abstain | **49** | **49** |
| proceed | **1** | **1** |

**Round 1 proceed unchanged:** yes (1, RW-002).
**Round 1 abstain unchanged:** yes (49).

---

## 3. RELABEL DISTRIBUTION (50 cases)

| reason | count |
|---|---|
| `INSUFFICIENT_MODEL_COVERAGE` | **45** |
| `INSUFFICIENT_EVIDENCE` | **2** (RW-003, RW-004 — supported-domain critical evidence, engine still abstained) |
| `NOT_APPLICABLE` (committed) | **3** (RW-001, RW-002, RW-005) |

- **Relabeled to INSUFFICIENT_MODEL_COVERAGE: 45** — these abstained with evidence
  present only in domains the engine has no archetype for (predominantly
  financial_health). This is the honest reason: the data exists, the model does not.
- **Remaining true INSUFFICIENT_EVIDENCE: 2** — RW-003, RW-004 carry critical
  evidence in a supported domain yet the engine abstained (weak/ambiguous within a
  domain it *could* model).
- The 45/47 split matches the capability audit's finding that ~44/50 abstentions
  were model-coverage gaps mislabeled as data insufficiency.

---

## 4. SAFETY PROBE RESULT (adversarial_safety_probes_v2_e0/)

- **Unsafe probes caught: 10 / 10** (UNSAFE proceeded = 0).
- **Controls preserved: 2 / 2** (HSW-C1, HSW-C2 PROCEED).
- Probes are committed diagnoses → `model_coverage_reason = NOT_APPLICABLE`;
  their abstain/proceed decisions are unchanged from the Option C run.

## 5. GATES
- Unit/regression: **116 tests pass** (5 new classifier + all prior governance +
  engine regression).
- `npx tsc --noEmit`: changed files clean (pre-existing unrelated `run-case.ts:149`
  persists). `npx prisma validate`: valid.

## 6. OUTPUTS (old artifacts untouched)
- `simulation_runs/round_001/case_*/17_abstention_decision_e0.json` (50, new).
- `simulation_runs/adversarial_safety_probes_v2_e0/` (new).
- `12_*`, `14_*`, `15_*`, `16_*` preserved.

---

## 7. IS E1 NOW AUTHORIZED?

**E0 is complete and validated.** It is reporting-only and changes no behavior, so
it satisfies its acceptance criteria. **However, authorizing E1 (adding financial
archetypes) is a capability change with real confident-wrong risk and requires an
explicit owner instruction per the workstream guardrails** — this run does not
self-authorize E1. E0 establishes the honest baseline (45 model-coverage cases)
that E1's "cases unlocked" will be measured against.

**Stage A remains BLOCKED.**
