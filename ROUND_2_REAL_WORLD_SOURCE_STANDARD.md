# ROUND 2 — REAL-WORLD SOURCE STANDARD

**Mode:** documentation only — no engine/gate/scorer/answer-key change; no case
authoring. **Date:** 2026-06-17 · **Branch:** `claude/round2-case-pack-authoring`.
**Not a Stage A pass claim. Stage A remains DO_NOT_PROMOTE / BLOCKED.**

This standard governs how Round 2 cases are grounded in **real, citable business
evidence** instead of invented scenarios. It is binding on all future authoring
(the 130 unauthored cases) and on re-grounding the 20 already authored
(see `ROUND_2_SOURCE_BACKING_AUDIT_OF_20_CASES.md`).

---

## 0. WHY THIS EXISTS
The 20 authored cases are structurally valid but **synthetic** — plausible numbers
invented to exercise an archetype. A benchmark used to lift DO_NOT_PROMOTE must
test OpsIQ against the **messiness of real businesses** (noisy, partial,
contradictory, multi-causal evidence), not clean constructions that an author
already knows the answer to. Synthetic cases over-fit the engine's own phrasing;
real cases do not.

## 1. CASE GROUNDING CLASSES (every case gets exactly one)
- **REAL_SOURCE_BACKED** — every critical metric and the ground-truth diagnosis are
  traceable to one or more cited primary/credible sources (§3). The only class that
  counts toward the grounded minimum.
- **SYNTHETIC_BUT_REALISTIC** — modeled on real-world patterns with plausible
  numbers but **no citation**. Allowed only as an interim state; must be either
  re-grounded to REAL_SOURCE_BACKED or explicitly reclassified PURE_SYNTHETIC.
- **PURE_SYNTHETIC** — constructed to exercise a specific gate/abstention behavior,
  not modeled on a named real business. Permitted for a capped set of adversarial
  and abstention probes, and **must be labeled** `source_type: synthetic`.
- **NEEDS_SOURCE_BACKING** — an overlay status: a case currently lacking the §2
  source record that the sourcing plan requires it to have.

## 2. REQUIRED SOURCE RECORD (per grounded case)
Stored in the **hidden** side (a `source.json` next to `key.json`), NEVER in the
engine-visible `01_case_input.json` (see §6). Required fields:

| Field | Meaning |
|---|---|
| `source_url` / `citation` | Resolvable URL or full bibliographic citation |
| `source_type` | One of the §3 categories (or `synthetic`) |
| `published_date` | Date the source was published / filed |
| `accessed_date` | Date the author retrieved it |
| `company_context` | Company/entity + industry + period the source describes |
| `evidence_extracted` | The specific passages/figures pulled from the source |
| `source_backed_metrics` | Map of each case metric → the source figure it came from |
| `source_limitations` | Gaps, staleness, scope caveats, sampling bias |
| `inferred_vs_stated` | For each material claim: DIRECTLY_STATED or INFERRED (+ basis) |
| `reliability_rating` | A–D (§4) |
| `supports_ground_truth` | YES/PARTIAL/NO — can the source justify the key's diagnosis? |
| `contamination_risk` | LOW/MED/HIGH — likelihood the engine "knows" this case |

A grounded case is admissible only when `supports_ground_truth ∈ {YES, PARTIAL}`
and `reliability_rating ∈ {A, B}` (C allowed only with a second corroborating
source; D never alone).

## 3. PREFERRED SOURCE CATEGORIES (primary → secondary)
1. **SEC filings** — 10-K / 10-Q / 8-K, risk factors, MD&A.
2. **Bankruptcy / restructuring** — Chapter 7/11 dockets, examiner/administrator
   reports, creditor presentations.
3. **Public-company earnings calls** — transcripts + investor decks.
4. **Founder postmortems / shutdown letters** — first-party failure write-ups.
5. **Credible business journalism** — established outlets with named reporting and
   verifiable figures (not opinion blogs).
6. **Government / regulatory reports** — agency findings, enforcement actions,
   official statistics.
7. **Public datasets** — bankruptcy/financial-distress datasets, churn, inventory,
   pricing, marketing-ROI datasets with documented provenance and license.

## 4. RELIABILITY RATING
- **A** — primary regulatory/financial filing or first-party dataset (audited /
  filed under legal obligation).
- **B** — first-party postmortem, earnings transcript, or named investigative
  journalism corroborated by a second source.
- **C** — single credible secondary report; usable only with a corroborating source.
- **D** — uncorroborated secondary/anecdotal; **not admissible** as sole basis.

## 5. PROHIBITED (case is rejected at source review)
- Unsourced invented facts presented as real.
- Generic blog claims / SEO content / undated aggregator pages.
- AI-generated "facts" (including model-recalled figures) used as a source.
- Synthetic metrics that are **not** explicitly marked `source_type: synthetic`.
- Source text copied without citation (attribution + provenance required;
  respect source length/quotation limits — extract figures and paraphrase, do not
  wholesale-copy proprietary text).

## 6. LEAKAGE & ANSWER-KEY SEPARATION (hard rules)
- The engine sees ONLY `01_case_input.json`. The source record (`source.json`) and
  the answer key (`key.json`) are hidden, never referenced by the input.
- **No citation, URL, source name, outlet, or company identity in the engine-visible
  input** if it would reveal the documented outcome/diagnosis. Cite in
  `source.json`; the input carries only the de-identified business situation +
  evidence figures.
- The existing intake validator's `LEAKAGE_MARKERS` scan stays in force; a future
  validator slice will additionally reject `source_url`/`citation`/`documented_*`
  tokens appearing in the input. Until then, leakage is checked at source review.
- **Validate facts against source:** each `source_backed_metrics` entry must point
  to a specific figure in `evidence_extracted`; a reviewer re-checks the figure
  against the cited source before admission (dual-review, per the build plan §5).

## 7. HOW TO CITE WITHOUT LEAKING THE ANSWER
- Put the diagnosis-revealing facts (outcome, root cause, "company X went bankrupt
  because Y") ONLY in `key.json` / `source.json`.
- The input presents the situation **as the owner would have seen it at decision
  time** — pre-outcome evidence, de-identified ("a regional casual-dining chain",
  not the brand) where identity would leak the outcome.
- Blind-outcome cases: withhold the known outcome from the second reviewer until
  after they confirm the key independently.

## 8. SYNTHETIC USE POLICY
Synthetic cases are allowed but **bounded**: only for (a) rare/edge diagnoses with
no usable public case, and (b) adversarial probes that must hold a variable
constant. They must be labeled `source_type: synthetic`, never counted toward the
grounded minimum, and capped per the sourcing plan. Adversarial synthetic cases
must still be **grounded in a documented real failure pattern** (cite the pattern's
source even if the specific numbers are constructed).

## 9. ACCEPTANCE FOR THIS STANDARD
A Round 2 case is source-admissible only when: it has a complete §2 source record;
`reliability_rating` meets §4; `supports_ground_truth ∈ {YES, PARTIAL}`; no §5
prohibition; no §6 leakage; and a second reviewer has validated the metrics against
the cited source. **Stage A stays BLOCKED** until Round 2 is re-grounded to this
standard and the engine is re-trialed.
