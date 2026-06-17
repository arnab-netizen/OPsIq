# ROUND 2 — REAL CASE SOURCING PLAN

**Mode:** documentation only — no engine/gate/scorer/answer-key change; no authoring;
no browsing performed. **Date:** 2026-06-17 ·
**Branch:** `claude/round2-case-pack-authoring`.
**Not a Stage A pass claim. Stage A remains DO_NOT_PROMOTE / BLOCKED.**

Implements `ROUND_2_REAL_WORLD_SOURCE_STANDARD.md` over the 150-case manifest.
Supersedes the source ratios in `ROUND_2_CASE_PACK_BUILD_PLAN.md §2–3` where stricter.

---

## 0. TOOL-ACCESS STATUS
This slice did **not** browse. Source *collection* (fetching filings, transcripts,
postmortems, datasets) is a **separate, explicitly-authorized slice** that requires
web/tool access. Until that slice runs, all source collection is **PENDING** and no
case may be reclassified REAL_SOURCE_BACKED. This plan defines the targets, quotas,
and workflow so collection is mechanical once authorized.

## 1. MINIMUM GROUNDED COVERAGE (of 150 cases)
- **≥ 60% REAL_SOURCE_BACKED (≥ 90 cases).** Stricter than the build plan's ~50%,
  because the benchmark's purpose is real-world stress.
- **≤ 40% synthetic (≤ 60 cases)**, of which **≤ 20 PURE_SYNTHETIC** (adversarial +
  abstention + truly-rare diagnoses). Synthetic never counts toward the grounded 90.
- Promotion gate: **a Stage A re-trial may not use Round 2 unless ≥ 60% of scored
  cases are REAL_SOURCE_BACKED at reliability A/B.**

## 2. MINIMUM CASES PER SOURCE CATEGORY (within the ≥90 grounded)
| Category | Minimum cases |
|---|---|
| Public filings (SEC 10-K/10-Q/8-K, risk factors, MD&A) | **≥ 25** |
| Startup / founder postmortems & shutdown letters | **≥ 15** |
| Public datasets (bankruptcy, distress, churn, inventory, pricing, marketing-ROI) | **≥ 15** |
| Credible journalism + government/regulatory reports | **≥ 20** |
| Bankruptcy / restructuring filings (subset, may overlap filings) | **≥ 10** |
| Earnings-call transcripts (subset) | **≥ 10** |

(Overlaps allowed — a bankruptcy case may be both a filing and restructuring — but
each minimum must be met by distinct qualifying cases.)

## 3. DIAGNOSIS × SOURCE MAPPING (where real evidence is richest)
- **Financial-structural** (D01 cash, D02 unit-econ, D03 margin, D11 working-capital,
  D12 debt): SEC filings, bankruptcy dockets, earnings calls. Target ≥ 60% grounded.
- **Demand/GTM/pricing** (D04, D05, D06): startup postmortems, marketing-ROI
  datasets, journalism.
- **Retention/quality/ops/inventory** (D07, D08, D09, D10): churn/inventory datasets,
  recall & regulatory reports, documented turnarounds.
- **Governance/key-person/capex** (D13, D14, D15): regulatory enforcement actions,
  10-K risk factors, impairment/capex disclosures.

## 4. HOW SYNTHETIC CASES MAY BE USED
- Only for (a) diagnoses with no usable public case, and (b) controlled adversarial
  variables. Hard cap **≤ 60 total / ≤ 20 PURE_SYNTHETIC**.
- Must be labeled `source_type: synthetic` in `source.json`; excluded from the
  grounded count and from any capability/quality claim except as labeled controls.

## 5. HOW ADVERSARIAL CASES MUST BE GROUNDED
- Each dangerous probe must cite a **documented real failure pattern** (e.g.
  discounting into negative unit economics → a named DTC/retail collapse; irreversible
  capex on a temporary surge → a named over-expansion bankruptcy), even when the
  specific numbers are constructed to hold a variable constant.
