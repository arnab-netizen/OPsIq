# OPSIQ V5 Enterprise Audit and V6 Corrections

## Audit verdict
The prior V5 enterprise pack contained real executable TypeScript, but it was not strong enough to call enterprise-grade without qualification. Several files were too thin, risk scoring was still shallow, the route schema did not cover the full V2 input contract, the test suite contained an invalid trigger action expectation, and some runtime IDs used non-deterministic fallback logic.

## Corrections made in this audited V6 pack

1. Expanded `src/domain/diagnosis-v2/types.ts` into a fuller contract covering deterministic timestamps, evidence references, service-line inputs, all major business signal inputs, recommendation keys, policy decisions, scenario cases, and persisted diagnosis records.
2. Replaced thin normalization logic with full fact normalization covering finance, customers, orders, demand, retention, complaints, staff, service lines, evidence labels, and additional inputs.
3. Rebuilt validation with explicit missing-data, invalid-value, contradiction, anomaly, and ambiguous-definition checks.
4. Rebuilt metrics with operating profit, margin, cost/revenue, cash gap, runway before/after revenue, payables/cash, revenue/customer, average order value, orders/customer, gross margin, repeat share, conversion, complaints, and revenue/staff.
5. Rebuilt domain scoring across liquidity, profitability, revenue quality, demand generation, retention, operations, people capacity, controls/reporting, and strategy resilience.
6. Rebuilt hypotheses to avoid primary-issue anchoring and generate competing root-cause candidates.
7. Rebuilt recommendations with stable `recommendationKey`, linked hypotheses, expected upside, downside risk, preconditions, and bounded actionability.
8. Rebuilt risk engine using likelihood, impact, detectability, reversibility, velocity, residual score, and governance classification.
9. Rebuilt contingencies and policy decisions around the recommendation key rather than fragile title matching.
10. Rebuilt scenarios using revenue, costs, cash runway, cash burn, and robustness ranking.
11. Rebuilt action plan logic with stable action keys, dependencies, owner role routing, priority sorting, and blocked-status handling.
12. Rebuilt variable registry and trigger engine using thresholds and domain mappings.
13. Rebuilt audit event builder to remove Math.random fallback and make event IDs stable from canonical event content.
14. Fixed enterprise test expectation from non-existent `ask_for_input` to valid `block_until_review`.
15. Ran a TypeScript transpilation syntax check across service/domain/lib files; no syntax diagnostics were found for the checked files.

## Remaining integration risks

These are repo-wiring risks, not code-completeness gaps:

- `persistence-adapter.ts` depends on existing repo symbols: `@/infra/errors`, `@/lib/db`, and Prisma models such as `engagement`, `finding`, and `recommendation`.
- The route handler depends on existing repo helpers: `withRequestContext`, `withAuth`, `assertEngagementAccess`, `parseRequestBody`, `parseOrThrow`, `uuidSchema`, and `CAPABILITIES`.
- If the repo uses different helper names or Prisma model fields, Claude must adapt the adapter and route only; the engine layer is intentionally isolated and should not need redesign.

## Enterprise-grade definition used here

Enterprise-grade for this overlay means:

- deterministic engine core when `nowIso` is supplied;
- typed input/output contracts;
- fail-closed validation;
- evidence sufficiency scoring;
- multi-domain scoring;
- competing hypotheses;
- recommendation preconditions;
- risk classification;
- policy gating;
- contingency planning;
- scenario analysis;
- action sequencing;
- audit-event generation;
- explicit integration risks.

It does not mean the full SaaS platform is complete. Auth, RBAC, database migrations, dashboards, background jobs, document OCR, connectors, admin UI, and CI still need their own packs or repo-native wiring.
