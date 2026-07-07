# OpsIQ — Restrictions & Boundaries

**Date:** 2026-07-07 · Truth-control audit (PASS 34).

The hard boundaries OpsIQ operates within today. These are not aspirations — they
are enforced in code and/or reflect the honest limits of current proof.

## Enforced-in-code boundaries
1. **No autonomous external action.** No customer contact, tender submission, spend, discount, pricing change, or contract. (`autonomy-policy`, `capability-registry`: `external_action_prohibited`.)
2. **No autonomous material decision.** Autonomy is capped at observe / advise / draft / act-with-owner-approval. Material actions require owner approval. (`approval-threshold-policy`, `material-gate-registry`.)
3. **No fabricated financials.** No money/ROI/runway/win-probability is invented; missing data becomes a governed data task. (`cash-profit-protection`, schema refinements.)
4. **No silent mutation of governed records.** Approved/issued/validated/locked records are not silently changed; mutations emit audit events.
5. **No staff discipline / payroll / HR automation.** Staff issues route to training/coaching only.
6. **No legal / regulatory / tax automation.** (`compliance-boundary`.)
7. **No scale-before-validation.** Growth/thrive gates stay blocked until stabilization is proven with evidence.
8. **No live LLM write-path.** Decisions are deterministic rule engines; the AI provider is inert (no importer, disabled without a key).

## Honest proof limits (not yet true, stated plainly)
9. **Not owner-visible.** 0 of 35 assessed capabilities are surfaced in a real UI an owner uses. OpsIQ is backend + CI today.
10. **No live deployment / no real owners.** No production owner is running a business on OpsIQ.
11. **No verified real-world outcomes.** All proof is synthetic/controlled fixtures. No money-saved / business-saved claim is supportable.
12. **No external integrations.** No accounting/POS/bank/CRM connectors are wired.
13. **Partial CI coverage.** 10 DB simulations exist on disk but are not in the required lane; 4 assessed modules are unit-test-only.

## Do-not-build (this program's standing scope bans)
Public SaaS, billing, launch-readiness marketing, live connectors, Local Mode,
enterprise/compliance hardening, autonomous browsing, autonomous external action,
LLM/NLP decisioning, private owner shadow pilot — none are in scope and none may
be claimed as present.
