You are wiring OPSIQ V7 module-presence pack into the current Next.js + Prisma repo.

First read:
1. ARCHITECTURE_CONTRACT.md
2. docs/opsiq-v2/V7_MODULE_PRESENCE_MAP.md
3. docs/opsiq-v2/V7_IMPLEMENTATION_GATES.md
4. src/modules/module-readiness/module-catalog.ts
5. src/modules/module-readiness/module-gate.ts
6. package.json, tsconfig.json, prisma/schema.prisma, and existing app/api routes

Objective:
- Add all 45 OPSIQ modules as explicit enterprise module contracts and implementation-ready folders.
- Do not pretend planned modules are implemented runtime functionality.
- Preserve V6 diagnosis engine behavior.
- Make the module catalog compile and be available for implementation planning.

Hard rules:
- Do not delete existing repo files.
- Do not expose planned modules as production routes.
- Do not add Prisma migrations for planned modules until the actual implementation PR requires persistence.
- Do not add package dependencies unless strictly necessary.
- Adapt import paths to the repo's actual TypeScript alias strategy.
- Run validation using the repo scripts: lint, typecheck, test, build, and prisma validate where available.

After wiring, produce:
1. Module count confirmation: exactly 45 module directories plus module-readiness.
2. Confirmation that V6 implemented runtime files are unchanged unless import path adaptation was required.
3. List of planned modules that must remain behind feature flags or not called by runtime.
4. Test results and build results.
5. Exact next module recommended for implementation.
