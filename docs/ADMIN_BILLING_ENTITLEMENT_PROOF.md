# Admin Billing & Entitlement Proof Surface

**Status:** Repo-side implementation complete. Diagnostic proof surface operational.

---

## Overview

The Admin Billing & Entitlement Proof Surface provides admins and support teams with:
- Comprehensive billing account diagnostics
- Subscription status and period tracking
- Plan capabilities and limitations
- Current usage metrics
- Entitlement decision explanations
- Support-safe export packets
- Workspace-scoped access only
- No secret values exposed

---

## What It Shows

### Billing Account
- Workspace ID and billing account ID
- Account status (active, inactive, unknown)
- Stripe customer ID (reference only)
- Account creation date

### Subscription
- Current subscription status (active, canceled, past_due, incomplete, unknown)
- Subscription period (start and end dates)
- Plan reference
- Stripe subscription ID (reference only)

### Plan
- Plan name and pricing (monthly/yearly)
- List of capabilities with limits
- Capability descriptions
- Capability limits (null = unlimited)

### Entitlement Decisions
For each capability:
- **Allowed:** Boolean - whether usage is within limits
- **Reason:** Human-readable explanation (e.g., "Usage 80 within limit 100")
- **Usage:** Current usage value
- **Limit:** Plan limit (null = unlimited)
- **Percentage Used:** (limit only) Usage as percentage of limit

### Usage Summary
- Usage metrics for current billing period
- Per-capability breakdown
- Aggregated from UsageEvent records
- Scoped to workspace

### Diagnostics
- Status: "complete" (all data), "partial" (some missing), "none" (no data)
- Warnings: Non-blocking issues (e.g., "Subscription status is past_due")
- Missing Data: Blocking missing states (e.g., "NO_BILLING_ACCOUNT")

---

## Who Can Access It

### API Route: `/api/admin/billing/diagnostics`
- **Auth:** `withCanonicalEnforcement`
- **Capability Required:** `SYSTEM_ADMIN`
- **Input:** `x-workspace-id` header
- **Output:** `BillingDiagnosticDTO` or `BillingExportPacketDTO`

### UI Page: `/admin/billing`
- **Auth:** `withCanonicalEnforcement`
- **Capability Required:** `SYSTEM_ADMIN`
- **Purpose:** Admin-safe diagnostic dashboard
- **Features:**
  - Real-time diagnostic loading
  - Entitlement decision visualization
  - Usage breakdown by capability
  - Diagnostic warnings and missing data alerts
  - Manual refresh

---

## How It Helps Support/Admins

### Troubleshooting
- Identify why a capability is denied
- Check current usage vs. limits
- Review subscription status without accessing raw Stripe data
- See period-end dates for billing cycle questions

### Diagnostics
- Detect missing billing account or subscription
- Identify plan mismatch issues
- Review workspace-specific usage patterns
- Validate entitlement rule application

### Exports
- Generate admin-safe export packet for customer support
- Support-ready JSON packet with no secrets
- Metadata for query performance and diagnostic status

---

## How It Works

### Service Architecture
```
Admin Route (/api/admin/billing/diagnostics)
    ↓
withCanonicalEnforcement (auth + admin capability check)
    ↓
AdminBillingDiagnosticsService.getBillingDiagnostic()
    ↓
Load: BillingAccount → Subscription → Plan → Usage
    ↓
Return: BillingDiagnosticDTO (or partial state on missing data)
    ↓
Client UI or Support Export
```

### Fail-Closed Design
- Missing workspace scope → error (invalid auth)
- Missing billing account → safe "NO_BILLING_ACCOUNT" state
- Missing subscription → safe "NO_ACTIVE_SUBSCRIPTION" state
- Missing plan → safe "PLAN_NOT_FOUND" state
- No cross-workspace data leakage (filtered by workspaceId)

