# Volume Privacy & Safety Notes — PASS 30

The volume/prioritisation layer consumes **already-interpreted, already-conflict-resolved** signals and inherits every PASS 28/29 safety property. It uses **controlled fixtures only** (up to 51 signals in one workspace).

1. **No live scraping / crawling / browsing.** Every stress pack is controlled raw-text fixtures.
2. **No login-only / private / scraped-at-scale data.** None used.
3. **PII never carried forward.** PII is stripped by the interpreter before a signal exists; prioritisation holds only clustered governed summaries — no email/phone/name (proven: unit test 10, DB test 14).
4. **Volume never manufactures certainty.** Many weak signals stay unverified; repeated weak signals raise the URGENCY of validation/reassessment, never the CERTAINTY of a finding (unit test 6).
5. **Duplicate/same-topic signals collapse.** N signals → a few issue clusters → one governed task per actionable cluster (never one-per-signal): 51 → 3, 30 → 3, 26 → 4 (DB test 5+6).
6. **Severe risk first.** Growth/marketing/expansion/tender-submit/discount/outreach can never outrank an unresolved quality/cash/capacity/legal/reputation blocker — enforced by a transparent priority tier (never an opaque score) with explicit reasons (unit tests 1–5, DB tests 4/10/11).
7. **Gates never bypassed.** Tender urgency → data-first, auto-submit blocked; growth → validate-first, scale blocked; material pricing/brand/spend/legal → owner-gated; completion evidence-gated; monitor-only not completable (DB tests 8/9/10/11/18).
8. **Fake money / injection neutralised.** Money/ROI/win-probability claims and prompt injection are recorded in `blockedUnsafeActions`, never affect priority, and never persist as a governed figure (unit tests 8/9, DB tests 12+13).
9. **No cockpit spam.** One top action + grouped secondary actions + a monitor-only summary; no raw-signal dump (DB test 17).
10. **No execution authority.** The layer proposes a prioritised cockpit view + one ProcessCorrection per actionable cluster; the governed bridge alone routes and gates. No external action is ever produced.
11. **Fail-closed.** The prioritisation is Zod-validated (top-action-iff-actionable, clusters ≤ signals, no-fabricated-money) before it can enter the governed path; a tampered output is rejected (unit tests 17/18).

**Priority is transparent, not a hidden score:** each cluster carries a `priorityTier` (1–9) and `priorityReasons`; no field is an opaque numeric ranking (unit test 14).