- The owner's *desired dangerous action* and the *documented bad outcome* live in
  `key.json`/`source.json`; the input shows only the pre-decision situation.
- Every dangerous case is added to the adversarial suite at the re-trial slice
  (joining R2-ADV-01, R2-ADV-02 and the Round-1 HSW family).

## 6. PRESERVING HIDDEN ANSWER KEYS
- Three-file separation per case: `01_case_input.json` (engine-visible) ·
  `key.json` (ground truth) · `source.json` (provenance). Engine reads only the first.
- Blind-outcome cases: the documented outcome is withheld from the confirming
  reviewer until after independent key confirmation (build plan §5).
- Keys/sources are never imported into any engine or scorer path that touches the
  input; the scorer loads keys only to grade frozen outputs.

## 7. AVOIDING SOURCE LEAKAGE INTO ENGINE-VISIBLE INPUT
- No `source_url`, `citation`, outlet name, ticker, or company identity in the input
  when it would reveal the outcome/diagnosis; de-identify ("a mid-market SaaS vendor")
  where identity leaks the answer.
- Keep the existing `LEAKAGE_MARKERS` scan; the dedicated validator slice will extend
  it to reject `source_url|citation|published_date|accessed_date|documented_root_cause`
  tokens in the input. Until then, a reviewer runs a manual leakage scan at admission.
- Contamination control: prefer pre-cutoff or low-profile cases; record
  `contamination_risk`; over-weight blind-outcome and dataset-derived cases that the
  engine is unlikely to have memorized.

## 8. HOW TO CITE WITHOUT PUTTING ANSWERS IN THE INPUT
- Citation lives in `source.json.citation` + `source_url`. The input's `evidence[]`
  carries only the figures (`supportingData`) and a neutral `source` label
  ("management accounts", "regulatory filing") — never the resolvable answer-bearing
  reference.
- `source_backed_metrics` maps each input figure to the exact source figure, so the
  citation is auditable without ever being engine-visible.

## 9. HOW TO VALIDATE FACTS AGAINST SOURCE
1. Author extracts figures into `source.json.evidence_extracted` with locators
   (page/section/line or dataset row).
2. Each `source_backed_metrics` entry references a specific extracted figure.
3. A second reviewer re-opens the cited source and confirms each figure
   independently (no reliance on the author's summary).
4. `inferred_vs_stated` flags every claim not directly in the source; INFERRED claims
   need a stated basis and may not carry the case's only critical metric.
5. Disagreements escalate to a third reviewer; unresolved → case rejected.
6. Reproducibility: `source.json` + extraction locators are committed so the
   validation can be re-run (B4 standard — no `/tmp`, no ephemeral sources).

## 10. WORKFLOW & CADENCE
Author → `source.json` (+ extraction) → intake validator → fact-validation dual
review → leakage scan → admit. Per ~25-case batch: re-run the intake validator and
spot re-validate 5 source records. Per full round: confirm the §1–§2 quotas are met
before any scoring.

## 11. SEQUENCING (each its own authorized slice)
1. **Source-collection slice** (needs web/tool access): collect sources, write
   `source.json` for the 16 SYNTHETIC_BUT_REALISTIC cases (re-ground) + new grounded
   cases; reclassify.
2. **Source-record validator slice:** extend the intake validator to require/own a
   `source.json` schema + the §7 leakage tokens (no weakening of existing rules).
3. **Resume authoring** to the §1–§2 quotas (controlled batches).
4. **6-axis scorer** + **re-trial** under pre-registered promotion gates (incl. the
   ≥60% grounded gate).

## 12. ACCEPTANCE FOR THE PLAN
Round 2 is sourcing-complete only when: ≥ 90 cases REAL_SOURCE_BACKED at A/B
reliability; every §2 category minimum met; synthetic ≤ 60 (≤ 20 pure) and labeled;
every grounded case has a validated `source.json`; 0 leakage findings; and the quota
report is committed. **Stage A stays BLOCKED until then and through re-trial.**
