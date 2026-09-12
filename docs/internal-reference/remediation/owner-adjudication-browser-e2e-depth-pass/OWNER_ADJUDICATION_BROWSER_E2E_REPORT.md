# Owner Adjudication Browser E2E — REPORT

## A. Files created
- `tests/browser/43-owner-adjudication.spec.ts` — Playwright spec (5 tests, one owner login, serial).
- `scripts/seed-e2e-proof-risk.ts` — deterministic proof-risk seed + owner permission grant.
- `docs/remediation/owner-adjudication-browser-e2e-depth-pass/` — this pack (6 docs).

## B. Files changed
- `.github/workflows/owner-pilot-e2e.yml` — run the new seed + the new spec in the existing lane.
- `src/app/(authenticated)/owner/adjudication/page.tsx` — post-decision refresh is now **silent**
  (does not toggle the full-page loading state), so the queue + the just-shown success message stay
  mounted instead of blanking to a spinner. (Real-browser fix surfaced by the E2E.)

## C. Schema changes
None. The seed inserts data (proofs + a `UserRoleAssignment` permission grant) — no schema change.

## D. Code / test logic
- **Seed**: a staff user self-reviews two proofs in the E2E workspace → `SELF_REVIEW_ATTEMPT` becomes
  the top gaming signal (COMPLETE, two supporting proof IDs) → one adjudicable queue item. The E2E owner
  is granted `gep:proof_review_low_risk` via `UserRoleAssignment` (the production grant path). Idempotent
  upserts; clears any prior adjudication so re-runs start clean.
- **Spec**: logs in as the E2E owner, opens `/owner/adjudication`, and asserts the five cases below.
- **Page fix**: `load(silent)` — the post-submit refresh passes `silent = true` so the queue never
  unmounts mid-decision; the success line renders reliably.

## E. Browser flow proven (all 5 pass, real app + real backend)
1. queue loads with the "Proof-risk review queue" header + ≥1 active item (the self-review finding, with
   its supporting-proof count) — real `GET /api/owner/proof-risk/queue`.
2. submit is disabled and a required-reason hint shows until a reason is entered.
3. choosing `REQUIRE_FRESH_PROOF` + a reason and submitting → real `POST /api/proof-risk/adjudicate`
   (HTTP 200, `Auth decision: ALLOWED`) → "Decision recorded (…)" shown; the keep-active finding stays.
4. no `fraud/theft/negligence/score` accusation on the findings; the fairness note is present.
5. the "Owner Now View" link navigates to `/owner/now`; no fatal console errors.

## F. Acceptance criteria checklist
- [x] Playwright spec exists and runs against the real route.
- [x] Authenticated owner context works (real login via the existing helper).
- [x] At least one proof-risk item renders from real backend data.
- [x] Reason-required behavior tested.
- [x] A valid adjudication submission tested end-to-end (200 from the canonical route).
- [x] Success/updated state verified in the UI.
- [x] No prohibited labels / hidden score on the findings.
- [x] Browser test passes locally (5/5).
- [x] No app-level browser failure remains (the one failure found — a permission gap + a refresh-unmount
      bug — was fixed, not hidden).
- [x] tsc 0 · governance 31 frozen / 0 new · `next build` exit 0 · jsdom adjudication tests 21/21.

## G. Known limitations
- **CI run of the new spec is not yet observed** — proven locally (5/5) and wired into the
  `owner-pilot-e2e` lane; the CI pass will be confirmed on the PR. Classified accordingly.
- Playwright config emits a pre-existing non-fatal warning (HTML reporter folder clashes with
  test-results); unchanged by this pass, the lane still passes.
- One finding is seeded (self-review); the other queue sources are covered by the prior pass's
  jsdom/domain tests, not this browser spec.

## H. Manual verification
See `TEST_EVIDENCE_LEDGER.md` for the exact local commands (seed → build → start → playwright).

## I. Trigger map
Seed inserts the finding + grant → the owner opens the queue → submits a decision → the canonical route
records + audits it; keep-active findings stay, cleared findings drop on refresh.

## J. Failure modes covered
Missing reason (submit blocked); missing permission (was denied → fixed by the real grant); refresh
unmounting the result (fixed by the silent refresh); prohibited-label / hidden-score guard.

## K. Events emitted
No new event type — the canonical adjudicate service still emits `proof_risk.adjudicated`.

## L. Automated tests added
1 Playwright spec (5 tests). Existing 21 jsdom adjudication tests remain green.
