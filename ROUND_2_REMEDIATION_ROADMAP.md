# ROUND 2 — REMEDIATION ROADMAP

**Mode:** analysis/roadmap only — no cases, no scorer, no engine/gate/answer-key change.
**Date:** 2026-06-17 · **Branch:** `claude/round2-case-pack-authoring`.
**Not a Stage A pass claim. Stage A remains DO_NOT_PROMOTE / BLOCKED.**

Ranks the fixes for the failure classes in `ROUND_2_FAILURE_MODE_SYNTHESIS.md`. Each is a
separately-authorized slice; the safety gate stays frozen unless a slice explicitly
re-runs it (abstain-only, no threshold change). **Explicitly not "just add archetypes."**

---

## 0. RANKING DIMENSIONS (per item)
Impact on real-world usefulness · #failures addressed · implementation risk · overfitting
risk · dependency order · whether the safety gate must be re-run.

## 1. RANKED REMEDIATION SEQUENCE

### R0 — MEASUREMENT UNLOCK: 6-axis scorer + full-pipeline re-trial harness
*(prerequisite; not an engine fix)*
- **Addresses:** F9; makes F3/F4/F5 measurable. Without it, half the corpus (HC/DC/PC) is
  ungraded.
- **What:** deterministic scorer over the 6 axes (diagnosis, evidence-use, first-action,
  constraint-fit, safety, abstention) consuming **frozen** `runConsultingEngine` +
  safety-adapter outputs over the 103 cases; outcome used as held-out blind validation.
- **Impact:** ENABLING (highest leverage — you cannot fix what you cannot score).
- **#failures:** unlocks 4 (F3,F4,F5,F9).
- **Implementation risk:** LOW-MED (deterministic; reuse `consulting-safety-adapter`).
- **Overfitting risk:** LOW (measurement, not fitting) — but pre-register the bar (B4).
- **Dependency:** none. **Do first.**
- **Safety gate re-run:** YES (run frozen gate over corpus; abstain-only; no change).

### R1 — LEXICAL-TRIGGER HARDENING (fixes F2)
- **Addresses:** F2 (lexical false positives) and stops the benchmark contaminating its
  own authoring.
- **What:** make `fin_*` triggers polarity/negation-aware and require a corroborating
  numeric (e.g. "runway" only fires with `cashRunwayMonths` ≤ threshold, not on
  "long/healthy runway").
- **Impact:** MED (prevents fabricated crises; protects no-action behavior).
- **#failures:** 1 (F2) but it underlies authoring stability.
- **Implementation risk:** LOW (localized to `diagnosis-engine.ts` helpers).
- **Overfitting risk:** LOW (negation/polarity is a general rule, not a per-case patch).
- **Dependency:** none; cheapest concrete engine fix → do early, alongside/after R0.
- **Safety gate re-run:** YES (re-run adversarial suite + Round-1 baseline to confirm no
  regression).

### R2 — CAUSAL ROOT-CAUSE ADJUDICATION LAYER (fixes F1 + F8) — HIGHEST-ROI ENGINE FIX
- **Addresses:** F1 (13/13 false-root-cause) and F8 (multi-domain synthesis). The dominant
  real-world failure: mis-attributing the root cause yields wrong interventions.
- **What:** after pattern matching, an adjudication step that (a) attributes a surface
  symptom to its driver (downstream-symptom suppression: e.g. churn driven by a quality/
  pricing/key-person signal must defer to the driver), (b) resolves competing covered
  matches by causal precedence rather than raw confidence, and (c) emits a primary +
  causally-linked secondary (relational synthesis). Uses existing evidence dimensions +
  `evidenceIds`; can reuse signals from `causal-challenge.ts` but must **re-attribute**,
  not merely abstain.
- **Impact:** HIGHEST real-world usefulness.
- **#failures:** 2 classes / 13+ cases (F1, F8) and reduces F6 decoy-stealing.
- **Implementation risk:** MED-HIGH (genuine reasoning, not regex).
- **Overfitting risk:** MED-HIGH — **mitigate**: derive adjudication rules from general
  causal precedence (driver-vs-symptom, structural-vs-operational), hold out a random
  subset of the 13 FRC cases as a test set, and require the rule to generalize to held-out
  cases and not regress the covered-archetype controls.
- **Dependency:** R0 (to score it); benefits from R1 (clean triggers).
- **Safety gate re-run:** YES (adversarial suite + full corpus; abstain-only gate frozen).

