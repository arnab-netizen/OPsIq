# OPSIQ V2 Repo-Specific Engine Wire Pack V5

This pack is specific to the extracted `OPsIq-main.zip` structure: Next.js App Router, Prisma 7, Vitest, `@/*` alias, `src/services`, `src/domain`, and existing Engagement/Finding/Recommendation models.

It contains real TypeScript code, not empty scaffolding. It adds a separate `diagnosis-v2` engine layer and a guarded API route.

## Non-negotiable
Unzip into a branch only. Do not unzip directly into main without Git diff review.

## First command after unzip
```bash
node scripts/opsiq-v2-repo-check.mjs
npm test -- src/services/__tests__/diagnosis-v2.orchestrator.test.ts
npm run lint
npm run build
```

## What this pack does not do
It does not rewrite `schema.prisma`, `package.json`, or existing service files. Claude must wire and verify against the live repo before merge.
