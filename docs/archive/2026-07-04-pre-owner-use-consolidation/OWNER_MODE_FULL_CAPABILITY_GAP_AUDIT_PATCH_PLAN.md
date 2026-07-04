# Owner Mode Full Capability Gap Audit — PATCH PLAN

Audit-of-the-audit. This plan lists the corrections `OWNER_MODE_FULL_CAPABILITY_GAP_AUDIT.md`
needs to fully satisfy the founder's requirement. **No product/test/workflow files
were changed. The original audit was NOT edited. Nothing was committed or pushed.**

The original audit is **structurally complete** — it contains every required
section (A–J), all 35 capability areas (with all 6 columns), all 10 consultant
roles (with must/does/missing), all 18 Tumbledry/laundry items, all 10 modules
(with all 9 sub-fields), and all 8 No-Go rules. It is **not fully satisfactory**
because of the substantive defects below.

## P1 — Staleness (blocking credibility)

The audit is dated **2026-06-10** and its "Current Status" + "Recommended Next
Build Slice" are now factually wrong. Since that date:

- **Module 1 Owner Recovery** reached `OWNER_MODE_STAGING_PROVEN`
  (`MODULE1_OWNER_RECOVERY_STAGING_PROVEN_REPORT.md`, migration applied, runtime
  proof run 27379402334) — 2026-06-11.
- **Module 2 Financial Intelligence** was built end-to-end and is
  `STAGING_PROVEN + AUDITED` (`MODULE2_FINANCIAL_INTELLIGENCE_AUDIT_REPORT.md`,
  runs 27404358424 / 27406156168 / 27407345728) — 2026-06-12. The audit's
  instruction "do not start Module 2 until a real cycle is verified" was overtaken
  by events: Module 2 was built before real-business (M13) validation, under the
  later "M13 is a release gate, not a build gate" policy.
- **Cross-domain command center** (finance + recovery) is deployed-runtime-proven
  (run 27412646582); the `/owner` home shell is proven (run 27411312442).
- **Module 5 Cashflow** engine + detector + planner are built
  (`MODULE5_SLICE1/2/3_*` reports), deterministic and unit-proven.

Required fixes:
- Re-date the audit and add a "Repo state at audit time" line.
- Correct the **Current Status** cells that are now wrong, at minimum:
  - Cap 4 Profitability → still PARTIAL but cite Module 2 contribution work.
  - Cap 5 Cashflow & working capital → was NOT PROVEN; cashflow engine/detector/
    planner now exist (still not persisted/deployed) → PARTIAL with honest note.
  - Cap 22 Receivables/collections → note cashflow module's overdue/collection
    findings now exist in code.
  - Cap 29 Forecasting → unchanged but note finance trend basis.
- Replace Section I "Recommended Next Build Slice = Module 1 deployment
  hardening" — Module 1 is already staging-proven. The real current next item is
  **Module 13 real-business validation (release gate)** and/or continuing the
  Cashflow module to persistence/API/UI. State this explicitly.
- Reconcile Section H "Current status against these" — it says only #4 and #5 are
  PROVEN; #1 (real-DB migration) and #5 (dashboard) are now proven on staging, so
  re-classify #1, #4, #5 as PROVEN-ON-STAGING and keep #2/#3/#6/#7 as NOT met.

## P1 — Module-numbering inconsistency (blocking usability)

The capability map's **Build Module** column uses the audit's own M1–M10
numbering, which does **not** match `execution.md`:

| Domain | Audit "Build Module" | execution.md module |
|---|---|---|
| Cashflow | M6 | **Module 5** |
| Operations | M5 | Module 4 |
| Marketing | M4 | Module 6 |
| SOP/process | M8 | Module 7 |
| Strategy/scenario | M9 | Module 8 |
| Portfolio | M10 | Module 9 |

The actual build followed execution.md numbering (Cashflow = Module 5), directly
contradicting the audit (which maps cashflow to M6). Fix: either renumber the
audit's modules to match execution.md, or add an explicit cross-reference table
and a one-line note that the audit uses an independent "minimum module set"
numbering distinct from execution.md's phase numbering.

## P2 — Internally inconsistent tally

- Executive Verdict (line 11): "PROVEN on ~6 … PARTIAL on ~12 … NOT PROVEN ~17".
- Summary tally (line 88): "PROVEN ≈ 2 fully … PARTIAL ≈ 17 … NOT PROVEN ≈ 12".

These two counts contradict each other (6 vs 2 proven; 12 vs 17 partial). Pick one
reconciled, defensible count and use it in both places. The task forbids
hand-waving; the "≈" hedges should be replaced with an exact per-row count.

## P2 — Status-vocabulary violations

Allowed statuses are exactly: PROVEN, PARTIAL, NOT PROVEN, FAILED. The audit uses
the non-allowed hybrid **"PARTIAL→PROVEN"** in:
- Capability 35 (Industry templates, line 86).
- Consultant role 4 (Recovery consultant, line 95).

Replace each with a single allowed status (PARTIAL or PROVEN) plus prose if a
transition needs explaining. ("STRONG_FOUNDATION" in the Executive Verdict is a
verdict label, not a row status, and is acceptable.)

## P2 — "Any other practical expertise" clause not addressed

The founder requirement names 10 roles **and** "any other practical expertise
required to diagnose, recover, grow, and control a business." The audit covers
exactly the 10 named roles and is silent on the open-ended clause (e.g.,
people/HR, tax/compliance, legal, pricing-as-its-own-discipline). Add a short
subsection in Section E stating which additional practical expertises are in
scope, their status (expected NOT PROVEN), and where they would live — so the
open-ended clause is explicitly answered, not ignored.

## P3 — Minor

- Capability 35 evidence "PARTIAL→PROVEN" should also note thresholds are not yet
  field-calibrated against real Tumbledry numbers (already stated; keep).
- Section G modules are described well but several "models/APIs/UI needed" rows
  are terse; acceptable, no change required for completeness.

## What does NOT need changing

- All 10 sections (A–J) are present.
- All 35 capability areas are present, each with required functions / current
  status / evidence / missing gaps / priority / build module.
- All 10 consultant roles are present with must / does / missing / status.
- All 18 Tumbledry/laundry items are present with an allowed status + note.
- All 10 minimum modules are present with purpose / data / models-APIs-UI /
  calculations / diagnosis rules / outputs / verification / tests / acceptance.
- All 8 No-Go rules are present.

## Authorization note

This patch plan is the only file created by this audit task. Editing the original
`OWNER_MODE_FULL_CAPABILITY_GAP_AUDIT.md` requires explicit later authorization.
No commit or push was performed.
