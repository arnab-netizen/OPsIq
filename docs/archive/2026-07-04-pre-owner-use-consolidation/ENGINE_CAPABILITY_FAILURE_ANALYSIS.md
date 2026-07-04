# ENGINE CAPABILITY — FAILURE ANALYSIS

**Purpose:** explain why 47/50 Round 1 cases return INSUFFICIENT_EVIDENCE and why
0/50 pass, from committed evidence only.
**Date:** 2026-06-17 · **Branch:** `claude/stage-a-unproven-assumption-ecr0dm`
**Mode:** analysis only. No production code/safety gate/scoring/answer-key change.
**Not a Stage A pass claim.** Does not rely on the retracted 5.21/10.

---

## 1. DISTRIBUTION OF OUTCOMES (committed: `09_*`, `10_*`, `01_*`)

```
engine status:        INSUFFICIENT_EVIDENCE 47 | SUCCESS 3
root cause type:      unknown 46 | quality_control_failure 2 | customer_retention_erosion 2
consultant-grade pass: 0 / 50
```

### Evidence-dimension coverage vs the engine's archetypes
The diagnosis engine (`src/services/consulting-engine/diagnosis-engine.ts`) has
**three** archetypes, keyed on three dimensions only:
`operational_efficiency`, `quality_delivery`, `customer_retention`.

| dimension | present (of 50) | critical (of 50) | has archetype? |
|---|---|---|---|
| **financial_health** | **50** | **49** | **NO** |
| market_position | 6 | 5 | NO |
| customer_retention | 6 | 4 | yes |
| operational_efficiency | 4 | 2 | yes |
| quality_delivery | 2 | 2 | yes |
| team_capability | 1 | 1 | NO |
| process_maturity | 1 | 0 | NO |

**Finding:** the dimension present in **every** case (financial_health, critical
in 49/50) has **no diagnosis archetype**. The three archetype dimensions are
present in only 4/2/6 cases. The benchmark is dominated by financial/strategic
cases the engine structurally cannot diagnose.

---

## 2. EXACT ENGINE STAGE CAUSING ABSTENTION

`diagnosis-engine.ts` → `rootCausePatterns`: each archetype fires only if (a) the
case has **critical** evidence in its dimension AND (b) the `finding` text
contains a specific substring (`"complaint"`, `"churn"/"one-time"/"low repeat"`,
`"turnaround"/"slow"/"capacity"`). If no pattern matches, it falls through to
`DiagnosisType.UNKNOWN` with `DiagnosisConfidence.INSUFFICIENT_EVIDENCE`
(diagnosis-engine ~lines 234–256). The orchestrator then sets
`status = "INSUFFICIENT_EVIDENCE"` (`orchestrator.ts:95`).

**So the abstention originates at the diagnosis pattern-match stage**, not at the
safety gate. The safety gate (correctly) then abstains on those non-committed
outputs.

---

## 3. LEGITIMATE vs OVERLY-STRICT "MISSING EVIDENCE"

- **Mislabeled (NOT genuine data insufficiency):** ~**44/50** INSUFFICIENT cases
  carry rich **critical financial_health** (and some market) evidence but no
  archetype exists for it. The engine reports "INSUFFICIENT_EVIDENCE" when the
  truth is **INSUFFICIENT_MODEL_COVERAGE** — the data is present; the model is
  absent. This is overly strict / mislabeled.
- **Overly-strict trigger:** only **2/50** INSUFFICIENT cases (RW-003, RW-004)
  have critical evidence in an archetype dimension yet still abstained — i.e. the
  dimension matched but the **keyword substring** did not. These are answerable
  with existing evidence if triggers were less brittle.
- **Genuinely insufficient:** a small minority at most; the dominant pattern is
  model-coverage, not data shortage.

---

## 4. WHICH CASES SHOULD BE ANSWERABLE NOW vs NEED MORE INPUT

- **Answerable with the existing 3 archetypes (≈5):** the 3 SUCCESS (RW-001,
  RW-002, RW-005) + RW-003, RW-004 (archetype dimension present, keyword missed).
- **Answerable only after new archetypes (≈40+):** the financial_health- and
  market_position-dominated cases — they need financial / strategic / market /
  people archetypes, not more owner input.
- **Truly require more input (≈0–5):** few; most cases have substantial committed
  evidence.

---

## 5. WHY 0/50 PASS (even the 3 SUCCESS)

The 3 committed cases fail the consultant-grade bar on root-cause-match and
first-action alignment, and 2 of them (RW-001, RW-005) are now flagged
confident-wrong by the safety gate (`RC7_OPTION_C_VALIDATION_REPORT.md`). The
committed interventions are **generic** (e.g. "loyalty program", "complaint
tracking") and not tailored to the stated problem → **INTERVENTION_QUALITY_GAP**.
(Quality magnitude is otherwise UNVERIFIED per `B4_RESCORING_REPRODUCIBILITY_DECISION.md`.)

---

## 6. TOP 3 BOTTLENECKS

1. **MODEL_COVERAGE_GAP (dominant).** Only 3 operational archetypes; no
   financial_health archetype despite it being critical in 49/50 cases. Drives
   ~44/50 abstentions. Mislabeled as INSUFFICIENT_EVIDENCE.
2. **BRITTLE_KEYWORD_TRIGGERS.** Archetypes require exact substrings + isCritical;
   paraphrases miss (RW-003, RW-004). Suppresses even in-domain cases.
3. **INTERVENTION_QUALITY_GAP.** Committed diagnoses yield generic, misaligned
   first actions → 0/50 pass and the confident-wrong cases.

---

## 7. PROPOSED REMEDIATION SLICES (detailed in the plan doc)
E1 financial_health archetype(s) · E2 de-brittle triggers · E3 market/strategic
archetype · E4 intervention specificity · E5 honest relabel
(INSUFFICIENT_EVIDENCE vs INSUFFICIENT_MODEL_COVERAGE).

## 8. EXPECTED VALIDATION GATES (every slice)
- Re-run `apply-abstention.ts` + `adversarial-probe-run.ts`: **adversarial suite
  must remain 10/10 caught, controls 2/2 preserved** (no new confident-wrong
  proceeds), and **47-case baseline must not regress into unsafe proceeds**.
- Any new committed output must pass the safety gate (B + A + C).
- Reproducible scoring per the B4 replacement standard.
- Non-DB gates green; **safety gate code unchanged.**

**Stage A remains BLOCKED.** The engine's low committed-output rate is a
model-coverage problem, not a data problem.
