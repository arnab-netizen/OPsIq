# FINAL — Serve + Surface Public Signal Intelligence (PASS 39)

**Date:** 2026-07-07 · **Branch:** `claude/serve-surface-public-signal-intelligence`
**Base main:** `1a2549dd` (contains PR #165–#170)
**Classification:** `PUBLIC_SIGNAL_SURFACE_PROVEN` (subject to required CI green + LANE_B proof)

## Objective
Expose the proven PASS 28-30 public-signal intelligence pipeline to the owner through a
governed, read-only, owner-gated endpoint and a low-load collapsed cockpit section —
**without** live ingestion, connectors, LLM/NLP, autonomous action, raw text, PII,
prompt-injection leakage, fabricated money, or treating weak public signals as fact.

## What was built
- **`GET /api/owner/public-signals`** — OWNER_VIEW-gated, workspace-scoped, read-only,
  fail-closed (500 on incoherent projection). Reads only already-persisted controlled
  intake records.
- **`owner-public-signals.ts`** (domain, pure) — runs the proven pipeline
  (interpret → PII-strip → prompt-injection resist → conflict-resolve → prioritise) and
  projects to an 18-field response with a **fail-closed Zod schema**: rawTextHidden must
  be true; piiStripped must be true; the no-live-ingestion statement is mandatory; active
  status must list blocked unsafe actions; CONFLICTING_SIGNALS needs a real conflict
  cluster; MONITOR_ONLY carries no material action; no fabricated money/ROI/win-probability.
- **`owner-public-signals.service.ts`** — reads the workspace's persisted
  `ExternalOpportunitySignal` rows (status ACTIVE), maps each `rawDescription` to a raw
  input, runs the pipeline; no live fetch; mutates nothing; NONE when there are no records.
- **`MinimumOwnerCockpit` OutsideSignalsSection** — a **collapsed** "Outside signals"
  section (not a second dashboard): status, top action, why, source/evidence summary,
  missing data, validation-required, blocked unsafe actions, owner-approval, uncertainty
  caveat, and the "OpsIQ does not fetch live web data" statement. The top action stays primary.

## Response shape (18 fields)
publicSignalStatus (7-state enum), topPublicSignalAction, whyThisMatters, sourceQualitySummary,
evidenceStrengthSummary, uncertaintyCaveat, missingData, validationRequired, ownerApprovalRequired,
evidenceRequired, blockedUnsafeActions, groupedSignalClusters, monitorOnlySignals,
linkedProcessExecutionTaskIds, auditTraceRefs, rawTextHidden, piiStripped, noLiveIngestionStatement.

## Safety posture
Read-only (no mutation); OWNER-gated + workspace-scoped (isolation proven); NO live web
fetch / connectors / LLM; raw text hidden; PII stripped; prompt-injection text never
surfaced; no fabricated money/ROI/win-probability; weak public source never shown as
verified fact; every response states "OpsIQ does not fetch live web data in this view."

## Tests
- **Unit (domain):** `owner-public-signals.test.ts` — 10/10 (clean→NONE, real signals →
  governed clusters with no raw text, adversarial PII+injection sanitised, conflicting
  labelled, no money, no score, schema fail-closed, mapper).
- **Component:** `minimum-owner-cockpit-public-signals.test.tsx` — 13/13 (collapsed default,
  status+action, caveat, source/evidence, missing data, blocked, no-live-ingestion,
  no raw text/PII/score, clean, top-action-primary, no money/forbidden copy). Existing
  cockpit + recovery tests intact.
- **DB (LANE_B + LANE_A):** `owner-public-signals-read.db.test.ts` — 7/7 (real read path
  over seeded intake rows incl. a PII/injection row, clean=NONE, **workspace isolation**,
  no PII/raw/injection in response, no fake money, uncertainty preserved). Wired into the
  required lane.
- **Browser:** `46-owner-cockpit.spec.ts` extended (outside signals collapsed → expand →
  no-live-ingestion; no email/phone/PII, no `$`/win-probability/live-internet copy). Runs
  in `owner-pilot-e2e`.

## Gates run (local)
prisma validate ✓ · tsc ✓ · governance:scan (0 new) ✓ · lint:ratchet (0 new; fixed 2
unused-var warnings) ✓ · unit+component 23 ✓ · DB 7 ✓ · next build ✓
(`/api/owner/public-signals` + `/owner/cockpit` present).

## Classification justification
Owner-gated endpoint exists; wrong workspace fails closed (isolation, db #6); clean
fabricates nothing (db #2, unit #1); the summary appears in the cockpit collapsed by
default (component #1, browser); public uncertainty is visible; the no-live-ingestion
boundary is visible; raw text hidden; PII/injection absent; no fake money; unsafe actions
blocked; owner load stays low (top action primary, section collapsed); component/API + DB
proof pass; browser spec added; required CI must be green with LANE_B proof of the new DB
test. → `PUBLIC_SIGNAL_SURFACE_PROVEN`.
