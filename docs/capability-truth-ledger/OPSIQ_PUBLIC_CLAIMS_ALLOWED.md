# OpsIQ — ALLOWED Public Claims

**Date:** 2026-07-07 · Truth-control audit (PASS 34).

These claims are **allowed** because each is backed by named source + tests + the
required CI lane + audit evidence in the repo (see OPSIQ_CAPABILITY_MATRIX.json and
OPSIQ_CAPABILITY_EVIDENCE_LEDGER.json). Every allowed claim is carefully scoped to
what is *demonstrated in tests and CI*, not to real-world business outcomes.

## Governance & safety (strongest ground)
1. "OpsIQ is a **governed** business-intervention system: nothing material executes without the right approval." — approval-threshold-policy + process-execution-bridge, DB-verified in LANE_B.
2. "OpsIQ takes **no autonomous external action** — it proposes; the owner decides and acts." — autonomy-policy + capability-registry.
3. "OpsIQ **fabricates no money** — missing financial data becomes a data task, never a fake number." — cash-profit-protection, schema-enforced + CI.
4. "OpsIQ requires **evidence** before a correction is marked done." — process-execution-bridge `EVIDENCE_REQUIRED`, DB-verified.
5. "OpsIQ enforces **workspace isolation** — one business's data cannot leak into another's." — adjudication-authorization-cross-scope.db, DB-verified.
6. "OpsIQ **refuses to claim improvement** without a verified executed correction." — sop-training-effectiveness-loop / effectiveness-attribution, CI-verified.

## What the engine demonstrably does (in tests + CI)
7. "OpsIQ deterministically **interprets messy free-text signals** into structured, evidence-tagged issues." — public-signal-interpretation, end-to-end DB proof.
8. "OpsIQ **prioritises** many simultaneous issues and **explains** each decision coherently." — public-signal-prioritisation + owner-cockpit-decision-explanation, DB proof.
9. "OpsIQ is **survival-first**: it ranks survival above growth and stays honest when a business is unrecoverable." — business-survival-recovery, DB proof.
10. "OpsIQ drives recovery through **evidence-gated milestones** that cannot be skipped." — recovery-milestone-execution, DB proof in required lane.
11. "OpsIQ routes staff issues to **training/coaching**, never blame or discipline." — staff-training-assignment-engine, DB proof.
12. "OpsIQ **blocks scale-before-validation** and designs bounded, falsifiable experiments first." — opportunity-validation-experiment-engine, DB proof.

## Method / rigor claims
13. "OpsIQ has **911 automated tests**, including **28 DB-backed simulations** running against real Postgres in the required CI lane on every PR." — countable; LANE_B verified by log inspection.
14. "OpsIQ's capabilities have been through **19 recorded audit passes**, including hostile full-repo adversarial audits." — docs/audits/.

## Mandatory scoping on every allowed claim
- Always add: **"demonstrated in tests and CI"** — never imply a real business result.
- Never drop the word **governed** / **owner-approved** from an execution claim.
- If a listener could hear "it does this for a real business automatically," restate the human-in-the-loop boundary.
