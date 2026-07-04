# ROUND 2 — OUTCOME-SPECTRUM REQUIREMENTS

**Mode:** documentation only — no engine/gate/scorer/answer-key change; no sourcing;
no authoring. **Date:** 2026-06-17 · **Branch:** `claude/round2-case-pack-authoring`.
**Not a Stage A pass claim. Stage A remains DO_NOT_PROMOTE / BLOCKED.**

Extends `ROUND_2_REAL_WORLD_SOURCE_STANDARD.md` and `ROUND_2_REAL_CASE_SOURCING_PLAN.md`
to guarantee that Round 2 covers the **full spectrum of business outcomes**, not only
failures or only turnarounds. A benchmark that lifts DO_NOT_PROMOTE must test OpsIQ
against businesses that failed, survived, recovered, grew, broke, pivoted, and stayed
healthy — and against cases where the right call is to do nothing or to abstain.

---

## 0. WHY THIS EXISTS
Public postmortems and bankruptcy dockets are abundant; quiet healthy businesses are
under-documented. Left unmanaged, a "real-world" benchmark drifts toward a
**survivorship-inverted** corpus of famous failures — which would train/score OpsIQ to
over-diagnose distress and over-intervene. The outcome spectrum is a hard quota so the
engine is tested on good decisions, stable businesses, and recoveries too.

## 1. OUTCOME LABEL (mandatory on every case)
Every Round 2 case carries exactly one **primary** `outcome_category` (1–20 below) in
its hidden `key.json`, plus an `outcome_valence ∈ {GOOD, BAD, MIXED, AMBIGUOUS}` and,
where available, `outcome_evidence` in `source.json`. The label is **hidden** from the
engine-visible input (§5). A case may note a `secondary_outcome` but is quota-counted by
its primary only.

## 2. THE 20 OUTCOME CATEGORIES + PER-CATEGORY MINIMUMS (of 150)
| # | Outcome category | Valence | Min cases |
|---|---|---|---|
| 1 | Business failure / shutdown | BAD | 8 |
| 2 | Bankruptcy / restructuring | BAD | 8 |
| 3 | Severe distress but survival | MIXED | 7 |
| 4 | Successful turnaround | GOOD | 8 |
| 5 | Partial recovery / mixed outcome | MIXED | 7 |
| 6 | Growth with hidden profitability problem | MIXED | 6 |
| 7 | High revenue but cash-flow crisis | MIXED | 6 |
| 8 | Fast growth → operational breakdown | MIXED | 6 |
| 9 | Strategic mistake → correction | MIXED | 6 |
| 10 | Wrong action taken, damage worsened | BAD | 6 |
| 11 | Good action taken, improvement followed | GOOD | 8 |
| 12 | Stable healthy business / no major intervention | GOOD | 8 |
| 13 | Temporary shock with recovery | GOOD | 6 |
| 14 | Market shift / demand collapse | BAD | 7 |
| 15 | Fraud / governance / legal crisis | BAD | 6 |
| 16 | Founder / key-person / team failure | BAD | 6 |
| 17 | Capex / irreversible-decision mistake | BAD | 6 |
| 18 | Customer trust / quality failure | BAD | 6 |
| 19 | Pricing / unit-economics failure | BAD | 6 |
| 20 | Ambiguous outcome / incomplete evidence → abstention | AMBIGUOUS | 20 |
| | **Total minimums** | | **147** (of 150; ~3 slack) |

**All 20 categories must be non-empty.** No category may be zero; no category may
exceed **20%** of the corpus (prevents a failure-heavy skew).

## 3. VALENCE FLOORS (headline guarantees)
- **GOOD-outcome cases (cats 4, 11, 12, 13): ≥ 30.**
- **BAD-outcome cases (cats 1, 2, 10, 14, 15, 16, 17, 18, 19): ≥ 45.**
- **MIXED/partial cases (cats 3, 5, 6, 7, 8, 9): ≥ 25.**
- **AMBIGUOUS/abstention cases (cat 20): ≥ 20.**
"Do not use only failed companies; do not use only turnarounds" is enforced by the
GOOD floor (≥30) and the per-category 20% cap.

## 4. SOURCE-TYPE MIX BY OUTCOME
- **BAD (1,2,14,15,16,17,18,19):** SEC 10-K/8-K, bankruptcy/restructuring dockets,
  regulatory enforcement actions, founder shutdown postmortems. Reliability A/B easy.
