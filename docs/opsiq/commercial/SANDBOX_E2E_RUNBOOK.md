# Paddle sandbox E2E runbook (run from a network-capable environment)

Status in this repository: `SANDBOX_E2E_BLOCKED_BY_EXECUTION_ENVIRONMENT` — the build container cannot reach `*.paddle.com` and holds no sandbox
credentials. This is **not** a product defect and is **not** a failure. Do not record `SANDBOX_PAYMENT_E2E=PASS` until every step below passes.
**Sandbox only. Never use production keys or real cards.** Never commit secrets, tokens, or webhook secrets; paste evidence with IDs/timestamps only.

## A. Provider artifacts (sandbox dashboard, `sandbox-vendors.paddle.com`)
1. Sandbox account.
2. Product "OpsIQ Pro" + **recurring monthly price** → `PADDLE_PRICE_ID` (`pri_…`).
3. Developer tools → Authentication: **API key** (`PADDLE_API_KEY`) and **client-side token** (`test_…` → `PADDLE_CLIENT_TOKEN`).
4. Checkout → Checkout settings → **Default payment link** = `https://<staging-host>/pay` (sandbox accepts a test/dev URL; a public HTTPS staging host is easiest, or an HTTPS tunnel to a local dev server).
5. Developer tools → Notifications → destination `https://<staging-host>/api/webhooks/paddle`, events: `subscription.created|activated|updated|canceled|past_due|paused|resumed`, `transaction.completed`, `transaction.payment_failed` → **secret key** (`PADDLE_WEBHOOK_SECRET`).

## B. OpsIQ staging setup
```
PADDLE_ENV=sandbox PADDLE_API_KEY=… PADDLE_CLIENT_TOKEN=test_… PADDLE_PRICE_ID=pri_… PADDLE_WEBHOOK_SECRET=…
PADDLE_PLAN_PRICE_MONTHLY=<sandbox display price> BILLING_PAYWALL_ENFORCEMENT=on
OPSIQ_DB_TARGET=staging npx prisma migrate deploy        # disposable/staging DB only
npx tsx scripts/seed-commercial-plan.ts
```
Use a staging workspace + owner user (never the CB1-001 production workspace).

## C. Sequence and pass criteria (capture provider IDs + UTC timestamps for each)
| # | Action | Pass criterion / evidence |
|---|---|---|
| 1 | Log in as the staging owner → `/owner/billing` → **Upgrade** | `POST /api/billing/checkout` 200; `billing_accounts` row for the workspace, `paddle_customer_id` NULL |
| 2 | Same call | Paddle dashboard shows a new draft transaction `txn_…` with `custom_data.workspaceId` = the workspace; response `checkoutUrl` contains `_ptxn=txn_…` |
| 3 | Browser follows the URL | Lands on `/pay?_ptxn=txn_…`; no OpsIQ data on the page; no CSP violations in the console |
| 4 | — | **Paddle.js opens the checkout overlay** (Paddle.js is initialized once; verify in Network that `paddle.js` loads once) |
| 5 | Pay with Paddle's sandbox test card (see Paddle "test payment details" docs; typically `4242 4242 4242 4242`, any future expiry, CVC `100`) | Checkout shows success; `/pay` text changes to "Payment received… confirming" (display-only) |
| 6–7 | — | Paddle notification log shows deliveries to the destination with **200**; OpsIQ logs show no "signature rejected" |
| 8 | SQL below | `subscriptions.status='active'`, `paddle_subscription_id` set, `billing_accounts.paddle_customer_id` set; audit rows `billing.subscription_synced` + `subscription.activated` |
| 9 | Reload `/owner/billing` | Shows "Your subscription is active", renewal date, "Cancel at end of period" |
| 10 | As the owner call `POST /api/owner/approvals/resolve` (valid body) | 200 (not 402). Repeat as a workspace without a subscription → 402 |
| 11 | Paddle dashboard → Notifications → replay the `subscription.created` delivery | OpsIQ returns `{duplicate:true}`; still exactly 1 `subscriptions` row; no new audit row |
| 12 | Billing page → **Cancel at end of period** | `POST /api/billing/cancel` 200; audit `billing.cancellation_requested` |
| 13 | Wait for the resulting `subscription.updated` | `cancel_at_period_end=true`, status still `active`; billing page says "Access ends on <date>" |
| 14 | Before the effective date | `approvals/resolve` still 200. (Optional: in the sandbox, advance/force the cancellation; after `subscription.canceled` → `status='canceled'`, approvals/resolve → 402) |
| 15 | Simulate failed renewal: use the sandbox **webhook/subscription simulator** or a payment method that fails on renewal (per Paddle's test-payment docs) so Paddle emits `subscription.past_due` | `status='past_due'`; billing page shows **Payment problem** banner with grace end = missed renewal date + 7 days; `approvals/resolve` still 200 (grace); verify `current_billing_period.ends_at` in the webhook payload is the missed renewal date (policy assumption) |
| 15b | Click **Update payment method** | `POST /api/billing/payment-method` 200 → Paddle's update checkout opens via `/pay`; audit `billing.payment_method_update_requested`; DB status still `past_due` until webhook |
| 16 | Complete the update with a good test card; Paddle retries/charges | `subscription.updated` (`active`) arrives → `status='active'`; banner disappears; `approvals/resolve` 200 |

Evidence SQL (staging DB, read-only):
```sql
SELECT s.status, s.cancel_at_period_end, s.current_period_end, s.paddle_subscription_id, b.paddle_customer_id, s.last_event_timestamp
FROM subscriptions s JOIN billing_accounts b ON b.id = s.billing_account_id WHERE b.workspace_id = '<ws>';
SELECT event_name, occurred_at FROM audit_events WHERE workspace_id = '<ws>' AND event_name LIKE 'billing.%' OR event_name = 'subscription.activated' ORDER BY occurred_at;
SELECT stripe_event_id, type, status, attempts FROM webhook_events WHERE stripe_event_id LIKE 'paddle:%' ORDER BY created_at DESC LIMIT 20;
```

## D. Result recording
On full pass: `SANDBOX_PAYMENT_E2E=PASS` in the PR, attach the evidence table (IDs/timestamps only). Any failing step is a defect to investigate
(likely candidates: `/pay` CSP origins, `_ptxn` auto-open, past-due `current_billing_period` assumption, default-payment-link configuration).
