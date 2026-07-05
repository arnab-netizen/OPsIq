# Real-Business UI Walkthrough — Owner Adjudication Queue (laundry)

**Scenario:** Sparkle Laundry. OpsIQ has flagged (a) operator `op-1` reusing the same proof photo across
two jobs (reused-hash), and (b) a self-review pattern that the owner knows was an authorised solo shift.
This walkthrough is proven by the jsdom page + component tests (`owner-adjudication-page.test.tsx`,
`adjudication-queue.test.tsx`); a real-browser E2E is **not** run this pass.

## Steps
1. **Open the queue.** From the Owner Now View, the owner clicks **"Proof-risk review queue"** →
   `/owner/adjudication`. The page loads `GET /api/owner/proof-risk/queue`.
   *(page test: queue renders, back-link to `/owner/now` present.)*
2. **See the reused-proof item.** Card shows **"Possible reused proof" · HIGH · REUSED_HASH_FINDING ·
   Evidence complete**, the plain explanation, **"Supporting proofs: 2 · Refs: r1, r2"**, the person, and
   the recommended action. No fraud/theft label; a standing fairness note is shown.
3. **Decide: require fresh proof.** The owner picks **"Require fresh proof"**, types a reason
   ("Need a fresh job-specific photo per job"), and submits. It POSTs to the canonical
   `/api/proof-risk/adjudicate` with `sourceType=REUSED_HASH_FINDING`, `sourceRef=REUSED_HASH:op-1`,
   `proofIds=[r1,r2]`, `outcome=REQUIRE_FRESH_PROOF`, the reason, and an idempotency key. The **risk
   stays active** (KEEPS_ACTIVE). *(component test #5.)*
4. **Dismiss the false-positive self-review.** On the self-review item the owner picks **"Dismiss —
   false positive"**, types "Authorised solo shift — approved by me", and submits. The exact payload is
   sent; on success the queue re-fetches and the **dismissed item clears** from the active list.
   *(page test #2: correct payload + second GET; component test #4/#6.)*
5. **Reason is enforced.** If the owner tries to submit without a reason, the submit button stays
   disabled and "A reason is required before you can submit." shows. *(component test #3.)*
6. **Safe failures.** If the backend rejects (validation / not authorized / wrong workspace), a plain
   message is shown — never a raw internal error/stack. *(component test #7, page test #3.)*
7. **Audit / status.** A prior decision surfaces as **"Status: CLEARED"** on the item; the decision
   itself is audited by the existing service (`proof_risk.adjudicated`). *(domain test #7.)*

## What the owner gets
"OpsIQ now gives me a short review list in the app. Each flag tells me what it is, which proofs it's
based on, and what it suggests — in plain words, never calling anyone a cheat. I pick 'dismiss' for the
ones I know are fine (they disappear) and 'require fresh proof' for the ones I want redone (they stay).
Every choice is logged, and if a new bad proof shows up, the flag comes back."

## Browser E2E status
**Unproven.** This walkthrough is backed by jsdom component + page tests, not a real browser. A
Playwright route-render/interaction test is the next safest step to make it browser-proven.
