# PHASE 1 SLICE A — DB PROOF RESTORATION + ONE REAL COLLECTIVE RUNTIME READ PATH

**Classification: PHASE_1_SLICE_A_COMPLETE**

Branch: `claude/phase-1-slice-a-db-proof-runtime-read` (cut from clean main `fab9ecff`)
Scope: smallest safe remediation slice proving a DB-backed, workspace-scoped,
Owner-Mode runtime READ path from an existing governed capability into a real
owner-facing API route + service. No new architecture, no duplicate engine, no
broadening.

---

## A. Objective met

Proved end-to-end:

1. **Real DB-backed test lane runs against PostgreSQL.** Local PostgreSQL 16
   cluster, database `opsiq_dev`, all **77 migrations applied**, `prisma validate`
   passes, `[db]`-gated tests execute real reads/writes (no SQLite, no mock as
   proof).
2. **An existing governed capability is reachable through a runtime read path.**
   The existing collective command-and-control engine `runCollective`
   (`src/domain/collective-training/collective-engine.ts`) — previously pure
   logic with no runtime entry — is now reachable from a real owner API route
   via a service that reads persisted data.
3. **Workspace-scoped.** The read filters the persisted
   `BusinessConditionProfile` by its `workspaceId` column; cross-workspace and
   foreign-engagement reads return the empty state (proven by DB tests).
4. **Auth + Owner-Mode gated per existing patterns.** The route uses
   `withCanonicalEnforcement({ requireWorkspace: true, requireCapabilities:
   [CAPABILITIES.OWNER_VIEW] })`. The workspace id is server-derived from
   membership; it is never trusted from request input.
5. **No mocked data as proof.** Every runtime assertion runs against rows
   persisted in PostgreSQL.
6. **No duplicate engine.** The slice maps persisted dimensions into the existing
   `DomainSignalInput[]` vocabulary and calls the existing engine. No scoring,
   vetoes, confidence, ranking, or sequencing is re-derived.

---

## B. The single runtime path wired

```
GET /api/owner/collective-decision?engagementId=...
  → withCanonicalEnforcement (auth + workspace + OWNER_VIEW)
  → getOwnerCommandCenter(verifiedWorkspaceId, engagementId?)        [service]
      → db.businessConditionProfile.findFirst({ workspaceId, isCurrent:true })   [DB read]
      → map persisted dimension levels → DomainSignalInput[]         [pure mapping]
      → runCollective(input)                                         [EXISTING engine]
      → CollectiveDecisionPacket (+ hasData / sourceProfileId / dataConfidence)
```

Dimension → domain mapping (9 dimensions, cross-domain):

| Persisted dimension          | Domain signal        | Direction        |
|------------------------------|----------------------|------------------|
| cashPressureLevel            | cash-survival        | higher = worse   |
| marginPressureLevel          | profit-improvement   | higher = worse   |
| ownerDependencyRisk          | owner-workload       | higher = worse   |
| keyPersonDependencyRisk      | staff-workload       | higher = worse   |
| clientConcentrationRisk      | retention            | higher = worse   |
| executionCapacityLevel       | capacity             | lower = worse    |
| processMaturityLevel         | sop-process          | lower = worse    |
| managementMaturityLevel      | quality              | lower = worse    |
| growthReadinessLevel         | growth-readiness     | lower = worse    |

---

## C. Files

**Created**
- `src/services/owner-collective/collective-decision.service.ts` — DB read +
  mapping + `runCollective` call + explicit empty/needs-data state.
- `src/app/api/owner/collective-decision/route.ts` — canonically enforced
  OWNER_VIEW GET route (workspace-scoped).
- `src/__tests__/services/owner-collective/collective-decision.service.db.test.ts`
  — `[db]` runtime proof (success, isolation, empty state, not-current, degraded,
  engagement scoping).
- `src/__tests__/owner-collective/routes.test.ts` — route enforcement wiring proof
  + `[db]` fail-closed runtime invocation.
- `audit/PHASE_1_SLICE_A_DB_PROOF_RUNTIME_READ_REPORT.md` — this report.

**Changed**: none (no existing source modified).
**Schema changes**: none (reuses existing `BusinessConditionProfile` model).

> A pre-existing `/api/owner/command-center` route already wired the
> owner-condition rollup (`getBusinessCondition`). To avoid collision and any
> appearance of duplicating it, the collective path uses a distinct route
> (`/api/owner/collective-decision`) and a distinct service folder
> (`owner-collective`).

---

## D. Tests (proof)

`collective-decision.service.db.test.ts` (`[db]`, PostgreSQL-backed):
- **Runtime success** — seeds clientAccount → workspace → engagement →
  `BusinessConditionProfile`, asserts a real `CollectiveDecisionPacket` with all
  governed fields populated, cash-survival top-ranked, `unsafeEmitted == []`.
- **Workspace isolation** — a non-seeded workspace reads nothing (empty state).
- **Two-workspace no-leak** — A and B each see only their own profile.
- **Empty state** — empty workspace → `hasData:false`, `missingCriticalData`
  includes `business_condition_profile`.
- **Not-current guard** — `isCurrent:false` profile is not read.
- **Degraded / failure** — persisted row with unrecognized levels → no packet,
  `dataConfidence:LOW`, gaps surfaced (no false confidence).
- **Engagement scoping** — matched engagement returns the packet; foreign
  engagement id returns empty state.

`routes.test.ts`:
- Static wiring proof: `withCanonicalEnforcement` + `requireWorkspace:true` +
  `OWNER_VIEW`; reads only `ctx.verifiedWorkspaceId`; no foreign-domain imports;
  no business logic / db / engine call in the route file.
