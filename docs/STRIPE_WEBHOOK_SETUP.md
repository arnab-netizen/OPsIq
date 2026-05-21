# Stripe Webhook Setup Guide

**Document:** Stripe Webhook Configuration for Production  
**Last Updated:** 2026-05-21  
**Owner:** DevOps / Billing Team  
**Severity:** P0 Blocker for Payment Processing

---

## Overview

OpsIQ uses Stripe webhooks to:
- Activate subscriptions when customers complete payment
- Handle subscription cancellations
- Update billing status
- Prevent duplicate charges through idempotency

This document guides setup of Stripe webhooks for production.

---

## Prerequisites

- [ ] Stripe account created
- [ ] API keys generated (see below)
- [ ] Production domain registered and DNS pointing to OpsIQ
- [ ] SSL certificate configured (HTTPS required for webhooks)
- [ ] Application deployed to production

---

## Step 1: Generate Stripe API Keys

### Create Stripe Account (if needed)

1. Go to https://dashboard.stripe.com/register
2. Fill in business details
3. Verify email

### Get API Keys

1. Log in to Stripe Dashboard: https://dashboard.stripe.com
2. Navigate to **Developers** > **API keys** (sidebar)
3. You'll see two sets of keys:
   - **Publishable key** (safe to expose to browser) - starts with `pk_`
   - **Secret key** (keep private!) - starts with `sk_`

4. For **LIVE MODE** (production):
   - Copy the **Live** Publishable Key (starts with `pk_live_`)
   - Copy the **Live** Secret Key (starts with `sk_live_`)

5. For **TEST MODE** (staging/development):
   - Copy the **Test** Publishable Key (starts with `pk_test_`)
   - Copy the **Test** Secret Key (starts with `sk_test_`)

---

## Step 2: Set Environment Variables

### Production Environment

```bash
# Add these to your secrets manager (AWS Secrets Manager, GitHub Secrets, etc.)
STRIPE_SECRET_KEY=sk_live_xxxxxxxxxxxxxxxxxxxxxxxx
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_xxxxxxxxxxxxxxxxxxxxxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxx  # See Step 3
```

### Staging/Development Environment

```bash
# Add these to .env.staging.example or secrets
STRIPE_SECRET_KEY=sk_test_xxxxxxxxxxxxxxxxxxxxxxxx
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxxxxxxxxxxxxxxxxxxxxxxx
STRIPE_WEBHOOK_SECRET=whsec_test_xxxxxxxxxxxxxxxxxxxxxxxx
```

---

## Step 3: Register Webhook Endpoint

### Navigate to Webhooks Settings

1. In Stripe Dashboard, go to **Developers** > **Webhooks** (sidebar)
2. Click **Add an endpoint**

### Configure the Endpoint

**Endpoint URL:**
```
https://yourdomain.com/api/webhooks/stripe
```

Replace `yourdomain.com` with your actual production domain.

**For staging:**
```
https://staging.yourdomain.com/api/webhooks/stripe
```

**API version:** Leave as default (latest)

### Select Events to Send

Click **Select events** and choose these events:

**Customer events:**
- `customer.created`
- `customer.updated`
- `customer.deleted`

**Subscription events:**
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

**Payment Intent events:**
- `payment_intent.succeeded`
- `payment_intent.payment_failed`
- `payment_intent.canceled`

**Invoice events:**
- `invoice.created`
- `invoice.finalized`
- `invoice.payment_succeeded`
- `invoice.payment_failed`

### Save Webhook

Click **Add endpoint**

---

## Step 4: Get Webhook Signing Secret

After creating the webhook endpoint:

1. The endpoint will appear in your webhooks list
2. Click the endpoint to view details
3. Scroll down to **Signing secret**
4. Click **Reveal** to show the secret
5. Copy the value (starts with `whsec_`)
6. Add to environment variables as `STRIPE_WEBHOOK_SECRET`

---

## Step 5: Test Webhook Delivery

### Using Stripe Dashboard

1. Go to **Developers** > **Webhooks**
2. Click your endpoint
3. Scroll to **Recent events**
4. Click **Send a test event**
5. Select **Test events** > **customer.created**
6. Click **Send event**
7. Webhook response should show **200 OK** within a few seconds

### Verify in Application

Check application logs for webhook processing:

```bash
# Tail application logs
tail -f /var/log/opsiq/app.log | grep "webhook"

# Expected output:
# [INFO] Webhook received: event_id=evt_1234567890
# [INFO] Event processed: type=customer.created
# [INFO] Status: processed
```

---

## Step 6: Verify API Keys Work

### Test API Call (optional but recommended)

```bash
# Test Stripe API connectivity
curl https://api.stripe.com/v1/customers \
  -u sk_test_xxxxxxxxxxxxxxxxxxxxxxxx: \
  -X GET

# Expected: List of customers (empty if no customers yet)
```

---

## Testing Webhooks End-to-End

### Simulate Payment Flow in Test Mode

1. Go to Stripe Dashboard > Payments > Customers
2. Click **Create customer**
3. Fill in email: `test-customer@example.com`
4. Click **Create**
5. Create a subscription for the customer
6. Stripe will send webhooks to your endpoint
7. Check application logs for webhook processing

### Stripe Test Cards

For testing subscriptions, use these test card numbers:

| Card | Status |
|------|--------|
| 4242 4242 4242 4242 | Successful |
| 4000 0000 0000 0002 | Card declined |
| 5555 5555 5555 4444 | Mastercard |

**Expiry:** Any future date  
**CVC:** Any 3 digits

---

## Webhook Security Verification

### Check Signature Verification

