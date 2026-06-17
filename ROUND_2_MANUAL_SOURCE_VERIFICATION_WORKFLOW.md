# ROUND 2 — MANUAL / USER-ASSISTED SOURCE VERIFICATION WORKFLOW

**Mode:** documentation only — no source collection, no benchmark cases, no scorer, no
engine/gate/answer-key change, **no record promoted**. **Date:** 2026-06-17 ·
**Branch:** `claude/round2-case-pack-authoring`.
**Not a Stage A pass claim. Stage A remains DO_NOT_PROMOTE / BLOCKED.**

Defines how the **owner/user verifies sources outside Claude's blocked environment**
and submits verified evidence back into the repo in a controlled format. Required
because automated full-text verification is impossible here (WebFetch HTTP 403 on all
primary domains; `web.archive.org` disallowed; SRC-001..012 correctly
`SOURCE_INACCESSIBLE`). Implements `ROUND_2_SOURCE_FULL_TEXT_VERIFICATION_DESIGN.md`
§8–§9 (manual-review fallback).

---

## 0. ROLES
- **Verifier (owner/user):** opens the real source, reads the relevant text, records the
  located figures into `ROUND_2_MANUAL_VERIFICATION_TEMPLATE.json`, commits it as a
  sidecar.
- **Claude (validator):** does NOT fetch; it **validates** the submitted manual record
  against the rules below, then (only if it passes and is explicitly authorized)
  generates the hidden `source.json`. Claude never invents or "fills in" a figure.

## 1. WHAT THE VERIFIER MUST COLLECT FROM EACH SOURCE
For each `SRC-0XX` the verifier opens the cited source and records:
1. The **access method** actually used (direct, EDGAR, official PDF, library/news
   archive, dataset download, court PACER/portal, archived snapshot).
2. A **locator** for every critical metric (§3) — the exact place a re-checker would
   look.
3. The **verified value** as printed in the source (with unit + period), and whether it
   **matches** the candidate value (`EXACT | ROUNDED | RANGE | MISMATCH | NOT_FOUND`).
4. **Outcome evidence** (the documented outcome) with its locator.
5. A **short excerpt** (≤ 25 words / one short sentence) per critical fact — enough to
   prove the figure is on the page, **never** a full paragraph or article (§ hard rules).
