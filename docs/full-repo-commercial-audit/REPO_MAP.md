# OpsIQ / Rebilix — Full-Repo Map (Commercial Reliability Hostile Audit)

Generated as the opening artifact of the full-repo commercial-credibility hostile audit.

- Base branch: `main` @ `1ef21e2` (feat(owner-cheatcode): Owner Mode wealth loop — engines, services, API, real-world proof (#107))
- Audit branch: `claude/full-repo-commercial-reliability-hostile-audit-6esgeo`
- Node: v22.22.2, npm 10.9.7, package manager: npm (package-lock.json)
- DB/test env: local PostgreSQL 16 started for DB-backed suite (`opsiq_test`); a live Neon DB is also configured in the container env (DATABASE_URL/DIRECT/MIGRATION) — **not used for tests** to avoid mutating it.

## Scale
| Surface | Count |
|---|---|
| API routes (`src/app/api/**/route.ts`) | 317 |
| App pages (`src/app/**/page.tsx`) | 64 |
| Services (`src/services/*`) | 157 |
| Domain modules (`src/domain/*`) | 71 |
| Engines (`src/engines/*`) | 4 core + many per-domain engines under services |
| Prisma models | 168 |
| Prisma migrations | 100 |
| Test files (`*.test.ts(x)`) | ~910 (23 quarantined, 91 in `__ignored_tests__`) |
| CI workflows | ~75 |

## Top-level product surfaces
- **Auth / onboarding**: `src/app/signup`, `src/app/login`, `src/app/onboarding`, `src/app/quick-start`, `src/app/(authenticated)/owner/onboarding`, `src/services/auth`, `src/auth-guard.ts`.
- **Diagnosis**: `src/app/api/diagnosis`, `src/engines/DiagnosisOrchestrator.ts`, `src/services/diagnostic-core`, `src/domain/diagnostic`.
- **Decisions / operator items**: `src/app/api/decisions`, `src/app/api/decision`, `src/services/decision-validation`.
- **Owner Mode / wealth loop / startup**: `src/services/owner-mode/*`, `src/app/api/owner`, `src/app/api/startup`, `tests/owner-mode/**`, `docs/owner-cheatcode/*`.
- **Engagements / findings / recommendations / actions**: `src/services/engagement.ts`, `src/app/api/engagements`, `src/app/api/findings`, `src/app/api/recommendations`, `src/app/api/actions`.
- **Proof / evidence**: `src/app/api/proof`, `src/app/api/evidence`, `src/app/api/evidence-bundles`, `src/domain/evidence`, asymmetric-signature migration `20260428_add_asymmetric_signature`.
- **Finance / capital guardrails**: `src/domain/finance`, `src/engines/FinancialEngine.ts`, `src/app/api/growth`.
- **Governed re-evaluation**: BusinessConditionProfile, InterventionState/Mode/Phase models; `src/services/business-condition`.
- **Learning / outcomes**: `src/services/controlled-learning-*.service.ts`, `src/domain/outcome`, `src/domain/collective-training`.
- **Billing / entitlement** (present, not in Owner-Mode audit scope): `src/app/api/billing`, `src/app/api/entitlement`.

## Core infrastructure (controls)
- **DB client / tenancy**: `src/lib/db.ts` (singleton Prisma client via `@prisma/adapter-pg`), `src/lib/prisma-workspace-enforcement.ts` (fail-closed workspace-isolation middleware on reads + writes for 40+ workspace-owned models).
- **Route enforcement**: `src/lib/canonical-route-enforcement.ts` (`withCanonicalEnforcement`), `src/lib/enforced-route.ts`, `src/auth-guard.ts` (`withAuth`), `src/capability-check.ts`, `src/middleware/workspace-enforcement.ts`.
- **Audit**: `src/audit.ts`, `src/services/audit/*`, `src/services/audit-event-hash-chain-validator.ts`.
- **Idempotency / concurrency**: `src/idempotency.ts`, `src/idempotency-middleware.ts`, `src/optimistic-lock.ts`, `src/state-transition.ts`.
- **Validation**: `src/validation.ts`, `src/validation/*`, Zod (`src/lib/validation.ts`).
- **Error governance**: `src/lib/operator-error-governance.ts`, `toOperatorSafeError`.

## Governance / CI gates (verified on this branch)
- `governance:scan:auth` — ✅ all routes comply (auth wrapper coverage).
- `governance:scan:strict` — ✅ 0 NEW (32 frozen baseline error-governance findings remain).
- `audit:wrapped-handlers:ratchet` — ✅ 29 baseline unwrapped handlers (frozen, no new).
- `tsc --noEmit` — ✅ clean.
- `ci.yml` runs: governance (auth+strict), tsc, prisma validate/migrate, build, wrapped-handler ratchet, full vitest suite with DB (quarantine excluded), lint ratchet. Runs on push to `main`/`claude/**` and PRs to `main`.

## Known debt signals (entering the audit)
- 23 quarantined test files (`.claude/test-quarantine.json`) — incl. some `security/*` and `phase-i10-enforcement-scanner` suites.
- 91 files under `src/__ignored_tests__/` excluded from all runs.
- 29 unwrapped API handlers (ratchet baseline).
- 32 frozen error-governance findings (raw `error.message` exposure; 1 unsafe error render in signup).
- ~75 CI workflows, many triggered only on stale feature branches / workflow_dispatch (coverage-reachability to be assessed).

See `FULL_REPO_GAP_REGISTER.md` for findings and status.
