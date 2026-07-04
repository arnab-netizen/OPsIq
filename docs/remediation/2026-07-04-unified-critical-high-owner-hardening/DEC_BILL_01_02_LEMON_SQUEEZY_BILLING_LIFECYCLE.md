# DEC-BILL-01/02 — Billing Model & Lifecycle (Lemon Squeezy)

## Source verification
- Current billing code is **Stripe-based** (`services/webhook.service.ts` uses `stripe.webhooks.constructEvent`; `lib/billing/*`). **No Lemon Squeezy integration exists** (0 `lemon` refs in src).
- Entitlement gate (`entitlement.service.assertCapability`) is DB-backed and fail-closed; **BILL-01 (x-tier trust) is CLOSED_PROVEN** on this branch (`resolveWorkspaceTier`, server-side).

## Decision
- **Lemon Squeezy is NOT built.** Do not claim billing/public-SaaS readiness. Billing remains a **public-SaaS blocker**.
- The intended lifecycle (trial/demo/active/grace/failed/cancelled/expired/refund/upgrade/downgrade → workspace entitlement mapping; webhook signature + idempotency; admin override; fail-closed) is specified here as the acceptance contract but is **not implemented** for Lemon Squeezy.
- Existing Stripe webhook has real signature verification + `stripeEventId` dedup, but fire-and-forget processing (WEBHOOK-01) and no `currentPeriodEnd` expiry enforcement (BILL-02) remain OPEN.

## Status
- BILL-01: **CLOSED_PROVEN** (x-tier bypass fixed).
- BILL-02 (expiry enforcement), WEBHOOK-01 (fire-and-forget): **STILL_OPEN**.
- DEC-BILL-01/02 (Lemon Squeezy model + lifecycle): **NOT_STARTED — public-SaaS blocker, owner decision required on provider/scope.**

**PUBLIC_SAAS billing status: NOT_READY.**
