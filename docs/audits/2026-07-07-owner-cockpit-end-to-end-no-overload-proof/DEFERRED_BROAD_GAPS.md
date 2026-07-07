# Deferred / Broad Gaps (PASS 40)

## Delivered
A hostile, end-to-end **no-overload** proof of the canonical owner cockpit (`/owner/cockpit`): one real
browser spec (`47-...`, journeys A–G, run green locally against a built app + seeded Postgres) and a
deterministic component companion (clean-state, no-overload limits, labelled-control path, and the full
forbidden-copy matrix). No product surface changed — this pass adds tests + audit only.

## Proven
- One clear next step across every journey; every other surface collapsed by default.
- No-overload limits: 1 top action · ≤3 reason bullets · ≤2 primary · ≤3 secondary.
- Recovery never guarantees; public signals never claim live ingestion or leak raw text / PII.
- Owner action inputs are labelled controls — `window.prompt`/`window.alert` are trapped to throw.
- The URL cannot bypass the gate; the owner read API fails closed without a session.
- The clean state fabricates nothing (exactly one honest state renders, never a hybrid).

## Deferred beyond PASS 40
1. **Authenticated non-owner (member) journey in the owner-pilot lane.** The `E2E_MEMBER` fixture is seeded
   only by `seed-e2e-owner.ts` (a different lane), so spec 47 proves the seed-independent **unauthenticated**
   fail-closed path. The authenticated-member 403 remains proven by `tests/browser/10-rbac-workspace.spec.ts`
   + the route capability gate. Unifying both members into one lane is a later seed-consolidation pass.
2. **Deterministic crisis-state browser fixture.** Journey B asserts the recovery section's safety envelope
   over whatever recovery state the seeded workspace resolves (at minimum `NONE`). A dedicated
   survival-triage seed for the primary business would let the browser assert the active crisis copy directly;
   the active-state rendering is already pinned deterministically by the component test.
3. **Full-page (chrome/nav) forbidden-copy sweep.** The sweep is scoped to the cockpit surface
   (`owner-cockpit` / `cockpit-clean`) to avoid false positives from app-chrome that may legitimately show the
   signed-in user's own email. A separate account-menu PII audit is out of scope here.
4. **Mobile-viewport no-overload proof.** Spec 47 runs desktop chromium (matching the cockpit's single-column
   layout). A mobile-project variant is a later pass; the layout is already responsive/single-column.

## Explicitly out of scope (frozen — not built, not implied)
Public SaaS, billing, Product Hunt / launch readiness, live integrations/connectors, Local Mode,
enterprise/compliance, autonomous browsing/external action, LLM/NLP, private owner shadow pilot,
marketing/landing/pricing. No new product capability was added in this pass.

## Honest limitation
The clean-workspace browser journey (F) proves the **contract** (exactly one honest state, never a fabricated
hybrid) rather than forcing the clean state, because the owner-pilot seed always yields a bridged top action.
The **exact** clean state is pinned by the component companion. This is an explicit, honest coverage split —
the same boundary discipline PASS 39 used for its DB/unit split — not a skipped assertion.