OpsIQ webhook handler includes signature verification:

```typescript
// In src/app/api/webhooks/stripe/route.ts
const verified = await verifyWebhookSignature(body, signature || "");
```

This verifies:
- ✓ Webhook signature is valid (matches `STRIPE_WEBHOOK_SECRET`)
- ✓ Webhook has not been tampered with
- ✓ Webhook is from Stripe (not a malicious actor)

### Check Timestamp Tolerance

Webhook timestamp is validated to be within 5 minutes:

```typescript
// Prevents replay attacks
checkSignatureTimestamp(timestamp);  // Fails if >5 min old
```

---

## Monitoring Webhooks

### View Webhook Events in Stripe Dashboard

1. Go to **Developers** > **Webhooks**
2. Click your endpoint
3. **Recent events** shows last 100 events
4. Each event shows:
   - Event ID (starts with `evt_`)
   - Timestamp
   - Response status (200 = success, 4xx/5xx = failed)
   - Response time

### Check Webhook Retry Logic

If a webhook fails (non-200 response), Stripe retries:
- 1st retry: 5 seconds
- 2nd retry: 5 minutes
- 3rd retry: 30 minutes
- 4th retry: 2 hours
- 5th retry: 5 hours
- 6th retry: 10 hours
- 7th retry: 24 hours
- 8th retry: 72 hours

After 8 retries, webhook is disabled. Check your logs to see why it's failing.

### Alert on Webhook Failures

Set up alerts in your monitoring system:
```
IF webhook_response_status != 200 for 5 consecutive attempts THEN alert engineering@company.com
```

---

## Production Checklist

Before enabling webhooks in production:

- [ ] `STRIPE_SECRET_KEY` is `sk_live_*` (not `sk_test_*`)
- [ ] `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is `pk_live_*` (not `pk_test_*`)
- [ ] `STRIPE_WEBHOOK_SECRET` is `whsec_*` for live endpoint (not test)
- [ ] Webhook endpoint URL is `https://yourdomain.com/api/webhooks/stripe` (HTTPS required)
- [ ] SSL certificate is valid (not self-signed)
- [ ] Application is deployed and running
- [ ] Application logs show webhook processing working
- [ ] Test webhook was successfully delivered (see Step 5)
- [ ] Health check endpoint returns 200
- [ ] Database can store webhook events

---

## Troubleshooting

### Webhook Not Received

**Check 1: Domain Resolves**
```bash
nslookup yourdomain.com
# Should return your app's IP address
```

**Check 2: Application is Running**
```bash
curl -I https://yourdomain.com/api/webhooks/stripe
# Should return 405 (Method Not Allowed - POST endpoint expects POST)
# If 404, endpoint is not registered
# If connection refused, app is not running
```

**Check 3: SSL Certificate Valid**
```bash
curl -v https://yourdomain.com/api/health
# Should show valid SSL certificate, no warnings
```

### Webhook Received but Not Processed

**Check application logs:**
```bash
tail -f /var/log/opsiq/app.log | grep -E "webhook|stripe"
```

**Common errors:**
- `Invalid signature` → `STRIPE_WEBHOOK_SECRET` is wrong
- `Event not found` → Event was already processed (idempotent, safe to ignore)
- `Database error` → Database is down or schema missing

### Duplicate Processing

OpsIQ prevents duplicate processing through:
1. **Database constraint:** `UNIQUE (stripeEventId, workspaceId)`
2. **Idempotency key:** Webhook event ID guarantees exactly-once processing

So if the same webhook is delivered twice, the second will be safely ignored.

---

## Monitoring & Alerting

### Recommended Alerts

1. **Webhook Delivery Failure Rate**
   - Alert if >5% of webhooks fail for >10 minutes
   - Check: Stripe Dashboard > Webhooks > Event Status

2. **Customer Subscription Issues**
   - Alert if subscriptions not created within 5 min of payment
   - Check: Application logs for `subscription_created` events

3. **Payment Intent Failures**
   - Alert if payment failures happen during business hours
   - Check: `payment_intent.payment_failed` events

### Example Alert Rule (Datadog)

```
monitor:
  name: Stripe Webhook Failures
  type: metric alert
  query: avg:stripe.webhook.failure_rate{*} > 0.05
  threshold: 0.05
  evaluation_periods: 2
  datadog_service: billing
```

---

## Webhook Payload Example

When a customer subscribes, Stripe sends this webhook:

```json
{
  "id": "evt_1OzSY2AvBv5BIkOX",
  "type": "customer.subscription.created",
  "created": 1623456789,
  "data": {
    "object": {
      "id": "sub_1OzSY2AvBv5BIkOX",
      "object": "subscription",
      "customer": "cus_1OzSY2AvBv5BIkOX",
      "items": {
        "object": "list",
        "data": [
          {
            "id": "si_1OzSY2AvBv5BIkOX",
            "price": {
              "id": "price_1OzSY2AvBv5BIkOX",
              "product": "prod_1OzSY2AvBv5BIkOX"
            }
          }
        ]
      },
      "status": "active"
    }
  }
}
```

OpsIQ processes this to:
- Update customer billing status
- Activate their workspace
- Send welcome email

---

## References

- [Stripe Webhook Documentation](https://stripe.com/docs/webhooks)
- [Stripe API Keys](https://stripe.com/docs/keys)
- [Stripe Event Types](https://stripe.com/docs/api/events/types)
- [OpsIQ Webhook Handler](../src/app/api/webhooks/stripe/route.ts)
- [OpsIQ Webhook Service](../src/services/webhook.service.ts)

---

**Questions?** Contact billing@company.com or DevOps team.
