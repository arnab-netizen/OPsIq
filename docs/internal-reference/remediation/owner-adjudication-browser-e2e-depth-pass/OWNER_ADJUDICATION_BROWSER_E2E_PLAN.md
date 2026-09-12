# Owner Adjudication Browser E2E — PLAN

## Objective
Prove, in a REAL browser against the REAL app + backend, that the owner can load and use the
proof-risk adjudication queue: open `/owner/adjudication`, see an active finding, be forced to enter a
reason, submit a governed outcome, see the decision recorded, see no fraud/theft/negligence
accusation or hidden score, and navigate back to the Owner Now View.

No UI redesign, no pagination, no new schema (a permission grant is data, not schema).

## Approach (smallest reliable proof)
Reuse the existing owner-pilot browser lane exactly — it already boots the built app against a seeded
Postgres and logs in as a real owner. Add:
1. **A deterministic seed** (`scripts/seed-e2e-proof-risk.ts`) that inserts ONE proof-risk finding into
   the E2E owner workspace: a staff member who both submits and reviews their own two proofs
   (self-review) → the anti-gaming `SELF_REVIEW_ATTEMPT` signal becomes the workspace's top gaming
   signal, COMPLETE with two supporting proof IDs → one adjudicable queue item. The seed also grants
   the E2E owner the `gep:proof_review_low_risk` permission the adjudicate route requires (the same
   `UserRoleAssignment` grant path production uses) and clears any prior adjudication so re-runs are clean.
2. **One Playwright spec** (`tests/browser/43-owner-adjudication.spec.ts`) that logs in as the E2E owner
   and drives the flow.
3. **Wire both into the existing `owner-pilot-e2e` CI lane** (one seed line + one spec in the run list) —
   no new lane, no Playwright refactor.

## Data setup
- Loginable owner + workspace + active businesses: existing `scripts/seed-owner-scenarios.ts`.
- The proof-risk item + permission grant: new `scripts/seed-e2e-proof-risk.ts`.
- Deterministic IDs (staff `50000000-…-f1`, proofs `51000000-…-f1/f2`) → stable assertions.
- Real backend: the queue is fetched from `GET /api/owner/proof-risk/queue`; the decision POSTs to the
  canonical `POST /api/proof-risk/adjudicate`. No mocking.

## Test cases
1. `/owner/adjudication` loads with its header + at least one active item (the self-review finding).
2. A decision cannot be submitted without a reason (submit disabled + required-reason hint).
3. Submitting `REQUIRE_FRESH_PROOF` with a reason records the decision (success line shown; keep-active
   finding stays).
4. No `fraud/theft/negligence/score` accusation appears on the findings (the fairness note, which
   explicitly negates those words, IS present).
5. The owner can navigate back to `/owner/now`.

## Flake hardening
Deterministic seed; no arbitrary sleeps (Playwright auto-waits on visible states); no external network;
isolated E2E workspace/user; serial single-login describe; fails clearly if Postgres/auth is unavailable.

## Out of scope
UI redesign; pagination; Process Intelligence; public SaaS / billing; broad browser-readiness claims for
all of OpsIQ.
