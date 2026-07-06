# OpsIQ Owner Mode — Owner-Use Restrictions (Level 3, accepted with restrictions)

Audited main HEAD: `872bd72e89e1fa0fb3010378e214aba14ef6d656` (fully merged; contains PR #147 + PASS 15).
Classification: **LEVEL_3_OWNER_MODE_ACCEPTED_WITH_RESTRICTIONS** — private owner-mode use only.

## 1. What OpsIQ can be used for now
- See the single most important operational problem today, with the evidence behind it and one recommended correction.
- Track proof integrity, weak/reused proof, and complaint/rework signals; adjudicate flagged findings.
- Route process corrections, SOP/checklist drafts, and training/review recommendations.
- Reduce avoidable owner workload and see which routine actions are safe to delegate.
- Ingest owner-submitted external opportunity/tender signals; screen them; run cheap validation experiments; record outcomes; and see a capital-allocation view that only scales validated opportunities.
- Track opportunity execution/delegation tasks with required completion evidence.

## 2. What requires owner approval
Any material action: high cash-exposure opportunities, tender preparation, scaling a validated opportunity,
and every task classified `OWNER_APPROVAL_REVIEW`. These are never auto-completed and cannot be completed by a
non-owner.

## 3. What is draft-only
Bid drafts, proof packs, SOP/checklist changes, and validation plans are **prepared** by OpsIQ for owner
review — never submitted, applied, or executed automatically.

## 4. What is NOT automated
Tender submission, customer outreach, spending, contracts, payroll/staff actions, and scaling. OpsIQ produces
recommendations and drafts; a human acts.

## 5. What remains unproven
Exhaustive per-screen browser coverage (critical journeys are proven); behaviour with very large multi-month
real datasets beyond the simulated scenarios.

## 6. What should not be trusted yet
Any figure OpsIQ did not receive from the owner. OpsIQ fabricates no money, profit, ROI, win-probability, or
owner-time-savings, and shows `NEEDS_DATA` / `DATA_INSUFFICIENT` honestly where inputs are missing.

## 7. What data must be supplied
Financial snapshots (revenue, costs, cash, and — critically — unit economics / cost-per-unit), operational
events (complaints/rework), proof submissions, and external opportunity/tender signals.

## 8. What external actions OpsIQ cannot take
It cannot submit a tender, contact a customer, spend money, sign a contract, certify eligibility/compliance,
or take any payroll/staff action. There is no task type or code path that performs these.

## 9. Whether public SaaS / Product Hunt remains frozen
YES — frozen. Also frozen: billing, launch readiness, integrations, Local Mode, pricing/plans, and
enterprise/compliance hardening.

## 10. Whether external opportunity/tender workflows are intake/prepare/validate only
YES — intake → screen → prepare (draft) → validate → record only. No submission, outreach, spend, or scale
without owner-approved passed validation.

## 11. Whether any module is accepted with restrictions
Yes: Cash/profit protection, External opportunity intelligence, and Browser E2E owner journeys are
`ACCEPTED_WITH_RESTRICTIONS` (data-dependence and critical-journey coverage). No module is unsafe.

## 12. What the owner must review daily/weekly
- **Daily:** the top process action and the top opportunity execution task (who must do what, and any owner-approval gate).
- **Weekly:** validation outcomes and portfolio decisions (what passed/failed and what may now scale), cash/profit protective actions, and any confirmed proof-risk findings.
