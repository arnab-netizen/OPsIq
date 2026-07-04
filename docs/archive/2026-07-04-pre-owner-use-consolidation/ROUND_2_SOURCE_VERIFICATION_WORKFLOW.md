# ROUND 2 — SOURCE VERIFICATION WORKFLOW

**Mode:** documentation only — no source collection, no benchmark cases, no scorer, no
engine/gate/answer-key change, **no record promoted**. **Date:** 2026-06-17 ·
**Branch:** `claude/round2-case-pack-authoring`.
**Not a Stage A pass claim. Stage A remains DO_NOT_PROMOTE / BLOCKED.**

Operational procedure that executes `ROUND_2_SOURCE_FULL_TEXT_VERIFICATION_DESIGN.md`
over the 108 candidates. A future authorized slice runs this; this doc is the spec.

---

## 1. BATCH SIZE PER VERIFICATION RUN
- **12 records per run** (≈ one slice of a slice). Small enough for careful locator
  capture, large enough to make progress; 108 → 9 runs.
- Order of priority within batching: (1) records destined for **GOOD/AMBIGUOUS** cases
  (the underfilled valences), (2) **A-grade primary filings** (cheapest to verify on
  EDGAR/gov portals), (3) the **C-rated/corroboration** trio (SRC-030/066/103),
  (4) the rest. Datasets (population-level) verify as a group.
- Each run: re-fetch/locate → write `verification.json` per record → update the run
  ledger → spot dual-review 2 of the 12.

## 2. REQUIRED FIELDS PER VERIFIED METRIC
Each `metric_verifications[]` entry MUST contain: `metric`, `candidate_value`,
`verified_value`, `unit`, `period`, `locator` (§3 of design — must be a real locator,
not a homepage), `match` (`EXACT|ROUNDED|RANGE|MISMATCH|NOT_FOUND`), `is_critical`.
A run is invalid if any `FULL_TEXT_VERIFIED` record has a critical metric without a
locator or with `match ∈ {MISMATCH,NOT_FOUND}`.

## 3. WHO / WHAT CAN VERIFY
- **Automated verifier** (agent/tool with working fetch): may produce
  `FULL_TEXT_VERIFIED` / `PARTIALLY_VERIFIED` / `SECONDARY_VERIFIED` when it actually
  opens the source/archive and records a locator. It must set `verifier: agent:<id>`
  and `access_method`.
- **Human reviewer:** required for `SOURCE_INACCESSIBLE` resolution, for any A-grade
  promotion the automated path could not confirm, and as the **second reviewer** on every
  key-bearing record (blind confirmation of diagnosis + first action + outcome).
- **Neither** may mark `FULL_TEXT_VERIFIED` from a search snippet — snippets only justify
  `SEARCH_SNIPPET_ONLY` (the current state) and never promotion.

## 4. HOW TO RECORD AN INACCESSIBLE SOURCE
Set `verification_status: SOURCE_INACCESSIBLE`, `access_method: UNAVAILABLE`, list every
access attempt (primary URL, archive, portal) with outcome in `notes`, keep the
candidate's snippet figures but mark them unverified, and set `decision: HOLD`. The
record stays in the candidate pool, is **excluded from any verified/promoted count**, and
re-enters the queue if access is later obtained. It must never silently become a case.

## 5. HOW TO REJECT SOURCE CANDIDATES
`decision: REJECT` when: a critical metric contradicts the source (unresolved `MISMATCH`),
the figure is `NOT_FOUND` in the actual source, inspection reveals the snippet was wrong
or AI-confabulated, the source is a prohibited type (standard §5), or the source cannot
support the asserted ground-truth diagnosis/outcome. Record the reason + locator/contradiction.
Rejected records are retained (not deleted) with `verification_status: REJECTED` for audit.

## 6. HOW TO PROMOTE VERIFIED RECORDS
On meeting all §10 pass criteria of the design: write a derived **hidden** `source.json`
(citation, located metrics, reliability, `supports_ground_truth`, outcome evidence,
`contamination_risk`) and mark the candidate `REAL_SOURCE_BACKED` in the verification
ledger. Promotion **certifies the source only** — it does NOT author a benchmark case
(case authoring is a separate, separately-authorized slice). Promotions are appended to
`ROUND_2_SOURCE_VERIFICATION_LEDGER.json` (created by the run, not now).

## 7. KEEPING SOURCE FACTS OUT OF ENGINE-VISIBLE INPUT
- Three-file separation persists: `01_case_input.json` (engine-visible) · `key.json`
  (hidden ground truth) · `source.json` (hidden provenance). The verifier touches only
  the hidden side.
- Before promotion, run the **leakage recheck**: assert no `source_url`, `citation`,
  company identity, outcome verb, or filing/date token appears in any input that would be
  derived from the source. Reuse the intake `LEAKAGE_MARKERS` scan; extend it (in the
  future validator slice) to also reject `citation|source_url|locator|documented_outcome|
  outcome_evidence|verification_status`. De-identify named entities where identity leaks
  the outcome ("a UK construction-services group", not "Carillion").

## 8. PRESERVING HIDDEN KEYS
Keys are authored/confirmed separately and never enter the verifier's writeable scope on
the input side. For blind-outcome cases the documented outcome is withheld from the
second reviewer until after independent key confirmation. The verifier may confirm that a
source **supports** a key's diagnosis/outcome (`supports_ground_truth`) but does not write
the key. No key field is ever copied into `01_case_input.json`.

## 9. AUDIT REQUIREMENTS
- **Append-only run ledger** (`ROUND_2_SOURCE_VERIFICATION_LEDGER.json`): per record —
  status transition, verifier, access_method, resolved_url, decision, timestamp.
- **Reproducibility (B4 standard):** every promoted record's locators must let an
  independent re-checker reconfirm each critical metric; no `/tmp`, no ephemeral sources;
  archived URLs captured where the live page may change.
- **Per-run summary:** counts by status, reliability changes, rejections + reasons,
  inaccessible list, dual-review coverage.
- **Hard invariants checked each run:** 0 promotions on snippet-only evidence; 0 critical
  metrics without locator on any `FULL_TEXT_VERIFIED`; 0 key fields in inputs; promoted
  count ≤ records meeting all §10 criteria.

## 10. EXIT CRITERION FOR THE VERIFICATION PHASE
The phase is done when every one of the 108 candidates is in a terminal state
(`FULL_TEXT_VERIFIED`, `PARTIALLY_VERIFIED`, `SECONDARY_VERIFIED`, `SOURCE_INACCESSIBLE`,
or `REJECTED`), the ledger is committed, and the count of `REAL_SOURCE_BACKED`-eligible
records is known per outcome/diagnosis bucket. Only then can the source→`source.json`
conversion and (separately) case authoring proceed. **Stage A remains BLOCKED throughout.**

---

## ACCEPTANCE
The workflow is correctly specified when a future run can mechanically: batch 12, locate
and match each metric, record transitions in an append-only ledger, quarantine
inaccessible sources, reject contradicted ones, promote only those meeting all design §10
criteria, and prove (via locators) that every promoted figure is reconfirmable — without
ever leaking source facts into engine-visible inputs or authoring a case.