- `[db]` fail-closed: the REAL wrapped `GET`, invoked with no session, returns a
  non-200 response and leaks no `packet`/`hasData` — the handler never executes
  without a verified Owner-Mode session.

---

## E. Verification command output

```
$ git status --short
?? src/__tests__/owner-collective/
?? src/__tests__/services/owner-collective/
?? src/app/api/owner/collective-decision/
?? src/services/owner-collective/

$ npx prisma validate
The schema at prisma/schema.prisma is valid 🚀

$ npx prisma migrate status
77 migrations found in prisma/migrations
Database schema is up to date!

$ npx tsc --noEmit
(exit 0 — no errors)

# Targeted runtime + route proof (TEST_WITH_DB=true)
$ npx vitest run .../collective-decision.service.db.test.ts .../owner-collective/routes.test.ts
Test Files  2 passed (2)
     Tests  12 passed (12)

# Full [db] lane (npm run test:db)
Test Files  1 failed | 33 passed | 571 skipped (605)
     Tests  149 passed | 12375 skipped (12524)

$ npm run build
BUILD EXIT: 0
ƒ /api/owner/collective-decision        (dynamic route present in build output)
```

> NOTE: there is no `typecheck` npm script in this repo; `npx tsc --noEmit` is the
> equivalent and passes cleanly.
>
> The one failing file in the `[db]` lane is **`src/__tests__/first-value.test.ts`**,
> a pre-existing, unrelated test that mocks `@/lib/db` without exporting
> `getDbInstance`, breaking the global setup import. It fails **identically in
> isolation on this branch and is not touched by this slice** (all 11 of its own
> tests are skipped). Every test added by this slice passes.
>
> Local PostgreSQL was used because the container's configured Neon URLs are
> unreachable (P1001) — the DB-proof gap recorded in the full-repo audit. DB proof
> here is genuine PostgreSQL, not SQLite.

---

## F. Acceptance criteria checklist

- [x] Real DB-backed test lane runs (PostgreSQL, 77 migrations, `prisma validate`).
- [x] ≥1 existing collective capability reachable via runtime read path
      (`runCollective`).
- [x] Workspace-scoped (direct `workspaceId` filter; isolation test passes).
- [x] Auth + Owner-Mode gated (`withCanonicalEnforcement` + OWNER_VIEW + workspace).
- [x] No mocked data as proof (all assertions on persisted rows).
- [x] No duplicate engine (maps into existing vocabulary, calls existing engine).
- [x] Returns owner-usable info (governed `CollectiveDecisionPacket`).
- [x] Tests prove success / unauthorized / isolation / empty / failure.
- [x] DB proof documented with exact command output.

---

## G. Known limitations

- The fully-authenticated **HTTP** request path is not exercised end-to-end in
  vitest (Next.js `cookies()` requires a request scope; the repo's real-route
  invocation tests are `.skip`ped for the same reason). It is proven by: the
  static enforcement wiring, the fail-closed real-handler invocation, and the
  DB-backed service runtime. Live authenticated behavior is a deploy-time proof.
- DB proof is local PostgreSQL because the configured Neon endpoint is
  unreachable from this container; restoring a reachable managed Postgres in
  CI/deploy remains a separate infra task.
- This slice wires the **collective** engine only. The domain-training and
  remote-operations layers remain pure-logic and runtime-unwired (out of scope).

---

## H. Manual verification steps

```bash
# 1. Start local PostgreSQL 16 and point env at it
pg_ctlcluster 16 main start
export DATABASE_URL="postgresql://user:password@localhost:5432/opsiq_dev?schema=public"
export DIRECT_DATABASE_URL="$DATABASE_URL"
export MIGRATION_DATABASE_URL="$DATABASE_URL"

# 2. Prove schema + migrations
npx prisma validate
npx prisma migrate status        # "Database schema is up to date!"

# 3. Prove the runtime read path (DB-backed)
TEST_WITH_DB=true npx vitest run \
  src/__tests__/services/owner-collective/collective-decision.service.db.test.ts \
  src/__tests__/owner-collective/routes.test.ts

# 4. Typecheck + build
npx tsc --noEmit
npm run build
```

---

## I. Trigger map

This is a read path; it triggers no governed re-evaluation/mutation. It surfaces
the existing collective re-evaluation output (stage, binding constraint, vetoes,
priorities, next action) computed by `runCollective` from the current persisted
condition. Confidence degrades to LOW and the packet is withheld when persisted
dimensions are unrecognized (fail-safe, no false confidence).

## J. Failure modes covered

- No current profile → explicit empty state, no engine call.
- Profile present but all dimensions unrecognized → no packet, LOW confidence,
  gaps listed.
- `isCurrent:false` profile → not read.
- Cross-workspace / foreign-engagement read → empty state (no leak).
- Unauthenticated request → fails closed (non-200, no data).

## K. Events emitted

None. This is a pure read path and intentionally performs no mutation, so it
emits no audit events (consistent with existing owner read services such as
`getSalesDashboard` / `getBusinessCondition`).

## L. Automated tests added

- 7 `[db]` service runtime tests (success, isolation, two-workspace no-leak,
  empty, not-current, degraded, engagement scoping).
- 4 static route-enforcement assertions + 1 `[db]` fail-closed handler invocation.

---

## Recommendation

- **Safe to push** to `claude/phase-1-slice-a-db-proof-runtime-read`.
- **Do NOT** claim Owner Mode runtime-complete: this proves ONE read path. The
  domain-training and remote-operations layers remain runtime-unwired.
- Recommended next slice: wire a second runtime path (a remote-operations read,
  e.g. reliability/proof status) through the same canonical pattern, then a
  write/mutation path with audit-event emission and adaptive re-evaluation.
