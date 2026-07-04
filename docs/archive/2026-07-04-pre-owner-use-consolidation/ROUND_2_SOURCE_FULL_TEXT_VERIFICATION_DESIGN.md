# ROUND 2 — SOURCE FULL-TEXT VERIFICATION DESIGN

**Mode:** design/documentation only — no source collection, no benchmark cases, no
scorer, no engine/gate/answer-key change, **no record promoted**. **Date:** 2026-06-17 ·
**Branch:** `claude/round2-case-pack-authoring`.
**Not a Stage A pass claim. Stage A remains DO_NOT_PROMOTE / BLOCKED.**

Defines how a candidate source record moves from `SEARCH_SNIPPET_ONLY` to a
verified record whose facts are confirmed from **accessible source text** (filing
section, transcript quote, report table, dataset row, or archived page). Governs the
108 candidates in `simulation_runs/round_002_source_candidates/slice_{1,2,3}/`.

---

## 0. WHY THIS IS THE GATING BLOCKER
All 108 candidates are `SEARCH_SNIPPET_ONLY` because `WebFetch` returns HTTP 403 for
primary domains in this sandbox. Per `ROUND_2_REAL_WORLD_SOURCE_STANDARD.md §9`, **no
record may back a benchmark case until each cited metric is confirmed against a locator
in the actual source**. This design makes that confirmation reproducible and auditable.

## 1. VERIFICATION SCHEMA (`verification.json`, one per source record)
A sidecar `verification.json` next to each `SRC-0XX.json` candidate (never engine-visible):
```
{
  "source_id": "SRC-0XX",
  "verification_status": "<status, §2>",
  "verifier": "<who/what, see WORKFLOW>",
  "verified_at": "ISO-8601",
  "access_method": "DIRECT_FETCH | ARCHIVE | OFFICIAL_PORTAL | DATASET_DOWNLOAD | MANUAL_PDF | UNAVAILABLE",
  "resolved_url": "<URL or archive URL actually opened>",
  "document_fingerprint": "<title + filing date + accession/DOI/ISBN + sha256-if-downloaded>",
  "metric_verifications": [ <per-metric record, §5> ],
  "contradictions": [ <§6> ],
  "reliability_change": { "from": "A|B|C", "to": "A|B|C", "reason": "<§7>" },
  "outcome_evidence_verified": true|false,
  "leakage_recheck_passed": true|false,
  "decision": "PROMOTE | HOLD | REJECT",
  "notes": "<free text>"
}
```
The candidate `SRC-0XX.json` is **never edited in place**; verification outcomes live in
the sidecar and (on promotion) in the derived `source.json` (§10).

## 2. VERIFICATION STATUS TRANSITIONS
States: `UNVERIFIED` → `SEARCH_SNIPPET_ONLY` (current 108) → one of:
- `FULL_TEXT_VERIFIED` — every critical metric confirmed against a locator in accessible
  source text.
- `PARTIALLY_VERIFIED` — the diagnosis-/outcome-critical metrics are confirmed but some
  non-critical metrics remain snippet-only (record usable; non-critical metrics dropped
  or flagged `inferred`).
- `SECONDARY_VERIFIED` — confirmed only via a credible secondary that itself cites the
  primary (max reliability B; never A).
- `NEEDS_RECHECK` — attempted, inconclusive; returns to the queue.
- `SOURCE_INACCESSIBLE` — primary + archive + portal all failed (§8).
- `REJECTED` — contradicted, fabricated-on-inspection, or unsupportable (§6, §10).
Allowed transitions: snippet → {full, partial, secondary, needs_recheck, inaccessible,
rejected}; needs_recheck → any; inaccessible → {full, partial, secondary, rejected}
when access is later obtained. **No transition may skip evidence**: promotion-eligible
states (`FULL_TEXT_VERIFIED`, `PARTIALLY_VERIFIED`) require ≥1 metric_verification with a
locator. Transitions are append-only in the audit log (§ WORKFLOW).

## 3. EVIDENCE LOCATOR FORMAT
Every confirmed metric carries a `locator` that lets a re-checker find the exact figure:
- **SEC filing:** `{accession_no, form_type, section, page_or_item, exhibit?}` e.g.
  `EDGAR 0000320193-22-000108 · 10-K · Item 8 / Consolidated Statements of Operations · p.31`.
- **Earnings transcript:** `{event, date, speaker, paragraph/timestamp}`.
- **Government/parliamentary report:** `{report_id, section, paragraph/table_no, page}`.
- **Dataset:** `{dataset_id, table/file, column, row_key, release_version}`.
- **Court/bankruptcy docket:** `{court, case_no, docket_entry, page}`.
- **Archived page:** `{archive_provider, archive_timestamp_url, original_url, anchor}`.
Locators are mandatory for `FULL_TEXT_VERIFIED`. A bare domain or homepage URL is **not**
a locator and never satisfies verification.

## 4. CITATION FORMAT (canonical, stored hidden)
`<Publisher/Issuer>. "<Title>." <Form/Doc type>, <publication/filing date>. <Locator>.
Retrieved <accessed_date> via <access_method/resolved_url>.`
The citation lives only in `verification.json` and the derived `source.json` — **never**
in the engine-visible `01_case_input.json` (§ leakage).

