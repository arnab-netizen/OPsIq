# OPSIQ repo-specific merge risk report — generated from uploaded archives

## Verified repo shape from extracted `OPsIq-main.zip`

- App: Next.js 16 App Router.
- Language: TypeScript.
- Package manager: npm with `package-lock.json`.
- Tests: Vitest.
- DB: Prisma 7 with generated client output at `src/generated/prisma` and PostgreSQL datasource.
- Import alias: `@/*`.
- Existing service layer: `src/services/*.ts`.
- Existing API route style: `src/app/api/.../route.ts` with `withRequestContext`, `withAuth`, `assertEngagementAccess`, `parseRequestBody`, `parseOrThrow`.
- Existing domain model is engagement/client/finding/recommendation/action/evidence/KPI/stage oriented, not tenant/business/diagnosis_run oriented.

## Actual engines/services already present in main

The main archive includes services for business condition, recommendation scoring/reranking, re-evaluation, shock detection/events, KPI, evidence, findings, actions, report generation, review cycles, intervention state, and governed stages. These are operational service modules, but they are not yet a complete independent multi-hypothesis diagnostic pipeline.

## Merge risks found from archive comparison

### Main vs integration branch

The integration archive differs from main in many core files: `package.json`, `package-lock.json`, `prisma/schema.prisma`, `src/lib/db.ts`, `src/infra/audit.ts`, idempotency, response formatting, many service files, UI test filenames, and API route tests. Directly copying integration over main is unsafe.

High-risk points:

1. `package.json` and lockfile differ. Do not overwrite blindly.
2. `prisma/schema.prisma` differs. Use Prisma migration diff/inspection, not copy-overwrite.
3. `src/lib/db.ts` differs. This can break Prisma 7 adapter initialization.
4. `src/ui/__tests__/phase9-operator-interface.test.ts` vs `.tsx` naming differs between branches.
5. Many service files differ, so branch merge should be performed by Git with conflict review, not by zip overlay.

### Main vs domain foundation branch

The domain foundation archive is older and lacks many modules already in main: actions, evidence, findings, KPIs, recommendations, shock events, intervention state, API hardening, UI modules, and migrations. Do not merge it onto main as a replacement. It should be treated as historical foundation only.

## Why this V4 pack avoids direct conflicts

This V4 pack adds new `diagnosis-v2` files instead of replacing current core services. It uses current repo conventions and current DB entities. It does not overwrite `package.json`, `schema.prisma`, existing services, or existing routes.

## Required validation after applying

Run:

```bash
node scripts/opsiq-v2-repo-check.mjs
npm test -- --run src/services/__tests__/diagnosis-v2.orchestrator.test.ts
npm run lint
npm run build
```

If build fails on `CAPABILITIES.CONDITION_ASSESS`, Claude must replace the route capability with the closest existing internal diagnostic/write capability after inspecting `src/domain/constants/capabilities.ts`.
