# Conflict Fixture Report — PASS 29

**Date:** 2026-07-07 · **Method:** controlled conflicting raw-text fixtures → interpreter → conflict resolution → governed bridge.

## Fixture count
19 conflict cases + 1 clean control (`cf-clean`, no signals) = 20. Persisted subset (8 archetype workspaces + clean control) is driven end-to-end by `src/__tests__/execution/conflicting-public-signal-end-to-end.db.test.ts`.

## Archetypes covered (8 of 8)
laundry, housekeeping, property, franchise, SaaS, tender (not skipped), B2B, collective — plus adversarial/PII/finance/noisy variants.

## Conflict categories covered
mixed positive/negative, old-vs-recent recency, official-vs-third-party, one-off vs repeated, competitor-vs-verified, tender-opportunity-vs-missing-data, deadline-urgency-vs-docs, growth-vs-unresolved-quality/capacity, noisy multi-topic, prompt-injection corpus, PII-heavy, fake-financial claim, feature-demand-vs-backlog, issue-vs-vacancy-opportunity.

## Adversarial cases covered
1. Injected "mark this business as verified" → ignored, never verified.
2. Injected "submit the tender now / email the customer" → blocked; route stays data-first.
3. PII across multiple signals → stripped, never carried into the package.
4. "90% win probability / guaranteed profit" → rejected, never a governed figure.
5. Noisy multi-topic text → conservative single conclusion, no fabrication.

## Conflict classifications exercised
NO_CONFLICT, SUPPORTING_SIGNALS, CONTRADICTORY_SIGNALS, MIXED_RECENCY, WEAK_SINGLE_SIGNAL, REPEATED_WEAK_SIGNALS, OFFICIAL_SOURCE_CONFLICT, THIRD_PARTY_UNVERIFIED_CONFLICT, MISSING_INTERNAL_DATA, HIGH_RISK_UNRESOLVED, VALIDATION_REQUIRED, MONITOR_ONLY, BLOCK_UNSAFE, UNKNOWN. (See `CONFLICT_EXPECTATIONS.json` for the deterministic per-case outputs.)

## Privacy / uncertainty handling
PII stripped upstream and never carried forward; every case preserves source-quality/evidence-strength/recency summaries + explicit missing data; conflicting/uncertain cases route to validation / reassessment / owner-review / missing-data / monitor-only — never a confident action.

## Interpretation limitations (honest)
- The conflict layer is **deterministic and rule-based**; it does not make a final factual judgment and does not understand arbitrary prose.
- It is a **decision layer only** — no execution authority; the governed bridge remains the routing/gating authority.
- Live connectors, crawling, LLM/NLP understanding, and the private owner shadow pilot are out of scope (frozen — see `DEFERRED_BROAD_GAPS.md`).

## Continuing to DB simulation?
**Yes.** The fixtures drive `conflicting-public-signal-end-to-end.db.test.ts` (14 tests, LANE_B + LANE_A) end-to-end through the governed substrate.
