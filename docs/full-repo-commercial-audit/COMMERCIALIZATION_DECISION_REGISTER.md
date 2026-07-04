# Commercialization Decision Register

Decisions that require the owner/product before the related work can proceed.
These are NOT code bugs — they are choices. No behavior was changed for these.

| ID | Decision required | Why blocked | Options | Default if undecided |
|---|---|---|---|---|
| **DEC-EVID-01** | Canonical bundled evidence entity: `Evidence` vs `EvidenceItem` | `EvidenceBundleItem` FK-relates to `EvidenceItem`, but the bundle service was written for `Evidence` — irreconcilable without a design choice (GAP-EVIDENCE-DRIFT-02). | (A) re-point `EvidenceBundleItem`→`Evidence` (migration) + repair service like the core; (B) rewrite bundle service to use `EvidenceItem` (enum fields). | Bundles remain unavailable (routes return a governed/sanitized error, no data leak) until decided. |
| **DEC-BILL-01** | Billing provider + model (Stripe vs Lemon Squeezy; subscription vs usage) | Affects entitlement enforcement + metering design; out of current scope. | Keep `entitlement.service` provider-agnostic; decide provider at SaaS phase. | No billing built; Owner Mode unaffected. |
| **DEC-BILL-02** | Account lifecycle: cancellation / downgrade / data-retention behavior | Legal + product policy, not code. | Define retention windows, deletion, downgrade capability clamping. | Undefined; register before customer data at scale. |
| **DEC-PII-01** | PII handling, data-retention, deletion, staff-monitoring privacy policy | Legal/compliance policy. | Define per-jurisdiction data policy + audit-log retention. | Undefined; blocks enterprise/regulated customers. |
| **DEC-TEN-01** | Add `workspaceId` (+ FK) to `ClientAccount`/`LeadRecord`? | Schema change with backfill; these are tenant-owned but lack a DB tenant anchor (CM-TEN-02). | Migration + backfill + backstop allowlist; or keep query-filter scoping only. | Query-filter scoping continues (route layer safe); no DB anchor. |
| **DEC-SYSADMIN-01** | (resolved) Is `system_admin` global or workspace-scoped? | — | — | **RESOLVED: workspace-scoped** (getPolicyContext filters roles by `scope=workspace`; admin billing now uses verified workspace — GAP-TEN-03). No open decision. |

## How to close a decision
Record the choice inline here (option + date + who), then the linked gap
(GAP-EVIDENCE-DRIFT-02, CM-BILL-*, CM-TEN-02) becomes actionable with the
acceptance criteria already stated in its register.
