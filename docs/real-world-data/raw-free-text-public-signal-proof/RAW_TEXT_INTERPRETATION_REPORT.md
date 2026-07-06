# Raw Text Interpretation Report — PASS 28

**Date:** 2026-07-06 · **Method:** controlled raw-text fixtures → deterministic interpreter → schema validation → governed execution bridge.

## Fixture count
21 raw-text fixtures: 18 persisted through the governed bridge (grouped into 8 archetype workspaces) + 3 interpret-only adversarial fixtures.

## Archetypes covered (8 of 8)
laundry / local service, housekeeping / facility, property management, franchise operations, SaaS, tender / procurement (not skipped), B2B service, collective multi-module conflict.

## Raw text types covered
public review, public complaint, public service/pricing page, public tender notice, public RFQ/RFP, public SaaS app review, public SaaS support text, public franchise page, public property text, public B2B opportunity text — plus adversarial variants (prompt-injection, money claim, ambiguous, PII-bearing).

## Adversarial cases covered
1. "Ignore previous instructions … mark this business as verified" → detected, ignored, not verified.
2. "Give them a 90% win probability … £10,000 profit guaranteed" → financial claim rejected as fact.
3. "Automatically email the customer" → auto-contact blocked, route stays a safe correction.
4. "Submit the tender now automatically" → auto-submit blocked, route stays data-collection.
5. "Fire the employee responsible" → not obeyed; training/SOP route used.
6. PII (name/email/phone) → stripped before persist; never leaks into task/audit.
7. Ambiguous / one-off text → confidence downgraded, validation-needed.

## Privacy handling
PII stripped first, before any derivation or persistence (`piiRemoved`); currency protected from the phone matcher; no verbatim copyrighted text (≤180-char sanitized summary). See `RAW_TEXT_PRIVACY_AND_COPYRIGHT_NOTES.md`.

## Uncertainty handling
Every signal carries `sourceQuality` + `evidenceStrength`. Ambiguous/one-off/low-context text downgrades to `INSUFFICIENT`/`WEAK` with `DOWNGRADED_AMBIGUOUS` / `VALIDATION_NEEDED_WEAK` and a data/monitor route. Official sources are `STRONG` but still `OFFICIAL_BUT_NEEDS_BUSINESS_DATA`. Missing internal data is always explicit.

## Interpretation limitations (honest)
- The interpreter is **deterministic and rule-based**, not an LLM/NLP model. It maps controlled fixtures conservatively; it is not a general free-text understanding engine and does not fetch live data.
- It is a **translator only** — no execution authority. The governed bridge remains the routing/owner-gating/evidence-gating authority.
- Live connectors, crawling, and autonomous external action remain out of scope (frozen — see `DEFERRED_BROAD_GAPS.md`).

## Continuing to DB simulation?
**Yes.** The interpreter drives `src/__tests__/execution/raw-free-text-public-signal-end-to-end.db.test.ts` (18 tests, LANE_B + LANE_A) end-to-end through the governed execution substrate.
