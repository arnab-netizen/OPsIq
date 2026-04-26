You are wiring OPSIQ diagnosis-v2 into the existing Next.js/Prisma/Vitest repo. Do not rewrite unrelated modules. Work on a new branch.

1. Inspect repo instructions first: read `CLAUDE.md`, `AGENTS.md`, `README.md`, `package.json`, `tsconfig.json`, `vitest.config.ts`, `prisma/schema.prisma`, `src/lib/api-handler.ts`, `src/lib/auth-guard.ts`, `src/lib/validation.ts`, and `src/lib/visibility.ts`.
2. Run `node scripts/opsiq-v2-repo-check.mjs`. Fix only objective import/path mismatches.
3. Verify files added under `src/domain/diagnosis-v2`, `src/services/diagnosis-v2`, `src/services/__tests__/diagnosis-v2.orchestrator.test.ts`, and `src/app/api/engagements/[engagementId]/diagnosis-v2/route.ts`.
4. Do not modify `package.json`, `package-lock.json`, or `prisma/schema.prisma` unless a failing command proves it is necessary. If modification is necessary, explain the exact failing error first.
5. Run targeted test: `npm test -- src/services/__tests__/diagnosis-v2.orchestrator.test.ts`.
6. Run full verification: `npm test`, `npm run lint`, `npm run build`.
7. Inspect `git diff --stat` and `git diff -- src/domain/diagnosis-v2 src/services/diagnosis-v2 src/services/__tests__/diagnosis-v2.orchestrator.test.ts src/app/api/engagements/[engagementId]/diagnosis-v2/route.ts`.
8. Confirm the route returns 202 for blocking evidence gaps and 200 for completed diagnosis.
9. Confirm persist=false is default and no DB writes occur unless `persist: true` is supplied.
10. Confirm persist=true is idempotent enough for repeated V2 calls: existing V2 finding/recommendation titles should be reused/skipped, not blindly duplicated.
11. Do not merge integration-mainline archive by copying over main. The integration archive touches core files and must be merged with Git conflict review.
12. Final answer must include exact command outputs, changed files, and remaining risks.
