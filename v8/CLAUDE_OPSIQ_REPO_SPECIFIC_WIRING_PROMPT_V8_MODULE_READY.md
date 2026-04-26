# Claude Code Prompt — OPSIQ V8 Module Readiness Pack

You are integrating the OPSIQ V8 module readiness pack into the repo.

Read first, in this exact order:
1. `ARCHITECTURE_CONTRACT.md`
2. `docs/opsiq-v2/V7_AUDIT_AND_V8_CORRECTIONS.md`
3. `docs/opsiq-v2/V7_MODULE_PRESENCE_MAP.md`
4. `src/modules/module-readiness/module-catalog.ts`
5. `src/modules/module-readiness/module-implementation-plans.ts`
6. The target module `README.md`
7. The target module `*.implementation-plan.ts`
8. The target module `*.contract.ts`
9. The target module `*.ports.ts`
10. The target module `IMPLEMENTATION_PROMPT.md`

Hard rules:
- Do not treat module presence as runtime completion.
- Implement only one module or one dependency layer at a time unless instructed otherwise.
- Do not expose production routes for planned modules until service, repository, validation, RBAC, audit, tests, and feature flags are complete.
- Preserve the V6 diagnosis backbone unless a direct failing test proves a change is required.
- Use existing repo conventions for Next.js route handlers, Prisma, tests, and import paths.
- Add or update Prisma migrations only after explicit schema impact is confirmed.
- For each module, implement phases in this order: schema, repository, service, routes, UI, tests, production enablement.
- Finish every module with lint, typecheck, tests, build, and Prisma validation where scripts exist.

Deliver after each module:
- files changed
- contracts implemented
- migrations added or not added
- feature flags used
- permissions added
- tests added and commands run
- residual risks
