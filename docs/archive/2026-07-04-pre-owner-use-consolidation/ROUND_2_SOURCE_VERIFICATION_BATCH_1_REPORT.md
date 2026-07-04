# ROUND 2 — SOURCE VERIFICATION BATCH 1 REPORT (SRC-001..SRC-012)

**Mode:** verification only — no source collection, no benchmark cases, no scorer, no
engine/gate/answer-key change, **no record promoted, no `source.json` written**.
**Date:** 2026-06-17 · **Branch:** `claude/round2-case-pack-authoring`.
**Not a Stage A pass claim. Stage A remains DO_NOT_PROMOTE / BLOCKED.**

Executes `ROUND_2_SOURCE_VERIFICATION_WORKFLOW.md` over the first 12 candidates per
`ROUND_2_SOURCE_FULL_TEXT_VERIFICATION_DESIGN.md`. Append-only sidecars written; the
original `SRC-0XX.json` candidates were **not edited**.

---

## 0. HEADLINE — ENVIRONMENT CANNOT DO FULL-TEXT VERIFICATION
`WebFetch` returned **HTTP 403 for every primary domain attempted** (sec.gov,
home.treasury.gov, cnbc.com, npr.org, en.wikipedia.org) and **`web.archive.org` is
disallowed** for WebFetch. Only `WebSearch` (snippets) is available. Per the design's
**hard rule — "search snippets are not full-text verification"** — **0 records can be
`FULL_TEXT_VERIFIED` or `SECONDARY_VERIFIED`** in this environment (both require opening
and reading source/secondary full text at a locator). The honest, rule-compliant result
is that all 12 are **`SOURCE_INACCESSIBLE`** with decision **HOLD**. This is an
environment constraint the design anticipates (§8/§9 → archive/manual-review fallback in
a fetch-capable environment), **not** a content failure.

## 1. RESULTS (per the requested tallies)
| Status | Count |
|---|---|
| Records processed | **12** (SRC-001..012) |
| FULL_TEXT_VERIFIED | **0** |
| PARTIALLY_VERIFIED | **0** |
| SECONDARY_VERIFIED | **0** |
| SOURCE_INACCESSIBLE | **12** |
| REJECTED | **0** |
| **Promotable to REAL_SOURCE_BACKED** | **0** |

No contradictions found; **no reliability changes** (cannot upgrade to A without a
primary-at-locator read; no contradiction → no downgrade).

## 2. WHAT WAS PRODUCED (append-only, hidden provenance)
- 12 sidecars `simulation_runs/round_002_source_candidates/slice_1/SRC-0XX.verification.json`
  recording: access attempts (primary 403, archive blocked, portal=snippets-only),
  per-metric `metric_verifications` (each `match: NOT_FETCHED`, locator `null`),
  snippet-corroboration level, reliability (unchanged), decision HOLD, and
  `ready_for_fulltext_run: true`.
- `ROUND_2_SOURCE_VERIFICATION_LEDGER.json` — append-only, run 1, 12 transition entries
  (`SEARCH_SNIPPET_ONLY -> SOURCE_INACCESSIBLE`).

## 3. CORROBORATION GATHERED (snippet-level, NOT full-text)
To make the future fetch-capable run cheap, independent corroboration was attempted:
- **SRC-003 Hertz — MULTI_SOURCE_INDEPENDENT.** ">$5B debt eliminated", ">$1B value to
  shareholders", "$2.8B exit credit facility", "~$7B ABS facility", confirmation
  2021-06-10, exit 2021-06-30 corroborated across ≥3 independent domains (PRNewswire,
  Hertz newsroom, AP/NY1) beyond the SEC primary. Prioritize for promotion once a
  filing locator is captured.
- **SRC-004 GM/Treasury — MULTI_SOURCE_INDEPENDENT.** ~$51B invested and ~$39B recovered
  corroborated (Treasury, ProPublica, Time, NBC). Net taxpayer loss is a **RANGE**
  (~$10.5B GM-only per NBC vs ~$11.2B incl. GMAC per Time) — a scope difference, **not a
  mismatch**; recorded as RANGE in the sidecar.
- **SRC-001,002,005–012 — COLLECTION_SNIPPET_ONLY.** Only the candidate-domain snippet
  from collection; no independent full-text confirmation yet.

## 4. HARD-RULE COMPLIANCE
- ✅ No `FULL_TEXT_VERIFIED` without opening source text (none marked).
- ✅ Snippets not treated as full-text verification.
- ✅ Inaccessible sources marked `SOURCE_INACCESSIBLE` (primary + archive + portal all
  exhausted in this env).
- ✅ No `SECONDARY_VERIFIED` claimed (cannot open secondary full text either).
- ✅ No record promoted; no `source.json` written; original candidate JSON untouched.

## 5. NEXT STEP
Run batch 1 (and 2–9) in a **fetch-capable environment** (working WebFetch or
manual EDGAR/PDF/dataset review) so each critical metric can be confirmed at a locator;
SRC-003 and SRC-004 are the strongest promotion candidates (multi-source corroborated,
A-grade primaries) and should clear first. Until then the 12 remain HOLD /
`SOURCE_INACCESSIBLE` and **0 are promotable**. **Stage A remains DO_NOT_PROMOTE /
BLOCKED.**
