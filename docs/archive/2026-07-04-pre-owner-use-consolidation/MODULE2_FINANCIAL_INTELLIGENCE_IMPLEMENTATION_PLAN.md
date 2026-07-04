# Module 2 — Financial Intelligence — IMPLEMENTATION PLAN

Status: **PLANNED (NOT STARTED)**. This is the slice contract Claude executes later
under per-slice authorization. No code/schema/API/UI/migration is created here.
Principles enforced throughout: generic for any owner-operated business (Tumbledry =
validation example only); deterministic core (no LLM for calculations); every
recommendation traceable; missing data marked missing (never invented); risk &
opportunity scoring explainable; recommendations create verifiable actions;
before/after verification honest; Module 2 produces a **prioritized next financial
action**, not just charts; Module 2 must be able to feed the future global owner
priority queue. Each slice ends green on the §3 universal gates before the next.

Build order follows execution.md §23 (SPEC→SCHEMA→DOMAIN→API→UI→TESTS→AUDIT→RUNTIME→
DASHBOARD→REPORT), re-expressed as safe slices. Backbone-first: deterministic domain
logic and Spine contracts precede any schema/migration; schema precedes API; API
precedes UI; integration + runtime proof last.

Legend per slice: **Purpose · Files likely affected · Implement · Do NOT touch ·
Tests · Verification · Done when · Rollback/stop · Can start before prior slice
proven?**

---

## Slice 0 — Spec & schema audit (no code)
- **Purpose:** Confirm data model decisions before any schema: extend Module 1
  snapshot vs new `FinancialSnapshot`; reuse recovery action/verification via a
  `domain` discriminator vs finance-specific link; where the Business Condition
  Profile lives.
- **Files:** `MODULE2_FINANCIAL_INTELLIGENCE_SPEC.md` (refine), a short
  `MODULE2_SCHEMA_DECISION_NOTE.md`.
- **Implement:** decisions + chosen Prisma model sketch (documented, not applied).
- **Do NOT touch:** `prisma/schema.prisma`, any `src/**`.
- **Tests:** none (doc).
- **Verification:** `git diff --check`.
- **Done when:** schema decision recorded; reviewer can build Slice 1 without guessing.
- **Rollback/stop:** if reuse-vs-new is ambiguous, stop and ask before Slice 5.
- **Before prior proven?** N/A (first slice).

## Slice 1 — Owner Intelligence Spine contracts (types only)
- **Purpose:** Define the shared, deterministic TS contracts Module 2 (and later
  modules) emit into — no persistence yet.
- **Files:** `src/domain/owner-spine/contracts.ts` (new), unit test file.
- **Implement (types + pure helpers only):** `OwnerFinding` (extends Module 1
  `Finding` shape + `domain`, `findingType: "risk"|"opportunity"`); `OwnerAction`
  (existing action shape + `domain`, prioritization fields `impact`, `confidence`,
  `urgency`, `effort`); `DomainScore { domain, riskScore, opportunityScore,
  healthScore, confidence, evidence }`; `BusinessConditionProfile` shape (rollup of
  `DomainScore[]` → condition `SURVIVAL|FRAGILE|STABILIZING|GROWING`); a pure
  `priorityValue(action)` helper (impact×confidence×urgency÷effort, survival-weighted)
  — used later by the global queue.
- **Do NOT touch:** Module 1 runtime code (only *reference* its `Finding`/`Severity`
  types); no schema; no API.
- **Tests:** `priorityValue` determinism + ordering; type-conformance fixtures.
- **Verification:** lint:ratchet, build, `vitest src/__tests__/owner-spine/`.
- **Done when:** contracts compile, helpers deterministic + tested; Module 1 green.
- **Rollback/stop:** if contracts would force changes to Module 1 behavior, stop.
- **Before prior proven?** No — needs Slice 0 decisions.

## Slice 2 — Deterministic finance calculation engine (pure)
- **Purpose:** All §4 derived metrics as pure functions.
- **Files:** `src/domain/owner-finance/{types,metrics,thresholds,data-confidence}.ts`
  + unit tests.
- **Implement:** `FinancialSnapshotInput`/`FinancialDerivedMetrics` types; metric
  calculators (`null` when not computable; currency preserved); `dataConfidenceScore`;
  industry-template threshold map + generic fallback (config, not hardcoded business).
- **Do NOT touch:** DB, API, UI, Module 1.
- **Tests:** Test Matrix §1, §13 (calculations + confidence/missing-data), plus
  service-vs-inventory / B2B-vs-B2C relevance (§12 unit portion).
