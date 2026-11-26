# OpsIQ Canonical Acquisition Policy

Status: ACTIVE, owner directive of 2026-11-20. This is the repository's canonical statement of the acquisition boundary; the runtime enforcement lives in the Content Desk store (`channels/first-touch-gate`, read by every growth run before any send) and in the hash-locked growth config (R5, `denied_ordinary_cold_sales_email`).

## 1. Prohibition (standing owner decision)
No new cold prospecting is sent from the primary domain `opsiq.solutions` (including `contact.us@opsiq.solutions`). A "new first touch" is any outbound email to a person who has not previously corresponded with OpsIQ, has not requested contact, and is not a customer.

## 2. Enforcement state (verified 2026-11-20)
- `channels/first-touch-gate.AUTONOMOUS_NEW_FIRST_TOUCH` = `PAUSED_OWNER_POLICY_NO_COLD_PROSPECTING_FROM_PRIMARY_DOMAIN` (previously `ENABLED` since 2026-10-11, which contradicted the R5 config). The previous value is preserved in the same document for audit. The gate document is marked `runs_may_not_modify`.
- Scope of the pause: new first touches only.
- Reopening requires an owner-linked session and an owner-approved compliant mechanism that does not use the primary domain. No scheduled or autonomous run may reopen it.

## 3. What continues (permitted)
- Replies to inbound messages and existing conversations, including already-scheduled follow-ups, under the existing compliance envelope (truthful sender, postal address, opt-out, suppression precheck, provider reconciliation, idempotency claim, run lease).
- Customer and transactional email (signup, billing, password reset, alerts).
- Organic content (LinkedIn, Facebook, Instagram, Medium, owned site resources and tools) and the R5 editorial earned-distribution lane, which is not customer prospecting.
- Prospect research and qualification (read-only discovery) may continue to feed a future owner-approved outreach mechanism, but nothing is sent.

## 4. Hard limits that remain
Zero incremental spend: no domain purchase, prospecting subscription, additional email service or paid advertising. No purchased or scraped lists. No platform-gate or CAPTCHA bypass. No fabricated testimonials. No autonomous modification of governance.

## 5. Compliant acquisition alternatives using existing resources (no new spend)
1. Inbound and organic: owned-site resources, the profit-margin calculator and `/agency` diagnostic, directory listings and the Product Hunt launch, each tagged with UTM parameters that land in `beta_requests` first-party attribution.
2. Warm and reply-driven: every reply or form submission opens a permitted conversation; follow-ups stay inside the envelope.
3. Editorial earned distribution (R5): accurate-identity editorial proposals, not sales prospecting.
4. Referral from existing conversations and customers (permission-based asks only).
5. Owner-operated outreach from the owner's personal channel is an owner decision and is not performed by automation.

## 6. Funnel and measurement
MARKET INTELLIGENCE → PROSPECT DISCOVERY → QUALIFICATION → MARKETING → OUTREACH (replies and warm only while paused) → REPLIES → SALES → REGISTRATION → ACTIVATION → RETENTION → REVENUE. Lead-level truth is first-party attribution on `beta_requests`; provider records (Metricool, Resend, Paddle) confirm execution. A scheduled job is never counted as an executed send.
