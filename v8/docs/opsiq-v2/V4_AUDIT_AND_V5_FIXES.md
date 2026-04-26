# OPSIQ V4 Wire Pack Audit and V5 Fixes

## Verdict
V4 contained real executable TypeScript engine logic, not empty scaffolding. However, it was not enterprise-grade enough to rely on unchanged because several behaviours were too heuristic, not deterministic enough, and weakly persisted.

## Issues found in V4
1. `runDiagnosisV2` used `new Date()` directly, making tests/audit output non-deterministic.
2. Persistence threw generic `Error` for missing engagement, causing the API handler to emit 500 instead of 404.
3. Persistence could create duplicate V2 findings/recommendations on repeated calls.
4. Scenario engine approximated downside from profit only, not from revenue/cost components.
5. Risk engine used mostly fixed scores and did not consider validation issues, blocked recommendations, or financial severity.
6. Validation did not check service-line share totals, invalid service-line economics, zero customer count, or ambiguous customer definition strongly enough.
7. Test coverage only validated two paths.
8. V4 is an overlay layer, not a complete DB-backed engine migration. It still requires wiring into existing Prisma/API conventions.

## Fixes applied in V5
1. Added deterministic `nowIso` and `runId` support to inputs/results.
2. Added evidence sufficiency signal and stronger validation for service-line data.
3. Improved scenario calculations using revenue/cost metrics.
4. Improved risk scoring from recommendation category, priority, and validation state.
5. Added idempotent persistence behaviour using existing finding/recommendation lookup.
6. Changed missing engagement to `NotFoundError`.
7. Added more regression tests for deterministic output and scenario math.
8. Added audit metadata to the result shape.

## Still not complete without Claude wiring
This pack deliberately does not edit `package.json`, `schema.prisma`, or existing service files. Claude must wire the route, validate imports against the live repo, run `npm test`, and only then merge.