- **Verification:** lint:ratchet, build, `vitest src/__tests__/owner-finance/`.
- **Done when:** all metric unit tests green; no DB dependency.
- **Rollback/stop:** revert the new domain dir; nothing else affected.
- **Before prior proven?** No — depends on Slice 1 score contracts.

## Slice 3 — Financial risk/opportunity detector (pure)
- **Purpose:** Turn metrics into `OwnerFinding[]` (risks + opportunities) with
  severity/confidence/evidence/source+verification metric.
- **Files:** `src/domain/owner-finance/{risk-rules,opportunity-rules,diagnosis}.ts`
  + tests.
- **Implement:** §5/§6 rules using template thresholds; finding builder; a finance
  `DomainScore` producer (health/risk/opportunity 0–100, explainable).
- **Do NOT touch:** DB/API/UI/Module 1.
- **Tests:** Test Matrix §2, §3, §14 (anti-hallucination), boundary thresholds.
- **Verification:** lint:ratchet, build, owner-finance vitest.
- **Done when:** rule tests green; every finding fully traceable; insufficient-data
  emits no fabricated finding.
- **Rollback/stop:** revert files.
- **Before prior proven?** No — depends on Slice 2.

## Slice 4 — Financial recommendation/action planner (pure)
- **Purpose:** Map findings → traceable recommendations → `OwnerAction[]` with
  prioritization fields.
- **Files:** `src/domain/owner-finance/{recommendations,actions}.ts` + tests.
- **Implement:** recommendation builder (all §7 mandatory fields); action builder
  (initial `proposed`, `metricToMove`, `verificationMethod`, impact/confidence/
  urgency/effort).
- **Do NOT touch:** DB/API/UI/Module 1.
- **Tests:** Test Matrix §4, §5 (+ negative tests for missing traceability fields).
- **Verification:** lint:ratchet, build, owner-finance vitest.
- **Done when:** every recommendation traceable; every action has a parent finding.
- **Rollback/stop:** revert files.
- **Before prior proven?** No — depends on Slice 3.

## Slice 5 — Persistence schema & migration (manual, fail-closed)
- **Purpose:** Persist finance snapshot/diagnosis/findings; wire finance actions +
  verification into the existing owner action loop per Slice 0 decision.
- **Files:** `prisma/schema.prisma` (additive models), new migration dir, services
  `src/services/owner-finance/*`, persistence tests.
- **Implement:** additive Prisma models (id, workspaceId, businessId, createdAt,
  updatedAt, status/version, audit fields); services calling the calc/detector/planner;
  **no destructive changes**; migration applied **only** via a manual fail-closed
  workflow (reuse the Module 1 migration workflow pattern: confirm phrase,
  `MIGRATION_DATABASE_URL` direct URL, remove local `.env*`, `migrate deploy`, strict
  post-status).
- **Do NOT touch:** Module 1 tables destructively; existing migrations; `.env*`.
- **Tests:** Test Matrix §10 persistence; `npx prisma validate`; `prisma migrate
  status`. Do NOT run `migrate deploy` locally against real DB.
- **Verification:** lint:ratchet, build, prisma validate, owner-finance + founder-
  recovery vitest, full `npm test`.
- **Done when:** schema valid; services persist/read back; Module 1 migrations intact.
- **Rollback/stop:** additive-only ⇒ revert models/migration dir; if a generalization
  of the recovery action table is required and risky, STOP and request authorization.
- **Before prior proven?** No — needs Slices 2–4 proven (pure logic correct before
  persisting it).

## Slice 6 — API routes
- **Purpose:** Expose finance via canonical enforced routes.
- **Files:** `src/app/api/owner/finance/*` (snapshot, metrics, risks, actions,
  dashboard) + route tests.
- **Implement:** `withCanonicalEnforcement` (`OWNER_VIEW`/`OWNER_MANAGE`,
  `requireWorkspace`), Zod validation, canonical JSON, safe errors.
- **Do NOT touch:** Module 1 routes; auth internals.
- **Tests:** Test Matrix §7, §8, §9.
- **Verification:** lint:ratchet, build, vitest (owner-finance + security), full test.
- **Done when:** route+authz+isolation tests green.
- **Rollback/stop:** revert route dir.
- **Before prior proven?** No — needs Slice 5.