## 5. METRIC VERIFICATION RULES (per figure in `source_backed_metrics`)
Each metric becomes a `metric_verification`:
```
{ "metric": "net_loss_2018_usd", "candidate_value": 1.9e9,
  "verified_value": <as found>, "unit": "USD", "period": "FY2018",
  "locator": {…§3}, "match": "EXACT | ROUNDED | RANGE | MISMATCH | NOT_FOUND",
  "is_critical": true }
```
Rules: (a) the value must appear in the source at the locator; (b) `EXACT` or `ROUNDED`
(documented rounding, e.g. "$1.9B" for 1,895M) → confirmed; (c) `RANGE` allowed only if
the source itself gives a range; (d) `MISMATCH` → contradiction (§6); (e) `NOT_FOUND` →
the metric is dropped or demoted to `inferred` with a stated basis, never kept as fact.
A metric is **critical** if it triggers the candidate diagnosis bucket or substantiates
the outcome_category. **All critical metrics must be `EXACT`/`ROUNDED` for
`FULL_TEXT_VERIFIED`.**

## 6. CONTRADICTION HANDLING
If a verified value contradicts the candidate (`MISMATCH`), or two credible sources
disagree:
- Record both values + locators in `contradictions[]`.
- Prefer the **primary** (filing/government/dataset) over secondary.
- If the contradiction is on a **critical** metric and unresolved → `decision: REJECT`
  (the candidate cannot back a ground-truth key).
- If on a non-critical metric → drop that metric, keep the record, note the discrepancy.
- A contradiction that flips the `outcome_category` or `candidate_diagnosis_bucket`
  forces re-classification and a second reviewer.

## 7. RELIABILITY UPGRADE / DOWNGRADE RULES
- **Upgrade to A:** only when the figure is confirmed in a primary SEC/government/dataset
  source at a locator (not via journalism). The 2 corroborated C records (SRC-030,
  SRC-066 via SRC-107/108) may rise to **B** (corroborated secondary), not A.
- **Hold at B:** confirmed via named journalism or first-party postmortem corroborated by
  a second source.
- **Downgrade:** if full-text inspection shows the snippet figure was wrong, mismatched,
  or unsupported → downgrade one grade and re-verify; if unsupportable → `REJECT`.
- **C → never promotable alone:** an uncorroborated C (e.g. SRC-103 Schlitz) must gain a
  corroborating source or be rejected for promotion (may stay as context only).

## 8. FULL-TEXT-UNAVAILABLE HANDLING
If the primary cannot be opened (paywall, 403, removed):
1. Try an **archive** (Wayback/official archive) → if the archived page shows the figure
   at a locator, status `FULL_TEXT_VERIFIED` with `access_method: ARCHIVE`.
2. Try the **official portal** (EDGAR full-text search, agency portal, dataset download).
3. If still unreachable → `SOURCE_INACCESSIBLE`; the record is **not** promotable and is
   queued for manual review (§9). It is **never** counted as verified and **never** backs
   a case while inaccessible. Snippet figures alone never satisfy verification.

## 9. ARCHIVE / MANUAL-REVIEW FALLBACK
- **Archive tier:** archived snapshot with a visible locator is acceptable primary-equivalent
  evidence (record the archive timestamp URL).
- **Manual-review tier:** a human reviewer opens the PDF/filing/dataset, records the
  locator + observed value, and signs `verifier: human:<id>`. Manual review is the final
  fallback for `SOURCE_INACCESSIBLE` and for any A-grade promotion the automated path
  could not confirm. Dual review (a second reviewer confirms blind) is required for any
  record that will carry a ground-truth **answer key** (per standard §6 / build-plan §5).

## 10. PASS/FAIL CRITERIA — PROMOTION TO REAL_SOURCE_BACKED
A candidate is promoted (a derived hidden `source.json` is written, status
`REAL_SOURCE_BACKED`) **only if ALL hold**:
1. `verification_status ∈ {FULL_TEXT_VERIFIED, PARTIALLY_VERIFIED}` (or `SECONDARY_VERIFIED`
   for B-max records) with ≥1 located critical metric.
2. Every **critical** metric `EXACT`/`ROUNDED` at a locator; 0 unresolved `MISMATCH` on
   critical metrics.
3. `reliability_rating ∈ {A, B}` (C only if corroborated → B).
4. `outcome_evidence_verified: true` (the documented outcome is confirmed, or the case is
   explicitly blind-outcome with the outcome withheld).
5. `supports_ground_truth ∈ {YES, PARTIAL}` (standard §2) — the source can justify the
   diagnosis/outcome the hidden key will assert.
6. `leakage_recheck_passed: true` — no citation/URL/identity/outcome token would leak into
   any engine-visible input derived from it.
7. Dual review complete for key-bearing records.
**FAIL → `HOLD` (fixable) or `REJECT` (unsupportable).** No promotion on snippet-only
evidence. The promotion does not author a case; it only certifies the source.

---

## ACCEPTANCE FOR THIS DESIGN
Verification is correctly specified when: every promotion-eligible record has a
`verification.json` with located, matched critical metrics; reliability changes are
justified; contradictions are recorded; inaccessible sources are quarantined (not
promoted); and the process is reproducible (locators let a re-checker reconfirm).
**Stage A stays BLOCKED until the 108 candidates are run through this and the
benchmark is built and re-trialed.**
