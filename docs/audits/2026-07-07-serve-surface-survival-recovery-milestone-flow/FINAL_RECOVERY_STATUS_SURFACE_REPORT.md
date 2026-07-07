# FINAL — Serve + Surface Survival→Recovery Milestone Flow (PASS 37)

**Date:** 2026-07-07 · **Branch:** `claude/serve-surface-survival-recovery-milestone-flow`
**Base main:** `dcad9426` (contains PR #165–#168)
**Classification:** `RECOVERY_STATUS_SURFACE_PROVEN` (subject to required CI green + LANE_B proof)

## Objective
Serve the proven PASS 32 survival + PASS 33 recovery milestone pipeline to the owner
through a governed OWNER-gated read endpoint, and surface it read-only in
`/owner/cockpit` **without overwhelming the owner** and **without new recovery logic,
mutation, fabricated money, or guaranteed recovery**.

## What was built
- **`GET /api/owner/recovery-status`** — OWNER_VIEW-gated, workspace-scoped, read-only,
  fail-closed (500 on an incoherent projection). Reads only existing proven sources.
- **`owner-recovery-status.ts`** (domain, pure) — projects the proven modules into a
  16-field response with a **fail-closed Zod schema**: thrive ELIGIBLE only if
  stabilization OPEN; stabilization OPEN only if no milestone blocked; restructure/
  shutdown keeps thrive BLOCKED + owner approval; active status must block scale/growth;
  mandatory no-guarantee statement; no fabricated money. Plus a **conservative crisis
  derivation** (real signals only; DATA_INSUFFICIENT + generic defaults ignored →
  empty workspace reads NONE; constraints never invented → unrecoverable never faked).
- **`owner-recovery-status.service.ts`** — composes `getOwnerNowView` →
  conservative CrisisInput → proven modules; reads workspace-scoped tasks for links;
  mutates nothing.
- **`MinimumOwnerCockpit` RecoverySection** — a **collapsed** "Recovery status"
  section (not a second cockpit): state, next bottleneck, stabilization/thrive gates,
  required evidence, required reassessment, blocked unsafe actions, owner-approval,
  linked-task count, and the no-guarantee caveat. The top action stays primary.

## Response shape (16 fields)
recoveryStatus (11-state enum), topRecoveryBottleneck, nextMilestone, completedMilestones,
blockedMilestones, requiredEvidence, requiredReassessment, ownerApprovalRequired,
managerStaffActions, blockedUnsafeActions, stabilizationGate, thriveGate, uncertaintyCaveat,
noGuaranteeStatement, sourceRefs, linkedProcessExecutionTaskIds.

## Safety posture
Read-only (no mutation); OWNER-gated + workspace-scoped (isolation proven); no live
external action; no fabricated money/cash/runway/ROI/win-probability; thrive gate never
opens without proven stabilization; unrecoverable stays restructure/shutdown; every
response carries "Recovery is not guaranteed."; recovery section is collapsed and never
displaces the top action.

## Tests
- **Unit (domain):** `owner-recovery-status.test.ts` — 11/11 (clean→NONE, in-progress,
  thrive-eligible only with stabilization + owner approval, regression, unrecoverable,
  no money, no score, schema fail-closed, linked ids, conservative derivation).
- **Component:** `minimum-owner-cockpit-recovery.test.tsx` — 13/13 (collapsed default,
  state+bottleneck, evidence, reassessment, gates, blocked, no-guarantee, no milestone/
  audit dump, no score, clean, top-action-primary, no money). Existing cockpit 20/20 intact.
- **DB (LANE_B + LANE_A):** `owner-recovery-status-read.db.test.ts` — 6/6 (real read path,
  clean=NONE, no-guarantee + blocked present, no fake money, **workspace isolation**,
  gates never open without proven outcomes). Wired into the required lane.
- **Browser:** `46-owner-cockpit.spec.ts` extended (recovery section collapsed → expand →
  no-guarantee; no guaranteed/`$`/ready-to-scale copy). Runs in `owner-pilot-e2e`.

## Gates run (local)
prisma validate ✓ · tsc ✓ · governance:scan (0 new; fixed 2 unsafe-error-render
false-positives without weakening the rule) ✓ · lint:ratchet (0 new) ✓ · unit+component
79 ✓ · DB 17 ✓ · next build ✓ (`/api/owner/recovery-status` + `/owner/cockpit` present).

## Classification justification
Owner-gated read endpoint exists; wrong workspace fails closed (isolation, db #5);
clean fabricates nothing (db #2, unit #1); recovery appears in the cockpit collapsed by
default (component #1, browser); stabilization/thrive shown safely (never open without
proof); no recovery guarantee (mandatory statement); unsafe actions blocked; owner load
stays low (top action primary, section collapsed); component/API + DB proof pass; browser
spec added; required CI must be green with LANE_B proof of the new DB test. →
`RECOVERY_STATUS_SURFACE_PROVEN`.
