# OpsIQ Commercial Minimum — Paddle (Merchant of Record)

Base: `e5749ffbfc496cc87b3d8952d6b40eb17747d5c4`. Objective: `MARKETPLACE_SCALE_READINESS_ASAP` → `FIRST_REAL_PAYMENT_ASAP`.
Status: implemented on branch, **not merged, not deployed, no real charge made, sandbox not exercised end-to-end** (see Limitations).

## 1. Provider decision (evidence)

Decision: **Paddle (Paddle Billing)**. Research was done through web search only — this build container's
network policy blocks `*.paddle.com` (HTTP CONNECT 403), so official pages could not be opened directly; every
row below is from search-surfaced excerpts of official Paddle pages and **must be confirmed in the live Paddle
dashboard before go-live**.

| Requirement | Finding | Source (official) | Confidence |
|---|---|---|---|
| India eligibility | India is not on Paddle's unsupported-countries list; Paddle states it supports sellers worldwide except listed restricted countries; Paddle publishes an India billing page ("no separate entity" for Indian merchants) | developer.paddle.com/concepts/sell/supported-countries-locales ; paddle.com/billing/india | Medium (excerpt) |
| Individual / sole proprietor | Paddle help: business verification is **not required** for sole traders / individuals; domain review + identity verification still apply | paddle.com/help/start/account-verification/what-is-business-verification | Medium (excerpt) |
| Merchant of Record | Yes — Paddle is the MoR and handles sales tax/VAT collection and remittance | Paddle product positioning | High |
| SaaS subscriptions | Yes (Paddle Billing: products/prices, subscriptions, cancel/pause) | developer.paddle.com | High |
| Payouts to India | Bank-transfer payouts are supported only in USD/EUR/GBP etc.; **INR is not a payout currency** → USD payout to an Indian bank; monthly, $100 default threshold | paddle.com/help/manage/get-paid/when-and-how-do-i-get-paid ; developer.paddle.com/concepts/payment-methods/wire-transfer | Medium — page age unstated; confirm in Transfer Preferences |
| Webhooks | `Paddle-Signature: ts=…;h1=…`, HMAC-SHA256 over `ts:rawBody`, per-destination secret | developer.paddle.com/webhooks/about/signature-verification | High |
| Sandbox | Separate sandbox API + keys (`sandbox-api.paddle.com`) | developer.paddle.com | High |
| Refunds / tax | Paddle (as MoR) issues refunds and handles tax; refund policy copy is still OPSIQ-owned | Paddle docs | Medium |

Rejected quickly: Lemon Squeezy — India payout support not confirmable from official pages and now Stripe-owned
with reported restrictions; Stripe (already integrated in-repo) — not a Merchant of Record, so OpsIQ would carry
global tax compliance.

`PROVIDER_ELIGIBILITY=PASS` and `INDIVIDUAL_ACCOUNT_PATH=PASS` are **evidence-based but unconfirmed by an actual
Paddle account application** — the owner must complete Paddle onboarding (domain review + identity verification).

## 2. Architecture (reuse, not rebuild)

Reused: `Plan`, `BillingAccount`, `Subscription`, `WebhookEvent` (shared retry/idempotency state machine in
`webhook.service`), `emitAuditEvent`, `withCanonicalEnforcement`, `checkIdempotencyKey`, `resolveWorkspaceTier`.
The legacy Stripe routes are untouched and unused by this path.

New (additive migration `20261017180000_commercial_minimum_paddle_billing`): `plans.paddle_price_id`,
`billing_accounts.paddle_customer_id`, `subscriptions.paddle_subscription_id`, `subscriptions.cancel_at_period_end`.

```
owner → POST /api/billing/checkout (auth, OWNER_MANAGE, Idempotency-Key)
      → Paddle transaction (custom_data.workspaceId set SERVER-side) → hosted checkout URL
Paddle → POST /api/webhooks/paddle (signature → Zod → idempotency → tenant resolve → guarded upsert + audit, one tx)
owner → GET /api/billing/status ; POST /api/billing/cancel (schedules cancel at period end)
```

Entitlement rule (single, fail closed): entitled **only** while local `Subscription.status === "active"`. past_due,
paused, canceled, trialing (not sold), unknown, missing, lookup error → not entitled. Cancel-at-period-end keeps
`active` until Paddle sends `subscription.canceled`. Nothing the browser reports is ever trusted.

## 3. Paywall point

Free: signup → onboarding → first diagnosis / first-value read-outs (no payment before first value).
Paid: **governed execution** — `POST /api/owner/approvals/resolve` (owner approval resolution) calls
`assertCommercialAccess()` → HTTP 402 when unentitled. Chosen because it is the step that converts diagnosis into
ongoing governed intervention, it is one centralized server-side check, and it leaves every read/diagnosis surface
untouched. `BILLING_PAYWALL_ENFORCEMENT` defaults **off**, so the live CB1-001 trial and all invited owners are
unaffected; it is switched on only with a separate OPEN_BETA authorization. Further continuation routes can adopt
the same one-line check.

## 4. Go-live runbook (owner actions)

1. Paddle: create account (sandbox first), complete verification; create product + monthly price; set a default
   payment link on an approved domain; create a notification destination → `https://<host>/api/webhooks/paddle`
   subscribed to `subscription.*` and `transaction.completed` / `transaction.payment_failed`.
2. Set `PADDLE_ENV=sandbox`, `PADDLE_API_KEY`, `PADDLE_WEBHOOK_SECRET`, `PADDLE_PRICE_ID`, `PADDLE_PLAN_PRICE_MONTHLY`.
3. Apply migration (**additive; production migration required** — owner-authorized), then
   `npx tsx scripts/seed-commercial-plan.ts`.
4. Sandbox E2E with a Paddle test card: upgrade → webhook → `/owner/billing` shows active → cancel → period end.
5. Only then: production keys, `PADDLE_ENV=production`; paywall `on` only when OPEN_BETA is authorized.

## 5. Marketplace-launch asset gaps

See `MARKETPLACE_ASSET_CHECKLIST.md`.

## 6. Known limitations (section G)

- **Sandbox payment E2E was NOT run**: the build container cannot reach Paddle (network policy) and has no Paddle
  account/keys. Evidence is unit/contract level with a signature-faithful HMAC harness, not a real sandbox charge.
- No database was reachable (Neon blocked), so no `.db` tests ran and the migration was not applied to a database;
  it is validated by `prisma validate` and review only.
- Adaptive rule: billing events are platform-commercial operations, not client-business evidence, so they do not
  trigger BusinessConditionProfile / InterventionMode re-evaluation. Entitlement loss gates execution only.
- Plan capability rows (`PlanCapability`) are not seeded; the engagement-mode `assertCapability` path is unchanged.
- Refund handling is not automated (`adjustment.*` events ignored); refunds are issued in the Paddle dashboard, and
  the resulting `subscription.canceled` removes access.
- Dunning/grace: `past_due` removes access immediately (fail closed); Paddle's retry schedule restores it via
  `subscription.updated` if payment recovers.
- Legacy `src/app/api/billing/upgrade` (Stripe) remains and is unrelated; not deleted to avoid scope creep.
