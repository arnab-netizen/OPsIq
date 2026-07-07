# Cockpit Explanation Fixture Report — PASS 31

**Date:** 2026-07-07 · **Method:** PASS 30 prioritisation → owner-facing explanation → governed bridge. Controlled fixtures only.

## Cases (10)
laundry, housekeeping, property, franchise, SaaS, tender, B2B, collective, monitor-only-positive, clean control.

## Top-action explanation per case (deterministic)
- laundry → quality (tier 3, data-first validation); why-not-growth stated; B2B/expand grouped secondary.
- housekeeping → quality (tier 3) inspection/validation before the commercial opportunity.
- property → operations/legal-spend (tier 2, **owner approval**, reason present) before vacancy marketing.
- franchise → quality (tier 3) branch review; pricing/brand owner-gated secondary.
- SaaS → quality/product (tier 3) verification; launch subordinated (why-not-growth stated).
- tender → tender readiness (tier 6, data-first); **auto-submit blocked**, risk copy states nothing is auto-submitted.
- B2B → fit/capacity/cost (tier 4) validation before outreach.
- collective → quality (tier 4, fix-first) with why-not-growth; scale blocked-before-proof.
- monitor-only-positive → **NULL** (a positive claim is not proof; nothing to act on).
- clean → **NULL** (nothing fabricated).

## What each explanation states
top action + title, why it is top priority (tier + reasons), supporting clusters/signal count, strongest→weakest evidence, verified vs unverified, missing data, risk if ignored, why-not-growth (where relevant), owner-approval reason (where owner-gated), evidence required before completion, reassessment after completion, blocked unsafe actions, grouped secondary actions, monitor-only summary, confidence caveat, owner/manager-staff next step, and a PII-/money-free `safeCopy` paragraph.

## Safety
No hidden score (tier + reasons); no PII/injection/fabricated money in any owner-facing field; uncertainty preserved; nothing implied as executed. See `COCKPIT_EXPLANATION_SAFETY_NOTES.md`.

## Limitations (honest)
Deterministic/rule-based; explains upstream governed outputs (not a learned/opaque model); no live data. Live connectors, LLM understanding, and the private owner shadow pilot are frozen (see `DEFERRED_BROAD_GAPS.md`).

## Continuing to DB simulation?
**Yes.** Drives `owner-cockpit-decision-coherence.db.test.ts` (13 tests, LANE_B + LANE_A).
