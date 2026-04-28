# Claude implementation prompt — Pack 02: Config and Environment System

Implement this module only after reading:
1. `ARCHITECTURE_CONTRACT.md`
2. `docs/opsiq-v2/V7_MODULE_PRESENCE_MAP.md`
3. `src/modules/module-readiness/module-catalog.ts`
4. this module's `README.md`, contract, and ports files
5. current repo `package.json`, `tsconfig.json`, Prisma schema, and existing route/service conventions

Hard rules:
- Keep implementation additive unless a direct conflict is proven.
- Do not bypass tenant scoping, RBAC, audit, API envelope, request context, or AppError conventions.
- Do not create production routes until service logic and tests exist.
- If persistence is needed, update Prisma schema and add a migration in the repo's existing migration style.
- Add unit tests first for pure logic and integration tests where persistence is added.
- Preserve the V6 diagnosis backbone behavior unless this module explicitly extends it.
- Finish with `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, and `npx prisma validate` where those scripts exist.

Module objective:
Validated environment, feature flags, staged rollout settings.

Required dependencies:
foundation.

Deliver a file-by-file summary, tests run, migrations created, and remaining operational risks.


## Implementation plan to obey
Before changing code, open `config-env.implementation-plan.ts` and implement only the next incomplete phase. Do not skip schema, repository, service, RBAC, audit, tests, or feature-flag gates.
