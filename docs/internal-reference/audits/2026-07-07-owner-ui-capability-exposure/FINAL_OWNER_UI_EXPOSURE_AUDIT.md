# FINAL — Owner UI Capability Exposure Audit (PASS 35)

**Date:** 2026-07-07 · **Branch:** `claude/owner-ui-capability-exposure-audit`
**Base main:** `b066347f` (contains PR #165, PR #166)
**Classification:** `OWNER_UI_EXPOSURE_AUDIT_COMPLETE`

## Objective
Determine, from evidence, exactly which proven OpsIQ capabilities the owner can
actually see and use in the UI — and define the minimum cockpit for PASS 36.

## Headline (corrects PASS 34)
PASS 34 reported "**0 of 35** capabilities owner-visible in UI." That was too
strong at the module granularity. At the **owner-journey capability** granularity,
**17 of 32** audited capabilities are owner-visible:
- **8 OWNER_VISIBLE_ACTIONABLE** — owner cockpit, process execution tasks, approval
  policy, evidence-gated completion, reassessment/verification, adjudication,
  opportunity intelligence, browser/owner UI proof.
- **6 OWNER_VISIBLE_READ_ONLY** — audit logging, process correction, training,
  workload reduction, capability gap, effectiveness classification.
- **3 OWNER_VISIBLE_PARTIAL** — cockpit explanation, SOP/checklist correction,
  cash/profit protection.
- **9 BACKEND_ONLY** — incl. the entire unwired PASS 28-33 pipeline.
- **1 FROZEN_NOT_VISIBLE** (billing), **5 NOT_BUILT** (SaaS, connectors, Local Mode,
  shadow pilot, Product Hunt).

## The real situation
- **A governed cockpit already exists.** `owner/process-intelligence` renders one top
  process breakdown + the governed execution route (`ProcessExecutionBridgePanel`)
  wired to `POST /api/owner/process-execution` (`applyProcessExecutionAction`), plus
  ~9 proven capability panels behind progressive disclosure — all from ONE payload
  (`GET /api/owner/now-view`). Approval level, evidence requirement, missing-data, and
  "nothing auto-executes" are shown. This is the strongest owner surface and is
  server-authoritative, OWNER_MANAGE-gated, and workspace-scoped.
- **The newest proven pipeline is unwired.** business-survival-recovery,
  recovery-milestone-execution, owner-cockpit-decision-explanation, and public-signal-*
  are proven-by-tests but imported by no service/route/page — **no served endpoint**.
- **Owner-load risk is real.** The surface is dense and split across three cockpit
  pages (`owner/`, `owner/now`, `owner/process-intelligence`), uses `prompt()` for
  actions, and shows technical language by default.

## P0 / P1 gaps
- **P0 (owner journey blocker):** No single canonical minimum cockpit meeting the full
  10-section safety spec (distinct Blocked-Unsafe + Next-Reassessment blocks, proof
  drawer, labelled controls instead of `prompt()`). → **PASS 36 builds this**, reusing
  the proven now-view + process-execution routes.
- **P1 (core action):** explanation / approval / reassessment need to be distinct
  spec blocks (PASS 36); and the unwired PASS 28-33 pipeline needs served endpoints
  (**deferred** beyond PASS 36 — needs new backend, see DEFERRED_BROAD_GAPS.md).

## Safety posture (verified, unchanged)
No live LLM write-path; no autonomous external action; owner-only material decisions;
evidence-gated completion; workspace isolation; no fabricated money; no unsafe action
buttons; no hidden score in the owner surface.

## Deliverables (this pass — audit only, no product UI built)
`docs/audits/2026-07-07-owner-ui-capability-exposure/`:
FINAL_OWNER_UI_EXPOSURE_AUDIT.md · OWNER_UI_CAPABILITY_EXPOSURE_MATRIX.json (32 rows) ·
OWNER_UI_SURFACE_GAP_MAP.json · OWNER_LOAD_RISK_AUDIT.md · MINIMUM_OWNER_COCKPIT_SPEC.md ·
EVIDENCE_LEDGER.json · DEFERRED_BROAD_GAPS.md.

## Gates run (local)
prisma validate · tsc --noEmit · governance:scan:strict · lint:ratchet ·
truth-ledger-consistency test · next build (see PR for CI). No product source changed
in PASS 35 (audit-only), so no owner UI test/build regression risk.

## Classification justification
Every truth-ledger capability assessed; every exposure status evidence-based (page +
route traced); P0/P1 gaps identified; owner-overload risks identified; minimum cockpit
spec created; frozen capabilities not treated as visible; no product-readiness claim
made. → `OWNER_UI_EXPOSURE_AUDIT_COMPLETE`.