- **GOOD (4,11,12,13):** earnings-call transcripts, survivor 10-Ks/annual reports,
  named journalism on turnarounds, documented operational-turnaround write-ups.
  Because healthy/quiet businesses are under-reported, **public datasets** and a
  **higher (but still capped) synthetic tolerance** are allowed for cat 12
  (stable-healthy) — every synthetic stays labeled and excluded from the grounded
  count (`ROUND_2_REAL_CASE_SOURCING_PLAN §4`).
- **MIXED (3,5,6,7,8,9):** 10-Q trend sequences, multi-period journalism, datasets
  that show a metric improving then regressing (or vice-versa).
- **AMBIGUOUS (20):** partial-data real cases + labeled synthetic abstention probes.
- **Anti-fame rule:** **≤ 25%** of grounded cases may be famous large-cap examples;
  the rest must be small business, startup, mid-market, franchise, marketplace, SaaS,
  retail, restaurant, service, manufacturing, or asset-heavy (see §6).

## 5. KEEPING OUTCOME HIDDEN FROM ENGINE-VISIBLE INPUT
- `outcome_category`, `outcome_valence`, `documented_outcome` live ONLY in
  `key.json`; `outcome_evidence` (+ citation/locator) lives ONLY in `source.json`.
- `01_case_input.json` presents the situation **as of the decision moment**, before
  the outcome — no post-hoc language ("the company later filed for bankruptcy"),
  no outcome-revealing identity/dates. De-identify where identity leaks the outcome.
- The intake `LEAKAGE_MARKERS` scan is extended (validator slice) to also reject
  `outcome_category|documented_outcome|outcome_evidence` tokens in the input.
- **Blind-outcome cases:** the documented outcome is withheld from the confirming
  reviewer until after they independently confirm diagnosis + first action.

## 6. BUSINESS-TYPE DIVERSITY (cross-cut with outcome)
Each of these types must appear **≥ 8 times** across the corpus and **no type > 20%**:
small business, startup, mid-market, franchise, public-company, marketplace, SaaS,
retail, restaurant, service, manufacturing, asset-heavy. Good and bad management
decisions must both be represented within each major type where sources allow.

## 7. DECISION-QUALITY & DIAGNOSIS-DIFFICULTY REQUIREMENTS
- **Both good and bad management decisions** present (cats 10 vs 11 anchor this).
- **Obvious-diagnosis-is-wrong** cases: ≥ 12 where the surface symptom points to the
  wrong archetype and the true cause is elsewhere (misaligned_root_cause family).
- **Abstention-is-correct** cases: ≥ 20 (cat 20) — engine must NOT diagnose.
- **Intervention-quality-dominant** cases: ≥ 12 where the diagnosis is easy but the
  *first-action choice/sequencing/reversibility* is what's actually scored (the right
  diagnosis with a dangerous first action must still fail the safety axis).

## 8. HOW THE SCORER USES OUTCOME (blind validation; scorer is a later slice)
Outcome is **not** an engine input and is **not** graded as a diagnosis. It is a
held-out validation signal:
- **Action-direction consistency:** on cat 11 (good action → improvement), the
  documented winning action must be inside `acceptable_first_actions`; on cat 10
  (wrong action → worse), that action must be inside `unsafe_first_actions` and the
  engine must not recommend it.
- **Safety cross-check:** on BAD cases driven by a dangerous action (10, 17, 19), an
  engine PROCEED endorsing that action fails the safety axis regardless of diagnosis.
- **Abstention check:** cat 20 must yield ABSTAIN; a confident diagnosis fails.
- **Over-intervention check:** cat 12 (stable healthy) penalizes unnecessary
  high-cost/irreversible recommendations — tests that OpsIQ can say "no major
  intervention required."
- **Anti-overfit:** outcome stays hidden from the engine; the scorer reads it only to
  grade frozen outputs (B4 reproducibility; no leakage into the engine path).

## 9. ACCEPTANCE
Round 2 satisfies the outcome spectrum only when: every category 1–20 meets its §2
minimum; the §3 valence floors hold (GOOD ≥30, BAD ≥45, MIXED ≥25, AMBIGUOUS ≥20);
no category and no business-type exceeds 20%; ≤25% famous large-caps; and every case
carries a hidden `outcome_category`/`outcome_valence` with outcome evidence cited for
grounded cases. **Stage A stays BLOCKED until Round 2 meets this and is re-trialed.**