## Slice 7 — Dashboard / UI
- **Purpose:** `/owner/finance` reading persisted data; single-next-action first.
- **Files:** `src/app/(authenticated)/owner/finance/page.tsx` (+ components), UI tests.
- **Implement:** health score, ranked risks, break-even/runway, next finance action,
  pending/verified, data-confidence/missing-data banner. No business logic in UI
  (CLAUDE.md) — read from API/services only.
- **Do NOT touch:** Module 1 UI; global nav beyond adding a finance entry.
- **Tests:** Test Matrix §11 (dashboard read).
- **Verification:** lint:ratchet, build, vitest, full test.
- **Done when:** dashboard renders persisted data; no mock.
- **Rollback/stop:** revert page.
- **Before prior proven?** No — needs Slice 6.

## Slice 8 — Integration with existing owner action/verification loop + Spine
- **Purpose:** Finance actions live in the proven action/verification loop; finance
  emits a `DomainScore` into the Business Condition Profile.
- **Files:** services wiring (`owner-finance` ↔ existing action/verification), spine
  emit, integration tests.
- **Implement:** finance action create/complete/verify via shared mechanism;
  Business Condition Profile finance contribution; ensure one loop, not two.
- **Do NOT touch:** Module 1 recovery behavior (additive only).
- **Tests:** cross-module integration (finding → owner queue → verification updates
  both finance dashboard and condition profile); Module 1 suite stays green.
- **Verification:** full `npm test`, both vitest suites, build.
- **Done when:** finance action verifiable through the shared loop; profile reflects
  finance.
- **Rollback/stop:** if integration risks Module 1 regressions, STOP and request
  authorization.
- **Before prior proven?** No — needs Slices 5–7.

## Slice 9 — Runtime smoke workflow (deployed HTTP)
- **Purpose:** Prove the finance loop on the deployed app.
- **Files:** `.github/workflows/module-2-finance-runtime-proof.yml`,
  `scripts/smoke-owner-finance-runtime-proof.ts`.
- **Implement:** manual `workflow_dispatch`, Node 20, fail-closed `confirm`, HTTP-only
  (no DB), masked IDs; flow per Test Matrix §15; safe artifact.
- **Do NOT touch:** product code; secrets.
- **Tests:** `--dry-run`/`--help` locally; live run from GitHub Actions only.
- **Verification:** YAML parse, dry-run exit 0, lint:ratchet, build, full test.
- **Done when:** workflow committed; ready to run from UI (not auto-run).
- **Rollback/stop:** revert workflow/script.
- **Before prior proven?** No — needs Slice 8 + a deploy including finance.

## Slice 10 — Audit & proof report
- **Purpose:** Record Module 2 audit + runtime proof; set module status.
- **Files:** `MODULE2_FINANCIAL_INTELLIGENCE_AUDIT_REPORT.md`,
  `MODULE2_FINANCIAL_INTELLIGENCE_RUNTIME_PROOF.md`, update `OWNER_MODE_STATUS_REPORT.md`.
- **Implement:** §25 audit (security/isolation/calculation correctness/state/data
  visibility/false-green); capture the deployed runtime-proof evidence.
- **Do NOT touch:** product code.
- **Tests:** none (doc) — but cite the green gates + runtime proof.
- **Verification:** `git diff --check`.
- **Done when:** Module 2 reaches `STAGING_PROVEN`; status updated truthfully (never
  `OWNER_MODE_FULL_CAPACITY_V1` — only one more domain proven).
- **Rollback/stop:** docs only.
- **Before prior proven?** No — last slice.

---

## Sequencing rules
- Slices 1→4 are pure/deterministic and must be green before any schema (Slice 5).
- No slice may begin before the previous is proven, except Slice 0 (doc) which
  precedes all. Pure-logic slices (2–4) may be developed in sequence but each must be
  individually green.
- Migration (Slice 5) is the only DB-affecting slice and uses a manual, fail-closed
  workflow — never auto-migrate on push, never run `migrate deploy` locally against a
  real DB.
- Any slice that would alter proven Module 1 behavior must STOP and request explicit
  authorization.

## Global done condition (Module 2 = STAGING_PROVEN)
All Test Matrix categories green in CI; finance migration applied via manual workflow;
deployed runtime smoke green (finance loop + Business Condition contribution +
security); Module 1 suite still green; status report updated. Public/SaaS stays
FROZEN. This proves one additional domain — it does NOT by itself reach
`OWNER_MODE_FULL_CAPACITY_V1`.
