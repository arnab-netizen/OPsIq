# Paddle readiness record and activation runbook (authoritative)

Established 2026-11-20 from evidence (repository history, the sandbox and production databases read-only, Vercel configuration, the live public pages, and a regression run on main `3f0d32d67`). This file supersedes the Paddle status lines elsewhere (COMMERCIAL_MINIMUM.md, SANDBOX_E2E_RUNBOOK.md, OWNER_SETUP_CONSOLIDATED.md, PAYWALL_RELEASE_RUNBOOK.md); they link here.

## Workstream status (owner decision 2026-11-20)

The Paddle verification workstream is CLOSED. The existing implementation, activation tooling, rollback tooling and this record are retained. Every unproven payment-lifecycle requirement below (the full sandbox lifecycle, Preview enforcement-ON acceptance, real payload shapes, live merchant/domain/payout approval, G1-G4) is classified as a DEFERRED MONETIZATION PREREQUISITE, not a free-beta launch blocker. No payment development, provider onboarding, commercial activation or payment collection is undertaken until the owner explicitly authorizes it; the free-beta customer acquisition phase does not depend on any of it.

## 0. Current state

| State | Value | Evidence |
|---|---|---|
| `PADDLE_INTEGRATION` | IMPLEMENTED (merged, deployed, dormant) | PR #614 merged as `7aabcb94d`; PR #629 (dormant gate + guarded enable/disable) merged as `80aeb8cdd`, production deployment `dpl_DZUALNb5LFXwNUfqSVqYxzwJHfwm` READY (created 2026-10-24 15:58Z) |
| `PADDLE_ACTIVATION` | DEFERRED until the owner determines genuine demand | owner decision 2026-11-20 |
| `PAYMENT_COLLECTION` | DISABLED | Production Vercel environment has no `PADDLE_*` and no `STRIPE_*` variable (they exist for the Preview target only, git-branch-scoped to `claude/epic-ride-0hyyq1`); live `/pay` answers "Payments are not available right now" |
| `BILLING_PAYWALL_ENFORCEMENT` (Production) | OFF | variable absent in Production; only the exact string `on` enforces (`commercial-policy.service.ts:33-35`) |
| Production schema | Paddle migration applied | `20261017180000_commercial_minimum_paddle_billing` finished 2026-10-24 05:37Z; `subscriptions.paddle_subscription_id` exists; `plans` and `billing_accounts` are empty (no plan seeded) |

The absence of Production credentials is the intended dormant state, not evidence that the integration was never built.

## 1. Evidence ledger (what was actually observed)

| Stage | Verdict | Evidence |
|---|---|---|
| Integration merged and deployed | VERIFIED | commits above; Vercel production deployment of `80aeb8cdd` |
| Historical sandbox checkout and successful test payment | VERIFIED (database evidence) | sandbox Neon project `OPSIQ Paddle Sandbox PR614`: Paddle billing migration applied 2026-10-19; plan "OpsIQ Pro" (display 10) with a Paddle price id set; one Paddle-backed subscription `active` (updated 2026-10-23 06:56:58Z); exactly three processed webhook events on 2026-10-23 06:56-06:58Z: `subscription.created`, `subscription.activated`, `transaction.completed` |
| Webhook notification secret correction | VERIFIED as consistent, not independently proven | Preview `PADDLE_WEBHOOK_SECRET` was created 2026-10-17 17:40Z and updated 2026-10-23 06:50:54Z, six minutes before the first processed event |
| Replayed subscription events | UNVERIFIED | replays are idempotent and leave no duplicate rows; no record of the replay itself was found |
| Full subscription lifecycle against real Paddle | INCOMPLETE, NOT ACCEPTED | the sandbox database holds only created / activated / transaction.completed. No cancellation, `past_due`, failed-renewal, grace, payment-method update or recovery event has been observed against real Paddle. Those paths are proven only offline (real PostgreSQL tests with simulated payloads) |
| `SANDBOX_E2E_RUNBOOK.md` steps 1-16 | NOT COMPLETED | do not record `SANDBOX_PAYMENT_E2E=PASS` until all steps pass |
| Preview enforcement-ON acceptance (authenticated sandbox owner) | UNPROVEN | listed in RELEASE_BLOCKERS.json |

A historically successful sandbox payment is not subscription lifecycle acceptance.

## 2. Code integrity (current main, no regression found)

