# OPSIQ V7 Implementation Gates

## Gate 1 — Contract readiness
A module may be planned when its module directory, contract file, ports file, README, and implementation prompt exist.

## Gate 2 — Service readiness
A module may be called by other services only when its service implementation has deterministic unit tests and typed failure modes.

## Gate 3 — Persistence readiness
A module may write to the database only after Prisma schema review, migration review, tenant scoping, indexes, and rollback notes exist.

## Gate 4 — API readiness
A module may expose routes only after service tests, repository tests, API envelope usage, AppError usage, request context, auth/RBAC checks, and audit events are wired.

## Gate 5 — UI readiness
A module may expose pages/components only after loading, empty, stale-data, permission-denied, and error states exist.

## Gate 6 — Enterprise release readiness
A module may be treated as production-ready only after lint, typecheck, tests, build, Prisma validate, migration validation, and security/audit review pass.
