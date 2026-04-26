You are wiring the OPSIQ V5 Enterprise diagnosis pack into the current Next.js + Prisma + Vitest repo.

Read first:
1. ARCHITECTURE_CONTRACT.md
2. docs/opsiq-v2/V4_AUDIT_AND_V5_FIXES.md
3. docs/opsiq-v2/ENTERPRISE_PACK_ANALYSIS.md
4. CLAUDE_OPSIQ_REPO_SPECIFIC_WIRING_PROMPT_V5.md
5. package.json
6. tsconfig.json
7. prisma/schema.prisma
8. existing src/app/api route patterns
9. existing src/lib validation/auth/API helpers

Strict rules:
- Do not redesign the app.
- Do not overwrite existing working diagnosis code unless replacing it with an additive call path.
- Keep route handlers thin.
- Prefer existing repo helpers over newly introduced helpers when equivalent helpers already exist.
- If repo already has AppError, api envelope, logger, or audit builder, merge the concepts instead of duplicating names.
- Wire `runEnterpriseDiagnosisV2` as the diagnosis-v2 service entrypoint.
- Preserve the existing `persistDiagnosisV2AsExistingEntities` behavior unless you prove it causes duplicate writes.
- Do not create a Prisma migration unless you prove the current schema cannot support the outputs.
- Do not install new dependencies unless the repo does not already have Zod/Vitest and the code requires them.
- Make all imports match the repo's alias convention.

Required implementation steps:
1. Copy the pack into repo root.
2. Inspect existing files for name collisions.
3. Move/merge `src/lib/errors/app-error.ts`, `src/lib/api/response.ts`, `src/lib/request/request-context.ts`, and `src/lib/logging/logger.ts` only if the repo lacks equivalent utilities.
4. Keep all new enterprise engines under their supplied `src/services/*` paths unless repo conventions require `src/modules/*`.
5. Update `src/services/diagnosis-v2/index.ts` to export enterprise orchestrator.
6. Update the diagnosis-v2 route to call `runEnterpriseDiagnosisV2`.
7. Ensure response status remains 202 when `needsInput` is true and 200 when complete.
8. Run formatting.
9. Run typecheck, lint, tests, and build.
10. Fix compile/runtime errors with minimal changes only.
11. Produce final summary: changed files, tests run, migrations created or not, remaining risks.

Validation commands:
- npm run lint
- npm run typecheck
- npm test
- npm run build
- npx prisma validate

Do not mark the task complete if any command fails.
