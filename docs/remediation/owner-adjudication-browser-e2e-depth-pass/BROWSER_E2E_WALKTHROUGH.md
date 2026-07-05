# Browser E2E Walkthrough — Owner Adjudication Queue (real browser)

Proven by `tests/browser/43-owner-adjudication.spec.ts` running in a real Chromium against the built app
+ real backend + seeded local Postgres. **5/5 passed.**

## Setup
- `scripts/seed-owner-scenarios.ts` seeds the loginable owner (`test1@staging.local`), the E2E
  workspace, the owner role, and active businesses.
- `scripts/seed-e2e-proof-risk.ts` seeds a staff member who submitted AND reviewed their own two proofs
  (self-review), and grants the owner the `gep:proof_review_low_risk` permission. Result: one active,
  adjudicable `SELF_REVIEW_ATTEMPT` finding in the owner's queue.

## Steps (each an assertion in the spec)
1. **Login + open the queue.** The owner logs in and navigates to `/owner/adjudication`. The page fetches
   `GET /api/owner/proof-risk/queue` (HTTP 200) and renders the "Proof-risk review queue" header and the
   self-review item with its supporting-proof count. *(test 1)*
2. **Reason is enforced.** The owner selects "Require fresh proof" but leaves the reason blank — the
   Submit button is disabled and "A reason is required before you can submit." is shown. *(test 2)*
3. **Submit a governed decision.** The owner types a reason and submits. The browser POSTs to the
   canonical `POST /api/proof-risk/adjudicate` (HTTP 200, `Auth decision: ALLOWED`). "Decision recorded
   (…)" appears; because REQUIRE_FRESH_PROOF keeps the risk active, the finding stays in the queue. *(test 3)*
4. **No accusation, no hidden score.** No finding shows the words fraud / theft / negligence / score; the
   standing fairness note ("…not a fraud, theft, or negligence accusation. Owner review/adjudication is
   required before taking any personnel action.") is present. *(test 4)*
5. **Back to the Now View.** The owner clicks "Owner Now View" and lands on `/owner/now`; no fatal
   console errors were observed. *(test 5)*

## What this proves for the owner
"In a real browser, I logged in, opened my proof-risk review list, and it showed the self-review flag
with the two proofs behind it. It wouldn't let me decide without giving a reason. I chose 'require fresh
proof', wrote why, and it recorded my decision against the real backend — no raw API calls, no accusing
language. Then I clicked back to my Now View. The whole loop works in the app, not just in unit tests."

## Honest scope
This proves the owner adjudication queue browser flow only — one seeded finding, one login, five
assertions. It does NOT prove browser-readiness for all of OpsIQ. CI confirmation of the new spec lands
on the PR.