6. Separation of **direct facts** (printed in the source) vs **inferred facts** (the
   verifier's reasoning, not stated).
7. Any **mismatch** between candidate and source, and any **missing** candidate metric.
8. A **leakage certification** (§8).

## 2. WHAT MAKES A METRIC "VERIFIED"
A critical metric is verified only when the verifier has **read it in the source** at a
locator and recorded `match ∈ {EXACT, ROUNDED, RANGE}`. **Search snippets do not count.**
A candidate metric the verifier cannot find → `NOT_FOUND` (dropped or moved to
`inferred_facts`, never kept as fact). A contradicting value → `MISMATCH` (§ design §6).

## 3. ACCEPTABLE EVIDENCE LOCATORS (by source type)
- **SEC filing (10-K/10-Q/8-K/S-1):** accession number + form + section/Item + statement
  name + page. e.g. `EDGAR 0000320193-22-000108 · 10-K · Item 8 · Consolidated
  Statements of Operations · p.31`.
- **PDF report (government/parliamentary/administrator/restructuring):** document
  title/id + section/paragraph or table number + PDF page.
- **News article:** outlet + headline + publication date + paragraph number (and, if the
  live page may change, an archived-snapshot URL with timestamp). Excerpt ≤ 25 words.
- **Court / bankruptcy docket:** court + case number + docket entry number + page.
- **Dataset:** dataset name + release/version + table/file + column + row key (or the
  aggregate cell). e.g. `BLS BDM · 2025 release · Table 5 · "1-year survival" · 2023 cohort`.
- **Earnings-call transcript:** event + date + speaker + paragraph or timestamp.
- A **bare domain/homepage URL is never a valid locator.**

## 4. HANDLING EACH SOURCE TYPE
- **SEC filings:** prefer EDGAR full-text; record accession + Item + statement line.
  Financial-statement line items are A-grade primary.
- **PDFs:** cite the PDF page as displayed; if pagination differs, cite the section/table.
- **Articles:** record the figure + paragraph + a ≤25-word excerpt; if paywalled, use an
  archived snapshot and record its timestamp, or mark `SOURCE_INACCESSIBLE`.
- **Court dockets:** cite case number + docket entry; if access requires PACER fees and
  the verifier cannot access, mark `SOURCE_INACCESSIBLE`.
- **Datasets:** download the file/version; cite table+column+row; note license.
- **Transcripts:** cite speaker + timestamp/paragraph; prefer the company's own posted
  transcript or a recognized transcript service.

## 5. DIRECT FACT vs INFERENCE
`direct_facts[]` = statements printed verbatim/figures shown in the source.
`inferred_facts[]` = the verifier's interpretation (e.g. "negative unit economics" when
the source shows revenue < COGS but doesn't use that phrase). **A case's critical
diagnosis/outcome fact must be a direct fact, not an inference**, for promotion.

## 6. SCREENSHOTS / PAGE REFERENCES
If a figure is in an image/scanned PDF, the verifier may save a screenshot under
`simulation_runs/round_002_source_candidates/manual_evidence/SRC-0XX/` and reference the
filename in `screenshots_or_files_referenced[]` (plus the page/section). Screenshots are
**evidence of locator**, not a substitute for recording the value. Keep images free of
extraneous copyrighted full-page text (crop to the relevant figure/table where possible).

## 7. FLAGGING INACCESSIBLE SOURCES
If the verifier cannot open the source (paywall, removed, fee-gated, dead link with no
archive), set `final_verification_status: SOURCE_INACCESSIBLE`, `promoted_allowed: NO`,
and note every attempt. The record stays HOLD and is excluded from any verified/promoted
count. A substitute source may be proposed in `reviewer_notes` (collected in a future
collection slice, not invented).

## 8. CERTIFYING NO ANSWER-KEY LEAKAGE
The verifier certifies (`leakage_certified: true`) that nothing they recorded will, when
a benchmark case is later derived, place into the **engine-visible** `01_case_input.json`
any of: company identity that reveals the outcome, the documented outcome, the citation/
URL, dates that reveal the outcome, or any answer-key field. Verified facts and citations
live only in the hidden sidecar / future `source.json` / `key.json`. Claude re-runs the
`LEAKAGE_MARKERS` scan during validation.

## 9. SUBMITTING VERIFIED RECORDS BACK INTO THE REPO
1. Copy `ROUND_2_MANUAL_VERIFICATION_TEMPLATE.json`, fill it for one `SRC-0XX`.
2. Save it as a **sidecar**:
   `simulation_runs/round_002_source_candidates/slice_<n>/SRC-0XX.manual_verification.json`.
   **Do NOT edit the original `SRC-0XX.json`.**
3. Optional evidence images under `…/manual_evidence/SRC-0XX/`.
4. Commit + push (or paste the filled JSON into the chat and ask Claude to write the
   sidecar verbatim — Claude will not alter values).

## 10. HOW CLAUDE VALIDATES A SUBMITTED MANUAL RECORD
Claude (no fetching) checks:
- Required template fields present and well-formed.
- Every **critical** metric has a **locator** (§3) and `match ∈ {EXACT, ROUNDED, RANGE}`;
  `MISMATCH`/`NOT_FOUND` on a critical metric → cannot promote.
- ≥ 1 located critical metric **or** a located outcome fact exists (hard rule).
- `direct_facts` vs `inferred_facts` separation respected; critical fact is direct.
- Excerpts are short (≤ 25 words each); no full-article text.
- `leakage_certified: true` and the `LEAKAGE_MARKERS` scan passes.
- `final_verification_status` is consistent with the evidence
  (`FULL_TEXT_VERIFIED`/`PARTIALLY_VERIFIED`/`SECONDARY_VERIFIED`/`SOURCE_INACCESSIBLE`).
Claude records the validation outcome in the append-only ledger and the record's
`verification.json` (updating it from `SOURCE_INACCESSIBLE`), **without** editing the
original candidate.

## 11. HOW PROMOTED `source.json` IS GENERATED (only after validation + authorization)
When a manual record passes §10 **and** the user explicitly authorizes promotion, Claude
writes the hidden `source.json` (citation, located metrics, reliability, outcome
evidence, contamination risk) and marks the record `REAL_SOURCE_BACKED` in the ledger.
This certifies the **source only** — it does not author a benchmark case. No promotion
ever occurs from snippet evidence or without §10 passing.

## HARD RULES (restated)
- Manual verification must not rely on search snippets.
- No source promoted without ≥ 1 located critical metric **or** located outcome fact.
- No full-article copying (short excerpts only).
- No answer-key leakage into engine-visible inputs.
- All manual records are **sidecars**; original `SRC-0XX.json` is never edited.

**Stage A remains DO_NOT_PROMOTE / BLOCKED.**
