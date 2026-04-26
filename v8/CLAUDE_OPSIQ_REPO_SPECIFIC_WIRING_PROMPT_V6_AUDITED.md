You are wiring the OPSIQ V5 Enterprise Audited/V6 engine overlay into the current Next.js + TypeScript + Prisma repo.

Read first:
1. ARCHITECTURE_CONTRACT.md
2. docs/opsiq-v2/V5_ENTERPRISE_AUDIT_AND_V6_FIXES.md
3. docs/opsiq-v2/ENTERPRISE_PACK_ANALYSIS.md
4. package.json
5. tsconfig.json
6. prisma/schema.prisma
7. existing src/app/api route conventions
8. existing src/lib auth, db, validation, and error helpers

Hard rules:
- Do not redesign the engine layer unless a compile error proves a repo-specific mismatch.
- Do not overwrite existing production logic except the additive diagnosis-v2 route if it is being wired.
- Preserve existing app behavior.
- Keep the V2 engine additive and isolated under src/services/diagnosis-v2 plus enterprise support services.
- Prefer adapting the persistence adapter and route handler to the repo over changing engine contracts.
- Every high-impact recommendation must keep risk, policy, contingency, and explanation output.
- Every run must supply nowIso. If route callers omit nowIso, inject request-time UTC ISO once at the adapter boundary.
- Use existing Prisma model names/fields exactly. If model names differ from adapter assumptions, update only persistence-adapter.ts.
- If route helpers differ, update only route.ts imports and wrapper usage.

Validation sequence:
1. npm install if dependencies are missing.
2. npx prisma validate
3. npm run lint
4. npm run typecheck
5. npm test -- diagnosis-v2 OR npm test
6. npm run build

Required post-wiring proof:
- Show git diff --stat.
- Show files changed.
- Show validation command outputs.
- Confirm whether persistence is enabled or route is engine-only.
- Confirm that old diagnosis behavior still exists and this is additive.

Do not mark the work complete until build and tests pass or until every failing command is listed with exact file/line cause and exact next fix.
