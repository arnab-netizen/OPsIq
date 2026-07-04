# Commercialization Gap Register

Blockers that would prevent OpsIQ from later becoming a credible, reliable,
profitable multi-tenant product. **No SaaS/billing/marketing was built** — this
registers blockers and decision points. Each: severity · current Owner-Mode
impact · future commercialization impact · fix/criteria · status.

## A. Multi-tenant SaaS safety
| ID | Sev | Gap | Owner-Mode impact | Commercial impact | Status / fix |
|---|---|---|---|---|---|
| CM-TEN-01 | HIGH→closed | DB-level tenant backstop inert | none (route layer live) | multi-tenant needs DB backstop | **Downgraded** — backstop live for UsageEvent; per-model criteria to grow (GAP-TEN-01). |
| CM-TEN-02 | MED | `ClientAccount`/`LeadRecord` have **no** `workspaceId` and no non-null workspace relation | scoped in practice via query filters | at customer scale a missing DB tenant anchor is a leak risk | OPEN. Fix: add `workspaceId` (+ FK) to both models via migration; backfill; add to backstop allowlist. |
| CM-TEN-03 | LOW | `findUnique`/`upsert` not gated by the backstop | route layer covers | defense-in-depth gap | OPEN (documented limitation). |
| CM-TEN-04 | LOW | Background/retention jobs use ambient `db` | retention-cleanup IS per-workspace | verify all future jobs are tenant-scoped | OPEN (audit new jobs). |

## B. Billing & monetization readiness (do NOT build now)
| ID | Sev | Gap | Status / criteria |
|---|---|---|---|
| CM-BILL-01 | MED | Billing scaffolding assumes Stripe-style entitlements; future may require Lemon Squeezy | OPEN (decision — see DECISION_REGISTER). Keep `entitlement.service` provider-agnostic. |
| CM-BILL-02 | MED | Plan limits (`Plan`/`PlanCapability`) exist but enforcement points are sparse | OPEN. Criteria: capability boundary enforced server-side per plan before SaaS. |
| CM-BILL-03 | MED | Usage metering exists (`UsageEvent`, now backstop-enforced) but cost-to-serve dimensions (AI tokens, storage) not fully metered | OPEN. Criteria: meter cost-driving actions before pricing. |
| CM-BILL-04 | MED | Account lifecycle (cancel/downgrade/data-retention) undefined | OPEN (decision). |
| CM-BILL-05 | LOW | Billing errors could surface in Owner Mode | Low now (admin-only routes); verify entitlement failures fail-open for core Owner Mode. |

## C. Onboarding & activation
| ID | Sev | Gap | Status |
|---|---|---|---|
| CM-ONB-01 | MED | Time-to-first-output not instrumented | OPEN. Criteria: measure signup→first diagnosis in a pilot. |
| CM-ONB-02 | LOW | Empty states / intake-missing-data actionability | ADEQUATE (guided shells, demo seed); verify in pilot. |

## D. Supportability & operability
| ID | Sev | Gap | Status |
|---|---|---|---|
| CM-SUP-01 | MED | Some mutations audited best-effort (audit trail may miss high-risk actions) | **Partially fixed** — override + blocked-decision now transactional; GAP-AUDIT-02 remains for addItems/updateItem. |
| CM-SUP-02 | LOW | Correlation IDs present (`createEventLogger`) but not uniformly threaded | OPEN. Criteria: correlation id on every governed mutation + surfaced in support diagnostics. |
| CM-SUP-03 | LOW | Failed jobs/actions reconciliation | ADEQUATE for proof/idempotency; register outbox for audit retry (GAP-AUDIT-02 option c). |

## E. Security & enterprise credibility
| ID | Sev | Gap | Status |
|---|---|---|---|
| CM-SEC-01 | HIGH→closed | Cross-tenant header trust (6 routes) + admin billing | **Closed** (GAP-TEN-02, GAP-TEN-03). |
| CM-SEC-02 | MED | Error-governance baseline: 32 frozen raw-`error.message` findings | OPEN (ratcheted, non-blocking). Criteria: burn down before enterprise sale. |
| CM-SEC-03 | LOW | Asymmetric signature not verified on write path | OPEN (hardening, from prior audit). |

## F. Legal / compliance / local risk
| ID | Sev | Gap | Status |
|---|---|---|---|
| CM-LEG-01 | MED | Compliance advice jurisdiction/source-confidence + escalation | ADEQUATE (abstention gates, legal-boundary tests) — verify per-jurisdiction in pilot. |
| CM-LEG-02 | MED | PII handling / data-retention / deletion policy undefined | OPEN (decision) — required before customer data at scale. |

## G. Reliability & cost-to-serve
| ID | Sev | Gap | Status |
|---|---|---|---|
| CM-REL-01 | LOW | pg pool has no explicit max/timeouts | OPEN (relies on Neon pooler). |
| CM-REL-02 | LOW | Test-isolation defect (`admin-operability-db.test.ts`) | OPEN (fresh-DB CI unaffected). |

## H. Commercial outcome / profitability
Levers audited STRONG→ADEQUATE (cash/runway protection, proof-gated execution, owner-time reduction, outcome measurement) — see `PROFITABILITY_AUDIT.md`. No architectural blocker to monetization; the gate is CM-BILL-* + CM-LEG-02 decisions, not code.

## Net
No **new critical/high** commercialization blocker is both locally fixable AND in-scope (SaaS/billing explicitly out of scope). The high-severity tenancy/security items were closed or downgraded-with-proof this slice. Remaining items are MEDIUM/LOW or owner-decision (billing model, PII/retention policy, ClientAccount/LeadRecord tenant anchor).