### Secret Safety
- **Stripe Customer ID:** Reference only (first 10 chars, no full key)
- **Stripe Subscription ID:** Reference only (same)
- **Stripe Secret Key:** Never included
- **Webhook Secret:** Never included
- **Payment Method:** Not included
- **Raw Database Data:** Transformed to DTOs

---

## External Limitations

### Requires External Setup (not in repo)
- **Stripe Account:** For payment processing (webhook integration)
- **Billing Database:** Usage event creation via business logic
- **Auth Provider:** SYSTEM_ADMIN role assignment
- **Scheduled Jobs:** For period-end calculations (if needed)

### What This Slice Does NOT Do
- Create billing accounts (done during workspace initialization)
- Process Stripe webhooks (separate webhook service)
- Calculate subscription periods (Stripe manages)
- Generate invoices (Stripe does this)
- Send billing emails (external email service)

---

## DTOs and Types

### BillingDiagnosticDTO
```typescript
{
  timestamp: string;
  workspaceId: string;
  account: BillingAccountSummaryDTO;
  subscription: SubscriptionStatusDTO;
  plan?: PlanDTO;
  entitlementDecisions: EntitlementDecisionDTO[];
  usage: UsageSummaryDTO[];
  diagnostics: {
    status: "complete" | "partial" | "none";
    warnings: string[];
    missingData: string[];
  };
}
```

### BillingExportPacketDTO
```typescript
{
  timestamp: string;
  workspaceId: string;
  generatedAt: string;
  account: BillingAccountSummaryDTO;
  subscription: SubscriptionStatusDTO;
  plan?: PlanDTO;
  entitlementDecisions: EntitlementDecisionDTO[];
  usage: UsageSummaryDTO[];
  supportMetadata: {
    databaseQueryTimeMs?: number;
    diagnosticStatus: string;
    missingData: string[];
  };
}
```

---

## API Examples

### Get Diagnostics
```bash
curl -H "x-workspace-id: workspace-123" \
     -H "Authorization: Bearer <token>" \
     https://example.com/api/admin/billing/diagnostics
```

### Get Export Packet
```bash
curl -H "x-workspace-id: workspace-123" \
     -H "Authorization: Bearer <token>" \
     "https://example.com/api/admin/billing/diagnostics?format=export"
```

---

## Testing

### Service Tests
- No billing account → safe "NO_BILLING_ACCOUNT" state
- No subscription → safe "NO_ACTIVE_SUBSCRIPTION" state
- No plan → safe "PLAN_NOT_FOUND" state
- Complete data → full diagnostic
- Entitlement deny (usage > limit) → marked denied
- Entitlement allow (usage ≤ limit) → marked allowed
- Unlimited capabilities → no percentage shown
- Workspace scope isolation → no cross-workspace leakage
- Invalid workspaceId → validation error

### Route Tests
- Missing auth → 401/403
- Missing SYSTEM_ADMIN capability → 403
- Missing x-workspace-id header → 400 error
- Valid request → diagnostic DTO
- Export format request → export packet DTO

---

## Known Limitations

### In Scope But Not Implemented
- Billing quota enforcement (in business logic, not here)
- Usage metering (in usage.service.ts, not here)
- Period rollover logic (managed by Stripe)
- Invoice generation (Stripe API)

### Out of Scope
- Customer billing page (separate UI surface)
- Payment method management (Stripe Billing Portal)
- Subscription upgrade UI (handled in checkout flow)
- Email notifications (external email service)
- Analytics dashboards (separate system)

---

## Support Resources

### For Customers
- Direct them to their workspace admin to check diagnostics
- Export packet available from admin surface for investigation

### For Support Team
- Access admin surface with SYSTEM_ADMIN role
- Export diagnostics for customer record
- Check warnings and missing data for issue diagnosis

### For Engineering
- Service tests verify safe error states
- Route tests verify auth/admin enforcement
- DTO tests verify no secret leakage
- Integration tests verify workspace scoping

---

**Status:** Ready for deployment  
**Last Updated:** 2026-05-23  
**Next Review:** When external billing infrastructure becomes available