144 billing/entitlement/webhook/subscription test files on current main: non-DB 88 passed + 1 skipped files (2365 passed / 44 skipped tests, TEST_WITH_DB unset; 2510 passed / 2 skipped with TEST_WITH_DB=true); DB files (real PostgreSQL 16) 49 passed + 1 skipped (417 passed / 28 skipped); 0 failures. A scratch cross-provider test confirmed Paddle rows are not clobbered by the Stripe ordering columns (`last_event_id`, `stripe_subscription_created_at`) and entitlement works for a Paddle row in active / past_due-in-grace / past_due-after-grace / canceled states. Verified offline: checkout (server-side workspace binding, idempotency key), Paddle.js initialization, HMAC signature with 300 s replay window, webhook idempotency and atomic claim-apply-audit settlement (rollback on mid-transaction failure, retry applies once), event ordering, lifecycle events, customer-to-workspace binding with tenant guards, cancellation, seven-day past-due grace, payment-method update call, billing status page, tenant isolation of billing routes. Entitlement: with enforcement off (unset, "", "off", "On", "true", "1", " on" and every other value except exactly `on`) every gate returns before any database work and no HTTP 402 is possible, so the intended free beta is unrestricted. Every route added since #629 is classified in `commercial-route-registry.json`; `commercial-coverage.test.ts` fails on an unclassified handler.

Never proven against real Paddle: real payload shapes, the `current_billing_period.ends_at` assumption that anchors the grace period, `_ptxn` auto-open, the `/pay`-only CSP origins, and the real `update-payment-method-transaction` call.

## 3. Known gaps (none is a regression; fix or decide before activation)

- G1 plan capabilities: `scripts/seed-commercial-plan.ts` creates the Plan only, and no production code creates `plan_capabilities`. The self-serve owner loop uses the commercial gate and is unaffected, but consultant-surface routes that call `assertCapability`/`withCapabilityQuota` would answer "capability not found in plan" for a paying workspace, and `evaluateCapability` requires status `active`, so a past_due-in-grace workspace is denied there while the paywall layer allows it. Decision needed: seed capabilities or confirm those routes are outside the paid product.
- G2 documentation trap: `PAYWALL_RELEASE_RUNBOOK.md` and the enable tool's preflight accept `PADDLE_ENV=live`, but the runtime recognises only exactly `production`; with `live` the app would call the sandbox API and `/pay` would show "Payments are not available right now" (fails safe). Use `PADDLE_ENV=production`.
- G3: the Paddle default payment link and notification destination are manual dashboard settings (no code or script).
- G4: sandbox E2E never run end to end (section 1).
- Legal pages: `/pricing` shows the price as to be announced; `/terms` states it has not been reviewed professionally and does not yet name the legal entity; the refund policy needs owner and legal review.

## 4. Provider readiness (this session has no Paddle connector or Paddle credentials)

| Item | Status |
|---|---|
| Sandbox account, product, price, API configuration | INCOMPLETE: product/price evidenced indirectly (plan with Paddle price id; Preview env `PADDLE_ENV=sandbox`, API key, client token, price id, webhook secret present); the Paddle dashboard itself was not read |
| Sandbox notification destination | UNVERIFIED (dashboard) ; delivery VERIFIED (three events processed) |
| Historical successful sandbox transactions and webhook events | VERIFIED (section 1) |
| Live merchant account, identity verification, domain approval, payout readiness | UNVERIFIED (external to the repository; repository records say not started) |
| Live product and price | UNVERIFIED / not created (RB4) |

## 5. Dormant gate and guarded tooling (verified, no new engineering needed)

`npm run billing:paywall:enable` and `billing:paywall:disable` (`scripts/release/paywall-toggle.mjs`, `lib/paywall-release.mjs`), verified by `paywall-release-tool.test.ts` (63 cases, fake Vercel/git/http, no tokens): exact confirm phrases, exact 40-hex SHA with `origin/main` and `HEAD` equal, pinned project identity (id, name, linked repo, Production domain; no override), 16 enable preflights, `--dry-run` performs zero mutations (asserted: only GET requests) and zero compensation, exactly two real mutations (set the Production flag to `on`; create a Production deployment of the exact commit via `gitSource` with `forceNew`), failed-deployment compensation (existing flag restored to its previous value; absent flag deleted and verified, else set to `off`; unverifiable state exits 3 with `UNCOMPENSATED_DANGER`), disable never re-enables, and refusal while `RELEASE_BLOCKERS.json` `open` is non-empty. Currently open: RB4 (final price, live Paddle product/price, plan seed), Preview enforcement-ON acceptance, Paddle live account/domain approval in an approval manifest. Resolved: RB1-RB3.

