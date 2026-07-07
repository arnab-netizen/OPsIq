# Volume Fixture Report — PASS 30

**Date:** 2026-07-07 · **Method:** controlled high-volume raw-text packs → interpreter → conflict resolution → prioritisation → governed bridge.

## Fixture count
9 stress cases (8 archetype workspaces + 1 clean control). Highest volume: **51 signals** in one workspace (collective).

## Volumes per case
laundry 26, housekeeping 20, property 21, franchise 20, SaaS 30, tender 15, B2B 20, collective 51, clean 0.

## Anti-spam result (signals → clustered governed tasks)
laundry 26→4, housekeeping 20→2, property 21→3, franchise 20→2, SaaS 30→3, tender 15→1, B2B 20→2, collective 51→3, clean 0→0. Every workspace ≤ 6 clustered tasks — never one-per-signal.

## Prioritisation result (top action per workspace, severe-risk-first)
- laundry → **quality** (tier 3); discount owner-gated, growth/B2B secondary; fake profit + PII + injection neutralised.
- housekeeping → **quality/staffing** (tier 5) inspection/SOP before growth.
- property → **operations/legal-spend** (tier 2, owner review) before vacancy growth.
- franchise → **quality** (tier 7, owner branch review); marketing/expansion never top.
- SaaS → **quality/product** (tier 3) verification before launch; fake MRR/ROI rejected; Product Hunt/launch frozen.
- tender → **tender readiness** (tier 6, data-first); auto-submit blocked.
- B2B → **fit/capacity/cost** (tier 4) validation before outreach.
- collective (51) → **quality** (tier 4, fix-first); scale blocked-before-proof; discount owner-gated; injection + fake money neutralised.
- clean → no action, nothing fabricated.

Growth/marketing/expansion/tender-submit is **never** the top action in any workspace with an unresolved quality/cash/capacity/legal risk.

## Adversarial coverage (embedded in the packs)
fake profit / win-probability / MRR / ROI claims; PII-heavy review; prompt injection ("mark verified"); tender auto-submit instruction; positive-review clusters (cannot close unresolved negatives); noisy irrelevant text.

## Privacy / uncertainty handling
PII stripped upstream, never carried forward; volume raises validation urgency, not certainty; every case preserves missing-data + evidence requirements; low-value monitor-only items are summarised, not spammed.

## Limitations (honest)
- The layer is deterministic and rule-based; priority is a transparent tier + reasons, not a learned/opaque score.
- It is a decision/cockpit layer only — no execution authority; the governed bridge remains the routing/gating authority.
- Live connectors, crawling, LLM/NLP understanding, and the private owner shadow pilot are out of scope (frozen — see `DEFERRED_BROAD_GAPS.md`).

## Continuing to DB simulation?
**Yes.** The packs drive `multi-signal-volume-prioritisation.db.test.ts` (14 tests, LANE_B + LANE_A) end-to-end through the governed substrate.
