# Current Status Update — Owner Adjudication UI / Queue

- **Base:** `origin/main` @ `5e5bdb7a` (Completion / Escalation Timing Evidence, PR #124, merged).
- **Branch:** `claude/owner-adjudication-ui-queue-depth-pass`.
- **Classification:** `OWNER_ADJUDICATION_UI_QUEUE_REAL_BUT_NOT_BROWSER_PROVEN`
  (+ `OWNER_MODE_EXCELLENCE_DEEPENED`).

## What the owner can use now
A real in-app **Proof-risk review queue** at `/owner/adjudication`, linked from the Owner Now View. It
lists the active proof-risk findings (reused-hash, top anti-gaming signal, top credibility concern, and
active timing signals) with why each was raised, the supporting-proof count + a few refs, the actor,
severity, source completeness, current adjudication status, and the recommended action. The owner picks
one of the seven governed outcomes, enters a required reason, and submits — through the existing
canonical `POST /api/proof-risk/adjudicate` route. Dismiss/accept clears noise; confirm/require-fresh
keeps risk active; a new supporting proof re-surfaces a cleared finding; every decision is audited.

## Route / page / component added
- Page: `/owner/adjudication` (`src/app/(authenticated)/owner/adjudication/page.tsx`).
- Component: `src/components/owner/AdjudicationQueue.tsx` (prop-driven, no business logic).
- Read-model: `src/domain/owner-mode/adjudication-queue.ts` (`buildAdjudicationQueue`).
- Route: `GET /api/owner/proof-risk/queue`.
- Now-view link: added to `src/app/(authenticated)/owner/now/page.tsx`.

## Outcomes supported
All seven: DISMISS_FALSE_POSITIVE, ACCEPT_AS_VALID, REQUIRE_FRESH_PROOF, CONFIRM_SUSPICIOUS_PATTERN,
ESCALATE_FOR_TRAINING, ESCALATE_FOR_OWNER_REVIEW, MARK_INCONCLUSIVE_NEEDS_DATA. Reason required.

## What remains missing
- **Browser E2E** — jsdom component + page proof only; not browser-proven.
- No pagination/filtering; surfaces the now-view's top signals + all reused-hash submitters + active
  timing signals (not every historical finding).
- BLOCKED_BY_DATA findings render but are not adjudicable (fail-visible by design).

## Browser E2E status
**Unproven.** No Playwright/browser test run this pass.

## Next safest implementation order
1. A minimal Playwright route-render/interaction test to make the queue browser-proven.
2. Populate `work_started_at` / `acknowledged_at` from the write paths (unblocks more timing signals).
3. Then Process Intelligence over the proof/escalation → risk → adjudication chains.

## Safety
No fraud/theft/negligence label; no hidden staff score; no UI-only unaudited mutation; no business logic
in the UI; errors sanitized. Standing note: "review flag, not an accusation — owner review required
before any personnel action."

## Out of scope (per instructions)
UI redesign; Process Intelligence; public SaaS / billing / Product Hunt; HR discipline tooling; hidden scores.
