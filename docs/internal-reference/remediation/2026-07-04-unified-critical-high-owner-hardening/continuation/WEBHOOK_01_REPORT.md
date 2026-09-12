# WEBHOOK-01 — Webhook Safety Report

## Routes
- `/api/webhooks/stripe` — signature verification is REAL (`verifyWebhookSignature` on raw body,
  fail-closed 401 on bad/missing signature and missing secret); `stripeEventId @unique` dedup prevents
  reprocessing. **Cannot elevate entitlement without a valid Stripe signature.**
- `/api/webhooks/subscribe`, `/api/webhooks/[id]/test` — workspace-scoped via `enforceWorkspaceScoping`.

## Remaining issue (WEBHOOK-01)
Stripe processing is fire-and-forget (`handleWebhookEvent(event).then(...)` then 202) — in serverless
the function may be frozen after responding, so a subscription-activation event could be delayed/dropped
(WEBHOOK-01) and `syncSubscriptionStatus` fails open. The custom replay-timestamp check is a no-op
(hardcoded Date.now) but the Stripe SDK's own 300s tolerance + dedup cover replay.

## Classification
- **NOT a PILOT blocker:** the webhook is signature-gated (no entitlement elevation possible) and pilot
  scope does NOT run public billing.
- **PUBLIC_SAAS_BLOCKER (reliability):** await-before-ack (or a durable queue) + fail-closed subscription
  sync are required before paid SaaS. Not changed here to avoid an untested change to the payment path
  (no way to run a signed Stripe event end-to-end in this harness).
- Lemon Squeezy (the intended provider) is NOT built — see DEC_BILL doc. Do not treat Stripe code as
  production-ready billing.

**Status: WEBHOOK-01 — signature/dedup SAFE (proven by design); fire-and-forget reliability OPEN as a
PUBLIC_SAAS blocker, NOT pilot-blocking.**
