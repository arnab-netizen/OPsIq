# Billing & Monetization Readiness Audit

Audit only — **no billing/subscription/checkout was built**. Registers what
exists and the decisions/blockers before monetization.

## What exists (code)
- `src/services/entitlement.service.ts` — resolves plan/status/period per workspace; now backstop-scoped for `UsageEvent` metering.
- `Plan`, `PlanCapability`, `BillingAccount`, `Subscription`, `UsageEvent` models (`prisma/schema.prisma`).
- `src/app/api/billing/plan` (read plan — workspace-verified after GAP-TEN-02), `src/app/api/admin/billing/diagnostics` (SYSTEM_ADMIN, workspace-verified after GAP-TEN-03), `src/app/api/entitlement`.

## Readiness matrix
| Item | State | Blocker / criteria |
|---|---|---|
| Provider abstraction | PARTIAL | Keep `entitlement.service` provider-agnostic; DEC-BILL-01 (Stripe vs Lemon Squeezy). |
| Plan-limit enforcement | WEAK | `Plan`/`PlanCapability` exist; enforcement points sparse (CM-BILL-02). Criteria: server-side capability clamp per plan. |
| Usage metering | ADEQUATE(core) | `UsageEvent` metered + now tenant-enforced; cost-to-serve dims (AI tokens/storage) not fully metered (CM-BILL-03). |
| Free/paid capability boundary | WEAK | Undefined mapping plan→capabilities (CM-BILL-02). |
| Account lifecycle | MISSING | cancel/downgrade/retention undefined (DEC-BILL-02). |
| Billing-error isolation | ADEQUATE | Billing is admin/entitlement-scoped; verify entitlement failures fail-open for core Owner Mode so billing never blocks governed safety. |

## Must be true before SaaS (not now)
1. Decide provider + model (DEC-BILL-01) and lifecycle (DEC-BILL-02).
2. Enforce plan capability boundaries server-side.
3. Meter cost-driving actions (AI/storage) for cost-to-serve.
4. Keep Owner-Mode safety independent of billing state.

## Verdict
BLOCKED(decision). Architecture does not preclude monetization; no billing code
should be written until DEC-BILL-* are decided. No current Owner-Mode defect
originates from billing.
