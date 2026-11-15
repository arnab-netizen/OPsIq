# OpsIQ Commercial Minimum — Paddle (Merchant of Record)

Base `e5749ffbfc496cc87b3d8952d6b40eb17747d5c4`. Objective: `MARKETPLACE_SCALE_READINESS_ASAP` → `FIRST_REAL_PAYMENT_ASAP`.

**Status:** implemented on branch `claude/epic-ride-0hyyq1`; PR open, **not merged, not deployed, migration not applied to production,
live Paddle account NOT started/approved, real Paddle sandbox NOT yet exercised** (`SANDBOX_E2E_BLOCKED_BY_EXECUTION_ENVIRONMENT`,
see `SANDBOX_E2E_RUNBOOK.md`). `OPEN_BETA_TECHNICALLY_READY` stays **NO** until that runbook passes.

## 1. Provider position (published Paddle policy)

| Topic | Finding | Source |
|---|---|---|
| Countries | Paddle supports software suppliers globally except its explicit unsupported-country list; **India is not on that list** | [Supported countries](https://developer.paddle.com/concepts/sell/supported-countries-locales) |
| Individuals / sole traders | **Business verification is not required** for individuals / sole traders; the individual must still complete **identity verification** (government ID, may include proof of address via Paddle's verification partner) | [Business verification](https://www.paddle.com/help/start/account-verification/what-is-business-verification), [Account verification](https://www.paddle.com/help/start/account-verification) |
| Live account | Requires **Paddle approval** (identity verification + domain review). **The live OpsIQ account has not been applied for and is NOT approved** — `LIVE_PADDLE_APPROVAL=NOT_STARTED` | [Domain review](https://www.paddle.com/help/start/account-verification/what-is-domain-verification) |
| Live checkout domain review needs | Product description, pricing/features, and Terms, Privacy Policy and Refund Policy clearly reachable by navigation; live HTTPS site; company name in the Terms | same |
| Sandbox | **Does not require live-domain approval**; separate API (`sandbox-api.paddle.com`), keys, client token | [Sandbox](https://developer.paddle.com/build/tools/sandbox) |
| Merchant of Record | Paddle sells, charges, collects/remits tax, issues receipts; its MSA allows refund within 14 days of a subscription's latest renewal at Paddle's discretion | [Paddle MSA](https://www.paddle.com/legal/terms) |
| Payouts | USD/EUR/GBP etc. bank payouts (INR is not a payout currency); monthly, default $100 threshold — confirm in the live dashboard | [Get paid](https://www.paddle.com/help/manage/get-paid/when-and-how-do-i-get-paid) |
| Webhooks | `Paddle-Signature: ts=…;h1=…`, HMAC-SHA256 over `ts:rawBody` with the destination secret | [Signature verification](https://developer.paddle.com/webhooks/about/signature-verification/) |

This container cannot open `*.paddle.com`; these rows come from search-surfaced excerpts of the official pages. Re-confirm in the dashboard.

## 2. Architecture (reuse, not rebuild)

Reused: `Plan`, `BillingAccount`, `Subscription`, `WebhookEvent` (shared retry/idempotency state machine), `emitAuditEvent`,
`withCanonicalEnforcement`, `checkIdempotencyKey`, `resolveWorkspaceTier`/`getWorkspacePlan`. The legacy Stripe routes are untouched.
Additive migration `20261017180000_commercial_minimum_paddle_billing`: `plans.paddle_price_id`, `billing_accounts.paddle_customer_id`,
`subscriptions.paddle_subscription_id`, `subscriptions.cancel_at_period_end` (+ unique indexes). **No new migration in this iteration.**

```
owner → POST /api/billing/checkout (auth, OWNER_MANAGE, Idempotency-Key) → Paddle transaction (workspace set SERVER-side)
      → checkout.url = Default Payment Link → GET /pay?_ptxn=txn_…  (public, checkout-only; Paddle.js opens checkout)
Paddle → POST /api/webhooks/paddle (signature → Zod → idempotency → tenant resolve → guarded upsert + audit, one tx)
owner → GET /api/billing/status · POST /api/billing/cancel · POST /api/billing/payment-method (past-due recovery)
```

### `/pay` (Default Payment Link target)
Public, `noindex`, no session, no tenant or business data. Server component reads `PADDLE_ENV` and `PADDLE_CLIENT_TOKEN` at request time and
passes them to a client component that loads Paddle.js once, calls `Paddle.Environment.set("sandbox")` when `PADDLE_ENV=sandbox`,
`Paddle.Initialize({token})` exactly once (guarded against React strict-mode double effects), and relies on Paddle.js opening the `_ptxn`
transaction. A malformed/missing `_ptxn`, an unset token, or a token/environment mismatch (`test_` vs `live_`) shows a safe message and never
initializes. Frontend checkout events are display-only; **the verified webhook is the sole authority for entitlement.** A `/pay`-scoped CSP
(next.config.ts) is the only place that allows `cdn.paddle.com` scripts and Paddle checkout frames; the API key never reaches client code.

## 3. Access policy (one deterministic rule — `resolveAccess`)

| Provider status | Access | Notes |
|---|---|---|
| `active` | **paid** | includes a *scheduled* cancellation: access continues until Paddle sends `subscription.canceled` |
| `past_due` | **grace** for `PAST_DUE_GRACE_DAYS = 7` after the missed renewal date (`currentPeriodEnd`), then **denied** | visible "Payment problem" banner with grace end + **Update payment method** action; Paddle owns retries, OpsIQ runs no dunning |
| `paused` | denied | |
| `canceled` | denied | Paddle sends it when the cancellation is effective |
| trialing (none sold) / unknown / missing / lookup error | denied | fail closed |

Applied identically to the paywall (`assertCommercialAccess`), the owner status DTO, and the engagement-plan check (`getWorkspacePlan`).
Assumption to verify in sandbox: Paddle keeps the old `current_billing_period` on a `past_due` subscription until payment succeeds, so
`currentPeriodEnd` is the missed renewal date. If it were advanced, grace would be longer than 7 days after the failure — runbook step 15 checks this.

### Past-due recovery
`POST /api/billing/payment-method` (login + OWNER_MANAGE + Idempotency-Key, tenant-scoped by the verified workspace) calls Paddle
`GET /subscriptions/{id}/update-payment-method-transaction` server-side and returns that transaction's hosted checkout URL (→ `/pay`).
The browser never restores entitlement; only the next verified `subscription.updated` (status `active`) does.

## 4. Paywall point
Free: signup → onboarding → first diagnosis/first-value. Paid: governed execution — `POST /api/owner/approvals/resolve` →
`assertCommercialAccess()` → HTTP 402 when not paid/grace. `BILLING_PAYWALL_ENFORCEMENT` defaults **off** (live CB1-001 trial and invited
owners unaffected); switch on only with a separate OPEN_BETA authorization.

## 5. Live commercial compliance minimum (Paddle domain review content)
Added: `/pricing`, `/refund-policy`, Terms (paid-subscription section, Paddle MoR) and Privacy (Paddle disclosure) updates, footer links, sitemap entries.
Owner decisions still required — **none are guessed**:
- `PRICING_DECISION_REQUIRED` — `PUBLIC_PRICE_DISPLAY` is `null`; the pricing page says paid plans are not open and shows no number. Set the governed price in
  `src/domain/billing/public-pricing.ts` and on the Paddle price together.
- `REFUND_POLICY_OWNER_REVIEW` — the policy mirrors Paddle's standard 14-day treatment; the owner must confirm it is the intended OpsIQ policy.
- `LEGAL_ENTITY_NAME_REQUIRED` — Paddle's domain review expects the company/seller name in the Terms; it is not present. Legal review of Terms/Privacy/Refund also outstanding.

## 6. Go-live sequence (owner actions; nothing here has been done)
1. Start Paddle live onboarding (identity verification), publish the compliance pages on the live domain, submit domain review.
2. Run `SANDBOX_E2E_RUNBOOK.md` end to end in a network-capable environment; attach evidence.
3. Production env: `PADDLE_ENV=production`, live API key / webhook secret / `live_` client token / price id; default payment link → `https://<host>/pay`.
4. **PRODUCTION_MIGRATION_REQUIRED=YES** (additive) — apply with owner authorization, then `npx tsx scripts/seed-commercial-plan.ts`.
5. `BILLING_PAYWALL_ENFORCEMENT=on` only with OPEN_BETA authorization.

## 7. Hostile review outcome (read-only, separate reviewer)
Fixed (branch-caused): **P1** first-binding trusted a client-suppliable `custom_data.workspaceId` (Paddle's client token is public) — the first binding now also
requires the server-issued `custom_data.billingAccountId` (`unverified_binding` otherwise); a legacy non-Paddle live row can no longer be overwritten;
**P1** double payment — the extra provider subscription is cancelled immediately (provider 5xx ⇒ not acknowledged ⇒ retried), audited as
`billing.duplicate_subscription_canceled` with `refundRequired:true` (**refund of the duplicate charge is a manual Paddle-dashboard action**);
**P2** re-subscribe branch now also uses the stale guard (a delayed older-lineage event cannot resurrect access); equal timestamps: only a terminal
`canceled` wins a tie; first-event create race retries as an update instead of burning a retry attempt.
Accepted / documented, not changed:
- `unknown_price`/`unknown_tenant` signed events are audited and acknowledged (no endless retry); later snapshots self-heal. Seed the plan **before** enabling the destination.
- Shared dead-letter behavior (5 attempts) is pre-existing in `webhook.service`; a prolonged outage could dead-letter an event. Retry-threshold alerting already exists; reconcile from the Paddle dashboard if it fires.
- Grace is anchored on `currentPeriodEnd`; if a real `past_due` payload carries the *next* period, grace would be longer than 7 days — verified by runbook step 15.
- `getWorkspacePlan` (shared with the Stripe-era engagement path) now also honors the 7-day past-due grace — an intentional, announced behavior change for that path.
- `Date` truncates provider timestamps to milliseconds; ties inside one millisecond fall to the "cancel wins" rule.
- `services/idempotency.ts` looks keys up globally (pre-existing; keys are random per attempt client-side). Not changed here.

## 8. Limitations
- Real Paddle sandbox E2E not run (execution environment cannot reach Paddle; no sandbox credentials) — see runbook.
- Paddle.js `_ptxn` auto-open and the `/pay` CSP origins are implemented per Paddle's published behavior but are only *proven* by runbook steps 3–4.
- Billing events are platform-commercial operations, not client-business evidence, so they do not trigger BusinessConditionProfile/InterventionMode re-evaluation.
- Refund events (`adjustment.*`) are not automated; refunds happen in Paddle and a resulting `subscription.canceled` removes access.
- Legacy Stripe routes remain and are unrelated.