## 6. Future activation runbook (configuration, authorization and controlled acceptance; not a development programme)

Precondition: the owner has determined that genuine market demand exists. Nothing below is performed before that decision.

A. Commercial authorization (owner)
1. Record the decision to monetize and the price in `OWNER_DECISIONS.md` (RB4). Verify: the entry exists.
2. Complete legal readiness: legal entity name in Terms, refund and cancellation policy reviewed, pricing page text. Verify: the three pages render the final text.
3. Obtain Paddle live account, identity and domain approval (external). Verify: written approval reference for the manifest.

B. Merchant configuration (owner, in the Paddle dashboard; production values never in chat or the repository)
4. Create the live product and price. Set the default payment link to `https://opsiq.solutions/pay`. Create the notification destination `https://opsiq.solutions/api/webhooks/paddle` with events `subscription.created|activated|updated|canceled|past_due|paused|resumed` and `transaction.completed|payment_failed`.
5. Set Production environment variables: `PADDLE_ENV=production` (not `live`, see G2), `PADDLE_API_KEY`, `PADDLE_PRICE_ID`, `PADDLE_WEBHOOK_SECRET`, `PADDLE_CLIENT_TOKEN` (`live_...`), `PADDLE_PLAN_PRICE_MONTHLY`. Leave `BILLING_PAYWALL_ENFORCEMENT` unset. Verify: `/pay` loads checkout in a test session but enforcement is still off.

C. Technical readiness (small, reviewed change)
6. Set `PUBLIC_PRICE_DISPLAY` in `src/domain/billing/public-pricing.ts` to the approved amount (equal to the live price and `PADDLE_PLAN_PRICE_MONTHLY`). Resolve G1 (seed capabilities or confirm scope) and correct the `PADDLE_ENV` text (G2). Merge through the normal CI-gated flow with the paywall still off.
7. Run `npx tsx scripts/seed-commercial-plan.ts` against Production (an owner-authorized data write). Verify: exactly one active plan with the live price id.

D. Controlled acceptance
8. Complete `SANDBOX_E2E_RUNBOOK.md` steps 1-16 in a network-capable environment, including real cancellation, a failed renewal producing `past_due`, grace, payment-method update and recovery; record evidence (ids and timestamps only). Verify: every step passes; only then may `SANDBOX_PAYMENT_E2E=PASS` be recorded.
9. Complete the Preview enforcement-ON acceptance (unpaid first diagnosis allowed and readable, paid continuation returns 402, direct API bypass rejected, paid sandbox workspace continues, billing reachable). Clear the three `RELEASE_BLOCKERS.json` items by a reviewed commit.
10. Optional: `node scripts/release/paywall-beta-audit.mjs` (read-only) to see which workspaces would first hit the wall.

E. Production activation (owner-authorized, exact SHA)
11. Write the approval manifest (`paddleDomainApproved`, `paddleApprovalEvidence`, `approvedBy`, `approvedAt`, `expectedMainSha`, `livePriceId`, `ownerDecisionsResolved: true`, `knownReleaseBlockers: []`).
12. `npm run billing:paywall:enable -- --expected-main-sha=<40-char SHA> --confirm="ENABLE PRODUCTION PAYWALL" --manifest=<path> --dry-run`, review the output, then repeat without `--dry-run`. Verify: `/api/internal/build-info` serves the SHA.

F. Controlled live-payment acceptance
13. A fresh account completes its free diagnosis and receives 402 on continuation; the owner makes one real test purchase; the verified webhook flips the account to entitled and the step succeeds; `/owner/billing` shows status and cancellation. Watch HTTP 402 volume and `PLAN_LIMIT_EXCEEDED` audit events.

G. Rollback (any time)
14. `npm run billing:paywall:disable -- --expected-main-sha=<known-good SHA> --confirm="DISABLE PRODUCTION PAYWALL"`; manual fallback: set `BILLING_PAYWALL_ENFORCEMENT` to `off` in Vercel and redeploy the last known-good deployment. Subscriptions and billing records are untouched.
