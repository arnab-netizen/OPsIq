# ROUND 2 — MANUAL VERIFICATION INSTRUCTIONS (owner quick-start)

**Date:** 2026-06-17 · **Branch:** `claude/round2-case-pack-authoring`.
**Stage A remains DO_NOT_PROMOTE / BLOCKED.** Step-by-step companion to
`ROUND_2_MANUAL_SOURCE_VERIFICATION_WORKFLOW.md`. Use this when verifying sources on a
machine with normal internet (Claude's sandbox cannot — WebFetch 403, archive blocked).

---

## WHY YOU'RE DOING THIS
The 108 source candidates were gathered from search snippets only. None can become a
benchmark source until a human opens the real source and confirms the numbers. This is
the gating blocker for the whole Round 2 benchmark.

## WHAT YOU NEED
- A browser with access to SEC EDGAR, government PDFs, news sites, dataset portals.
- The candidate file you're checking: `simulation_runs/round_002_source_candidates/slice_<n>/SRC-0XX.json`
  (it lists the `source_url` and `source_backed_metrics` to confirm).
- A copy of `ROUND_2_MANUAL_VERIFICATION_TEMPLATE.json`.

## STEP BY STEP (per source)
1. **Open** `SRC-0XX.json`; note its `source_url` and the metrics under
   `source_backed_metrics` (the **critical** ones are amounts/dates/counts that drive the
   diagnosis or outcome).
2. **Open the real source** in your browser. If it's paywalled/removed, try the
   publisher's archive or a Wayback snapshot. If still unreachable → mark
   `SOURCE_INACCESSIBLE` and stop (record your attempts in `reviewer_notes`).
3. **Find each critical figure on the page.** Record in the template: the
   `verified_value` (as printed), the `locator` (Item/section/page/table/row/paragraph —
   not a homepage), and whether it matches (`EXACT`, `ROUNDED` for documented rounding,
   `RANGE` if the source gives a range, `MISMATCH` if it disagrees, `NOT_FOUND` if absent).
4. **Record the outcome** (e.g. "filed Chapter 11 on …", "shut down", "emerged") with its
   locator.
5. **Add a short excerpt** (≤ 25 words) per critical fact — just enough to prove it's on
   the page. **Do not paste whole paragraphs or articles.**
6. **Split direct vs inferred.** Anything you concluded but the source doesn't state goes
   in `inferred_facts`, not `direct_facts`.
7. **Set `final_verification_status`:** `FULL_TEXT_VERIFIED` (you read the primary and all
   critical metrics match at a locator), `PARTIALLY_VERIFIED` (critical ones match, some
   minor ones not found), `SECONDARY_VERIFIED` (only a credible secondary that cites the
   primary — reliability B max), or `SOURCE_INACCESSIBLE`.
8. **Certify leakage:** set `leakage_certified: true` only if no company identity/outcome/
   citation/date that reveals the answer would end up in an engine-visible case input.
9. **Set `promoted_allowed`:** `YES` only if there is ≥ 1 located critical metric **or** a
   located outcome fact, status is a verified state, and leakage is certified. Otherwise `NO`.

## WHERE TO PUT IT
Save the filled file as a **sidecar** (do not touch the original):
```
simulation_runs/round_002_source_candidates/slice_<n>/SRC-0XX.manual_verification.json
```
Optional images: `…/manual_evidence/SRC-0XX/<name>.png`. Then commit + push — **or** paste
the filled JSON into the chat and say "write this as the SRC-0XX manual_verification
sidecar"; Claude will save it verbatim (it will not change your numbers).

## WHAT CLAUDE DOES NEXT
Claude validates your sidecar (fields present; every critical metric has a locator and a
matching value; ≥1 located critical metric or outcome fact; short excerpts only;
direct-vs-inferred respected; leakage scan passes) and records the result in
`ROUND_2_SOURCE_VERIFICATION_LEDGER.json` and the record's `verification.json`. Only when
a record passes **and** you explicitly authorize promotion does Claude generate the hidden
`source.json` and mark it `REAL_SOURCE_BACKED`. Promotion certifies the source — it does
**not** author a benchmark case (separate, separately-authorized step).

## SUGGESTED ORDER (cheapest, highest-value first)
1. **SRC-003 (Hertz)** and **SRC-004 (GM/Treasury)** — already have strong independent
   corroboration; one EDGAR/Treasury read each should clear them to A.
2. The other **A-grade primaries** (SEC filings, government datasets: SRC-007, SRC-008,
   and the slice-2/3 SEC filings).
3. The **GOOD/AMBIGUOUS** records (underfilled valences) so the benchmark isn't failure-biased.
4. The **C-rated** records (SRC-030, SRC-066, SRC-103) — confirm or reject.

## DON'Ts
- Don't rely on a Google/search snippet — open the actual source.
- Don't paste full articles or large excerpts.
- Don't put citations/identities/outcomes into any engine-visible case input.
- Don't edit the original `SRC-0XX.json` — always a sidecar.

**Stage A remains DO_NOT_PROMOTE / BLOCKED until verified sources back the benchmark and
the engine is re-trialed.**