### R3 — SURVIVAL/URGENCY PRIORITIZATION + ACTION SEQUENCING (fixes F3 + F4)
- **Addresses:** F3 (no survival prioritization) and F4 (diagnosis-correct-action-wrong).
- **What:** (a) urgency-aware diagnosis ranking — when liquidity/solvency/safety/legal
  signals co-occur, they gate before optimization diagnoses; (b) a first-action sequencing
  layer in `intervention-design-engine` that selects "stabilize before optimize" and
  respects the delayed-consequence traps (do not recommend the value-destroying short-term
  action).
- **Impact:** HIGH (prevents fatal "optimize while insolvent" advice).
- **#failures:** 2 classes / ~18 cases.
- **Implementation risk:** MED.
- **Overfitting risk:** MED — encode general survival precedence (cash/solvency/safety/legal
  first), not per-case ordering.
- **Dependency:** R0 (measurement), R2 (correct diagnosis first).
- **Safety gate re-run:** YES.

### R4 — CONSTRAINT-AWARE RECOMMENDATION (fixes F5)
- **Addresses:** F5 (hidden constraint handled only by abstaining).
- **What:** extend recommendation to **produce a feasible alternative** under a binding
  constraint (budget/staffing/time/legal/contract), not just abstain via
  `constraint-alignment`.
- **Impact:** MED-HIGH.
- **#failures:** 1 class / 5 cases.
- **Implementation risk:** MED.
- **Overfitting risk:** LOW-MED.
- **Dependency:** R0, R3 (sequencing).
- **Safety gate re-run:** YES (constraint gate interaction).

### R5 — ARCHETYPE EXPANSION E2+ (addresses F6) — LAST, NOT FIRST
- **Addresses:** F6 (9 uncovered buckets).
- **What:** add pricing/demand/gtm/inventory/working-capital/debt/legal/key-person/capex
  archetypes.
- **Impact:** HIGH coverage **but only after R2** — adding archetypes before causal
  adjudication just multiplies confident decoys (worsens F1).
- **#failures:** 1 class / dozens of cases.
- **Implementation risk:** MED (per archetype).
- **Overfitting risk:** MED.
- **Dependency:** **R2 first** (hard ordering), then R0 re-score each.
- **Safety gate re-run:** YES per archetype (adversarial suite + controls).

### Monitor — F7 misleading-KPI guard
Not a fix now; when R5/model upgrades land, add a "diagnose the deteriorating metric, not
the headline" guard so the accidental robustness does not regress.

## 2. RANKED TABLE
| Rank | Slice | Failures | Real-world impact | Impl risk | Overfit risk | Depends on | Gate re-run |
|---|---|---|---|---|---|---|---|
| R0 | 6-axis scorer + re-trial | F9 (+enables F3/4/5) | Enabling | Low-Med | Low | — | Yes |
| R1 | Lexical-trigger hardening | F2 | Med | Low | Low | — | Yes |
| R2 | Causal root-cause adjudication | F1, F8 | **Highest** | Med-High | Med-High | R0,R1 | Yes |
| R3 | Survival prioritization + sequencing | F3, F4 | High | Med | Med | R0,R2 | Yes |
| R4 | Constraint-aware recommendation | F5 | Med-High | Med | Low-Med | R0,R3 | Yes |
| R5 | Archetype expansion E2+ | F6 | High | Med | Med | **R2** | Yes |

## 3. KEY ORDERING DECISIONS
- **Fix before completing 150 cases: YES.** The corpus has already proven the dominant
  failures decisively (F1 13/13; F2 reproduced twice). Authoring the remaining 47 cases
  against an engine with no causal reasoning yields diminishing benchmark information and
  keeps tripping F2 during authoring. Remediate F1/F2/F3 (with R0 scorer) first, then
  resume authoring against a smarter engine for higher-signal cases.
- **R0 before any engine fix** — measurement first (B4 reproducibility; pre-registered bar).
- **R2 before R5** — never add archetypes before causal adjudication.
- **Safety gate stays frozen** throughout; each slice re-runs the adversarial suite (must
  stay 10/10 + 2/2 controls) and the Round-1 baseline to prove no regression.

## 4. CONCLUSION
- **Top failure mode:** F1 causal root-cause blindness (13 cases).
- **Highest-ROI fix:** R2 causal root-cause adjudication layer (with R0 scorer as its
  measurement prerequisite; R1 as a cheap early guard).
- **Fix before more cases:** YES.
- **Next step:** build R0 (6-axis scorer + full-pipeline re-trial), then R1, then R2.
**Stage A remains DO_NOT_PROMOTE / BLOCKED until the engine is re-trialed against this
corpus and the promotion gates are met.**
