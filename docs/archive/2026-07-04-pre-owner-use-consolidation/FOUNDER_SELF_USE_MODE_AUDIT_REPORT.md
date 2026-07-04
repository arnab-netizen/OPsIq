# Founder / Self-Use Mode Audit Report

## Executive Verdict

Status: NOT PROVEN

There is no separate "founder / self-use / internal business" mode in the codebase. The closest artifact is an **"owner mode"** (`src/domain/owner-mode/`, `src/services/owner-mode/`, `src/app/api/owner/*`, `src/app/(authenticated)/owner/first-value/`) — but evidence proves this is a read-only **portfolio/owner dashboard** for the consultant-side `admin_or_portfolio_manager` role (capability `OWNER_VIEW`, granted at `src/policies/capability-check.ts:71`), not a founder-personal business mode. It has no intake of its own, no founder-business data model, no industry/laundry logic, no outcome verification; it aggregates the same consulting `Engagement`/`Action`/`KPI`/`Recommendation` records produced by the generic diagnosis flow. It is also only partially wired: the dashboard API `GET /api/owner/dashboard` has no UI page, its sibling config endpoint persists to an in-memory `Map` (`src/app/api/owner/config/route.ts:55` — "In-memory store for demo (replace with DB in production)"), and the one owner UI page (`/owner/first-value`, a "PILOT_PROOF_PACKET" export) is not present in the sidebar navigation (`src/ui/shell/sidebar-nav.tsx`). The terms "founder", "self-use", "dogfood", "pilot" appear only in `docs/*` marketing files, never in product code. A founder cannot use this for a real laundry business today; the believed "separate complete mode" does not exist.

## What Was Found

Discovered artifacts that relate (loosely) to a founder/internal/owner concept:

- **Domain (owner mode):** `src/domain/owner-mode/owner-dashboard.ts` — enums `HealthStatus`, `ActionQueuePriority`; interfaces `ActionQueueItem`, `ActionQueueSummary`, `KPISummary`, `EngagementHealthSnapshot`, `WorkspaceHealth`, `OwnerDashboardConfig`, `OwnerDashboardView`. All in-memory DTOs; no Prisma model.
- **Domain (owner briefing):** `src/domain/owner-briefing/` and tests `src/__tests__/domain/owner-briefing/owner-briefing-engine.test.ts`.
- **Service:** `src/services/owner-mode/dashboard.service.ts` — pure functions `calculateWorkspaceHealth`, `summarizeActionQueue`, `buildOwnerDashboardView`, `DashboardServiceError` (no DB access inside).
- **Service:** `src/services/owner-dashboard.service.ts` (`getOwnerDashboard`, used by `GET /api/engagements/[engagementId]/dashboard`).
- **Service:** `src/services/first-value.service.ts` (`getFirstValue`; reads `db.workspace`, `db.engagement`).
- **API route:** `src/app/api/owner/dashboard/route.ts` — `GET`, requires `CAPABILITIES.OWNER_VIEW`; queries real engagements/actions/KPIs/recommendations for the workspace. **No UI page renders it.**
- **API route:** `src/app/api/owner/config/route.ts` — `GET` (`OWNER_VIEW`), `POST` (`OWNER_MANAGE`); config stored in module-level `const configStore = new Map(...)` (line 55), not persisted.
- **API route:** `src/app/api/owner/first-value/route.ts`.
- **UI page:** `src/app/(authenticated)/owner/first-value/page.tsx` — fetches `/api/owner/first-value`, exports a `PILOT_PROOF_PACKET`. Not in sidebar nav.
- **Capabilities:** `src/domain/constants/capabilities.ts:117-118` — `OWNER_VIEW: "owner:view"`, `OWNER_MANAGE: "owner:manage"`.
- **Role→capability map:** `src/policies/capability-check.ts:71` grants `OWNER_VIEW` to `ADMIN_OR_PORTFOLIO_MANAGER` (and `SYSTEM_ADMIN` via `Object.values(CAPABILITIES)` at line 9). `OWNER_MANAGE` is **not** in any non-admin role list (system_admin only).
- **Roles:** `src/domain/constants/roles.ts` — `SYSTEM_ADMIN`, `ADMIN_OR_PORTFOLIO_MANAGER`, `EXPERIENCED_CONSULTANT`, `BEGINNER_CONSULTANT`, `ANALYST`, `CLIENT_OWNER`, `CLIENT_TEAM_MEMBER`, `VIEWER`. `INTERNAL_ROLES` = consultant-side roles. No "founder" role.
- **Engagement mode:** `engagementMode` is a free string; only value written is `"expert"` (`src/services/diagnosis.ts:667`, `src/services/execute.ts:83`). No `"self"`/`"founder"`/`"owner"` mode.
- **Audit events:** `AUDIT_EVENTS.OWNER_CONFIG_UPDATED`, `AUDIT_EVENTS.OWNER_DASHBOARD_VIEWED`.
- **Tests:** `src/__tests__/domain/owner-mode/owner-dashboard.test.ts`, `src/__tests__/api/owner-dashboard.test.ts`, `src/__tests__/api/owner-dashboard-recommendations.test.ts`, `src/__tests__/api/owner-dashboard-query-parsing.test.ts`, `src/__tests__/signup-owner-permissions.test.ts`, `src/__tests__/first-value.contract.test.ts`, `src/__tests__/first-value.test.ts`, `src/__tests__/domain/owner-briefing/owner-briefing-engine.test.ts`.
- **Internal proof routes:** `src/app/api/internal/owner-dashboard-runtime-proof/`, `src/app/api/internal/signup-owner-permission-proof/`.
- **Docs only (not product code):** `docs/PILOT_READINESS_PACK.md`, `docs/BUYER_PROOF_PACKET.md` ("dogfood our own rules"), `docs/SALES_DEMO_SCRIPT.md`, `docs/FIRST_CUSTOMER_ONBOARDING_CHECKLIST.md` — all sales/pilot collateral.
- **Generated only:** `src/generated/prisma/internal` (Prisma client internals; not a feature).

No artifact named founder mode, self-use mode, internal business mode, private mode, recovery mode, complete mode, or full mode exists in product code.

## Search Terms Used

```
git status --short
git branch --show-current
git log -1 --oneline
cat package.json
find src -type d \( -iname "*owner*" -o -iname "*founder*" -o -iname "*self*" -o -iname "*internal*" -o -iname "*personal*" -o -iname "*dogfood*" -o -iname "*pilot*" \)
find src/app -type d -iname "*owner*"
grep -RIn "founder|self-use|self_use|dogfood|pilot|owner mode|founder mode|complete mode|full mode|recovery mode|business mode|self use" src/app src/domain src/services prisma scripts docs
grep -RIn "selfUse|self_use|selfService|self-service|founderMode|founder_mode|internalMode|internal_mode" src/app src/domain src/services
grep -rn "OWNER_VIEW|OWNER_MANAGE|owner:view|owner:manage" src/domain/constants/capabilities.ts src/policies/capability-check.ts
grep -rIn "engagementMode|engagement_mode" src/services src/domain
grep -rn "OWNER|owner|founder|operator|portfolio" src/domain/constants/*.ts (role/ROLE)
find src -iname "*.test.ts" | grep -iE "owner|first-value|firstwin|first_value"
npx prisma validate
npm run build
npx vitest run src/__tests__/domain/owner-mode/owner-dashboard.test.ts src/__tests__/domain/owner-briefing/owner-briefing-engine.test.ts
grep -rIn "href=\"/owner|href=\"/diagnosis" src/app src/components src/ui ; grep -rn "href=" src/ui/shell/sidebar-nav.tsx
```

## Possible Names / Aliases Found

| Alias | Found in product code? | Evidence |
|---|---|---|
| founder | NO | only `docs/*` and "Committed founder" string in `business-condition.ts:461` |
| owner | YES (different meaning) | "owner mode" = portfolio/admin dashboard; `CLIENT_OWNER` = client business owner role |
| internal | YES (different meaning) | `INTERNAL_ROLES` = consultant-side roles `roles.ts`; `src/app/api/internal/*` = debug/proof routes |
| self / self-use / self_use | NO | no matches in product code |
| personal | NO | no matches in product code |
| operator | YES (different meaning) | `OperatorItem` model, `/operator` route = execution queue, not founder mode |
| admin | YES | `ADMIN_OR_PORTFOLIO_MANAGER` role; `/admin` routes (billing/workspaces) |
| sandbox | YES (unrelated) | `AIProposalSandbox` model — AI proposal staging, not founder mode |
| business mode / recovery mode / diagnostic mode | NO | `interventionMode` (`recovery`/`stabilization`/`growth`) is a per-engagement field, not a user mode |
| complete / full / unrestricted mode | NO | no matches |
| dogfood / dogfooding | NO (docs only) | `docs/BUYER_PROOF_PACKET.md:47` |
| pilot | NO (docs only) | `docs/PILOT_READINESS_PACK.md`, sales copy |
| workspace mode | NO | `Workspace` has no `type`/`mode`/`isDemo` field (`prisma/schema.prisma:1157`) |
| founder mode / owner mode / internal mode / private mode | owner mode only | as above |

## Capability Matrix

| # | Capability | Status | Evidence | Missing / Risk | Required Fix |
|---|------------|--------|----------|----------------|--------------|
| 1 | Separate founder/internal mode exists | NOT PROVEN | No founder/self-use artifact; only `owner-mode` portfolio dashboard (`src/domain/owner-mode/`, `src/app/api/owner/*`) | A founder business mode does not exist | Define a founder/self-use mode or workspace type |
| 2 | Founder mode is reachable from UI | PARTIAL | Only `/owner/first-value` page exists (`src/app/(authenticated)/owner/first-value/page.tsx`); not in `src/ui/shell/sidebar-nav.tsx`; `GET /api/owner/dashboard` has no UI page | Owner dashboard API unwired to UI; not discoverable | Add UI page + nav entry |
| 3 | Founder mode is protected by role/capability | PROVEN | `OWNER_VIEW`/`OWNER_MANAGE` enforced via `withCanonicalEnforcement`; granted to admin/portfolio mgr only (`capability-check.ts:71`) | It protects an admin dashboard, not a founder mode | n/a |
| 4 | Founder mode is separated from public customer flow | PARTIAL | Capability-gated; but no workspace-type/mode separation; shares engagement data; `Workspace` has no `type`/`isDemo` (`schema:1157`) | No structural separation of founder vs SaaS data | Add workspace type / mode flag |
| 5 | Founder mode accepts real business data | NO, NOT PROVEN | Owner mode has no intake; only the generic diagnosis form (`/diagnosis`) intakes 3 numbers (see prior capability audit) | No founder-specific intake | Build founder intake |
| 6 | Founder mode stores real business data | PARTIAL | Owner dashboard reads persisted `Engagement/Action/KPI/Recommendation`; owner **config** itself is in-memory `Map` (`config/route.ts:55`) | Config not persisted; no founder business model | Persist config; add founder data model |
| 7 | Founder mode supports multiple founder businesses | PARTIAL | `ClientAccount` per business + `Engagement` per workspace exist | No "founder owns N businesses" concept; each diagnosis makes a new engagement | Model founder→businesses |
| 8 | Founder mode supports laundry/local-service use case | NO, NOT PROVEN | No industry-specific fields; intake = `businessType` free text only | No laundry metrics | Add domain templates |
| 9 | Founder mode supports B2C recovery | NO, NOT PROVEN | No order/customer-level data anywhere | absent | Build intake + logic |
| 10 | Founder mode supports B2B pricing/assessment | NO, NOT PROVEN | No B2B revenue/pricing intake | absent | Build intake + logic |
| 11 | Founder mode supports staff/operator accountability | NO, FAILED | Action assignment broken: no assignment endpoint; PATCH status enum ≠ `ACTION_STATUSES` (see prior audit) | Cannot assign/advance actions | Fix assignment + enums |
| 12 | Founder mode supports diagnosis generation | PARTIAL | Diagnosis engine exists (`src/services/diagnosis.ts`) but is generic, not owner-mode-specific | Template-driven, 3-input ceiling | Improve intake/engine |
| 13 | Founder mode supports evidence-backed findings | FAILED | Evidence rows restate findings (`diagnosis.ts:716-728`) | No metric-derived evidence | Attach real evidence |
| 14 | Founder mode supports realistic recovery plans | FAILED | Static recommendation array + fabricated scores (`recommendation/engine.ts:54`, `diagnosis.ts:773`) | Generic advice | Derive from data |
| 15 | Founder mode supports action assignment | NO, FAILED | `Action.assignedTo` written `null` (`diagnosis.ts:798`); no assignment route | Cannot assign | Add assignment route + persist |
| 16 | Founder mode supports execution tracking | PARTIAL | Schema has started/completed/verified fields; route enum mismatch blocks diagnosis actions | Path broken | Reconcile statuses |
| 17 | Founder mode supports before/after verification | NO, NOT PROVEN | `verifyOutcomeValue` hardcoded `confidence:0/"customer_reported_unverified"` (`outcome/verification.ts:51-58`) | No real comparison | Build verification |
| 18 | Founder mode supports repeated improvement cycles | NO, NOT PROVEN | Each diagnosis = new `Engagement` (`code:"DIAG-"+Date.now()`) | No cycle linkage | Link cycles |
| 19 | Founder mode dashboard reflects real outcomes | PARTIAL | `/api/owner/dashboard` reads real engagements/actions/KPIs/recommendations, but surfaces no outcome/verification; no UI page | Outcomes not shown; unwired UI | Surface outcomes + UI |
| 20 | Founder mode is tested | PARTIAL | 50 owner-mode/owner-briefing unit tests pass; calc-logic only, no DB end-to-end | No e2e founder flow test | Add e2e tests |

## Full Findings

### 1. Existence of Separate Mode

- Does a separate founder/self-use/internal mode exist? **NOT PROVEN.** No code artifact implements a founder-personal business mode. The only "mode"-shaped feature is `owner-mode`, a portfolio/admin dashboard.
- What is it called in code? The nearest is **"owner mode"** / **owner dashboard** (`owner-mode` domain & service, `OWNER_VIEW`/`OWNER_MANAGE` capabilities). Not "founder".
- Where is it routed? `GET /api/owner/dashboard`, `GET|POST /api/owner/config`, `GET /api/owner/first-value`; UI page `/(authenticated)/owner/first-value`.
- Where is it linked from? **Nowhere in the sidebar** (`src/ui/shell/sidebar-nav.tsx` lists Dashboard, Decision Check, Leads, Clients, Engagements, Users, Settings, Scenario Lab, Report). The owner dashboard API has no UI page; first-value page is reachable only by direct URL.
- What activates it? Capability `OWNER_VIEW` (role `admin_or_portfolio_manager` / `system_admin`). No flag, workspace setting, or "founder" toggle.
- Production-reachable? PARTIAL — the APIs are reachable by an admin-capability user; the dashboard has no rendered page; config does not persist.

### 2. Access Control

PROVEN as access control, but for an admin dashboard, not a founder mode. All owner routes use `withCanonicalEnforcement` with `requireCapabilities: [OWNER_VIEW]` (dashboard, config GET) or `[OWNER_MANAGE]` (config POST). `OWNER_VIEW` is granted only to `ADMIN_OR_PORTFOLIO_MANAGER` and `SYSTEM_ADMIN` (`src/policies/capability-check.ts:9,71`). `OWNER_MANAGE` is granted only to `SYSTEM_ADMIN` (not present in any other role list). The actual business-owner role `CLIENT_OWNER` is **not** granted `OWNER_VIEW` (`capability-check.ts:168-183`). `enforceWorkspaceScoping` is additionally called in `config/route.ts`. Workspace isolation is enforced (`db.engagement.findMany({ where: { workspaceId } })`). Public/unauthenticated users cannot reach it (authenticated layout redirects to `/login`). No founder-only data leak path was found because there is no founder-only dataset.

### 3. Data Model

No founder-mode data model exists. The owner dashboard reuses generic models (`prisma/schema.prisma`):

| Concept | Model/field | Present? |
|---|---|---|
| business profile | `ClientAccount` (name, industry, visibility) | YES (generic) |
| business type | `ClientAccount.industry`, `Engagement` free text | PARTIAL |
| business location | — | NO |
| revenue / costs | not stored as columns (transient in diagnosis) | NO |
| orders / customers / repeat / B2B-B2C | — | NO |
| staff | `User`, `UserRoleAssignment` (system users, not business staff) | NO (business sense) |
| actions | `Action` | YES |
| findings | `Finding` | YES |
| recommendations | `Recommendation` | YES |
| evidence | `Evidence`, `EvidenceItem`, `EvidenceBundle` | YES (but circular content) |
| verification | `OperatorItem.verificationStatus/...` | PARTIAL (decision pipeline, not diagnosis actions) |
| outcomes | `OperatorItem.actualOutcomeValue` | PARTIAL |
| improvement cycles | — | NO |
| owner config | `OwnerDashboardConfig` (in-memory `Map`, not a table) | FAILED (not persisted) |

### 4. Intake Flow

NOT PROVEN for founder use. Owner mode has **no intake** — it is read-only aggregation. The only data-entry path into the system is the generic diagnosis form (`/diagnosis` → `POST /api/diagnosis`) accepting `businessName`, `businessType`, `problemStatement`, `mainIssue`, and optional `monthlyRevenue/monthlyCosts/customerCount` only. There is no founder-business import, upload, connector, or multi-metric manual entry. The demo seed (`scripts/seed-demo-workspace.mjs`) is out of sync with the schema and cannot run (per prior capability audit). Real founder business data cannot be entered at the fidelity a laundry needs without developer intervention.

### 5. Diagnosis Flow

PARTIAL, and not owner-mode-specific. Diagnosis runs through `DiagnosisOrchestrator` + `FinancialEngine` + `DataValidationEngine` (`src/engines/*`) from the 3 financial inputs; findings/action plans are hardcoded templates keyed by category (`src/services/diagnosis.ts:225-590`). Confidence is computed; no impact score persisted (`estimatedImpact: null`); prioritization is a static label. Generic/static output risk: HIGH. The owner dashboard merely surfaces the resulting `Recommendation` rows (`owner/dashboard/route.ts` QUERY 4, `source: "diagnosis"`).

### 6. Advice / Recovery Plan Quality

FAILED. Recommendations originate from a static six-item array (`src/services/recommendation/engine.ts:54-99`) with hardcoded impact strings and constant fabricated reliability scores at persistence (`evidenceValidationScore: 75`, `kpiHealthScore: 75` — `diagnosis.ts:773-777`). No assumptions, financial basis, verification metric, or business constraints are captured. Owner mode does not improve this; it displays it.

### 7. Execution and Accountability

FAILED for the diagnosis path. `Action` schema has `assignedTo`, `dueAt`, `startedAt`, `completedAt`, `verifiedAt`, but diagnosis writes `assignedTo: null`, `dueAt: null`, `status: "draft"` (`diagnosis.ts:792-805`). There is no assignment endpoint (collection route is GET-only; item PATCH accepts only status). The PATCH status enum `["open","in_progress","completed","blocked","deferred"]` (`actions/[actionId]/route.ts:16`) does not match `ACTION_STATUSES ["draft","assigned",...]` (`statuses.ts:43`), so a `draft` action cannot be advanced. No completion notes / actual outcome / evidence requirement on the `Action` path.

### 8. Outcome Verification

NOT PROVEN. `verifyOutcomeValue` always returns `confidence: 0`, `verificationMethod: "customer_reported_unverified"` (`src/services/outcome/verification.ts:51-58`; asserted by `src/__tests__/r1-runtime/outcome-verification.test.ts`). No before/target/after real-metric comparison fed by re-ingested data. The owner dashboard does not surface verification status. Therefore founder mode cannot prove an action worked — and is, by the audit's own standard, not complete.

### 9. Dashboard / Command Center

PARTIAL. `GET /api/owner/dashboard` computes and returns: `overallStatus`, engagement health counts (`healthy/atRisk/critical`), `actionQueueSize`, `overdueActionCount`, `actionsByStatus`, `actionsByPriority`, `topRisks`, `recommendedActions` (real, `source:"diagnosis"`), `criticalActions`, `dueThisWeek`, and real KPIs — all from persisted workspace data. Missing: actual outcomes, verification status, metric movement (KPI `trend` is read but not computed from history), next-action logic, stale-data flags. Critically, **no UI page renders this payload** (only `/owner/first-value` has a page, and it shows a pilot-proof packet, not this dashboard).

### 10. Separation from Public SaaS Mode

PARTIAL / weak. Separation exists only by **capability/role** (`OWNER_VIEW` → admin/portfolio mgr). There is no separation by route namespace beyond `/owner/*`, no workspace type, no environment flag, no feature flag, no billing tier, and no data-model partition. `Workspace` has no `type`/`mode`/`isDemo` field (`schema:1157`). Because the same `Engagement` data backs both the consultant flow and the owner dashboard, a founder's own-business data and a paying customer's data would live in the same structures distinguished only by workspace membership — there is no "founder workspace" concept. It will not, by itself, confuse public customers (they lack `OWNER_VIEW`), but it also provides no real founder isolation.

### 11. Tests

| Test file | What it proves | What it does not prove | Runs / passed |
|---|---|---|---|
| `src/__tests__/domain/owner-mode/owner-dashboard.test.ts` | `calculateWorkspaceHealth`/`summarizeActionQueue` pure-logic correctness | No DB, no UI, no founder intake | Runs; **passed** (part of 50) |
| `src/__tests__/domain/owner-briefing/owner-briefing-engine.test.ts` | Owner-briefing engine logic | Not wired to a founder flow | Runs; **passed** (part of 50) |
| `src/__tests__/api/owner-dashboard*.test.ts` (3 files) | Route DTO shaping / query parsing / recommendation mapping | Not DB-backed e2e | Not executed in this run |
| `src/__tests__/signup-owner-permissions.test.ts` | OWNER capability is granted to portfolio-mgr on signup | Confirms admin, not founder, semantics | Not executed in this run |
| `src/__tests__/first-value.{test,contract}.test.ts` | First-value/pilot-proof packet contract | Pilot/sales artifact, not founder business mode | Not executed in this run |

Targeted run: `npx vitest run .../owner-mode/owner-dashboard.test.ts .../owner-briefing/owner-briefing-engine.test.ts` → **2 files, 50 tests passed**. All are unit tests on calculation logic; none exercises a database or an end-to-end founder journey (no `DATABASE_URL` configured).

### 12. Current Usability for Founder Businesses

| Use case | Status |
|---|---|
| Tumbledry / laundry business | NO, NOT PROVEN |
| B2C customer recovery | NO, NOT PROVEN |
| dormant customer reactivation | NO, NOT PROVEN |
| B2B pricing checks | NO, NOT PROVEN |
| staff productivity | NO, NOT PROVEN |
| delivery cost tracking | NO, NOT PROVEN |
| complaints/refunds | NO, NOT PROVEN |
| repeat customers | NO, NOT PROVEN |
| discount leakage | NO, NOT PROVEN |
| local marketing ROI | NO, NOT PROVEN |
| receivables | NO, NOT PROVEN |
| weekly recovery planning | PARTIAL (a plan is generated but not assignable/verifiable/persisted with owner+due+metric) |

## Blocking Gaps

1. No founder/self-use mode exists; "owner mode" is an admin/portfolio dashboard, not a founder business mode.
2. No founder-business intake — only a 3-number generic diagnosis form.
3. No founder-business data model (no orders/customers/B2B-B2C/complaints/receivables/staff metrics).
4. Owner dashboard API (`/api/owner/dashboard`) has no UI page and no nav entry.
5. Owner config persists to an in-memory `Map`, lost on restart (`config/route.ts:55`).
6. Action assignment is impossible via API (no endpoint; status enum mismatch).
7. Outcome verification hardcoded to `unverified` / `confidence 0` — cannot prove improvement.
8. No before/after metric comparison or improvement-cycle linkage.
9. No workspace-type / mode / `isDemo` separation between founder and public data.
10. Advice is static/fabricated (constant reliability scores, generic recommendation array).

## Partial / Hidden / Unwired Work Found

- `GET /api/owner/dashboard` — fully implemented, reads real data, **no UI page consumes it** (unwired). `src/app/api/internal/owner-dashboard-runtime-proof/route.ts` invokes it only as a proof harness.
- `GET|POST /api/owner/config` — implemented but backed by in-memory `Map` (not durable).
- `/owner/first-value` page + `getFirstValue` — implemented, exports a `PILOT_PROOF_PACKET`, but not in the sidebar (hidden from users).
- `src/domain/owner-briefing/` engine — present with passing tests; no route/UI wiring surfaced.
- `src/services/owner-dashboard.service.ts` (`getOwnerDashboard`) vs `src/services/owner-mode/dashboard.service.ts` — two different owner-dashboard service implementations (see below).

## Dead / Duplicate / Abandoned Implementations

- **Two owner-dashboard services coexist:** `src/services/owner-dashboard.service.ts` (`getOwnerDashboard`, consumed by `/api/engagements/[engagementId]/dashboard`) and `src/services/owner-mode/dashboard.service.ts` (`calculateWorkspaceHealth`/`summarizeActionQueue`/`buildOwnerDashboardView`, consumed by `/api/owner/dashboard`). They serve different routes but overlap conceptually (owner/workspace health) — a reconciliation/duplication risk, not a founder-mode duplicate.
- No duplicate **founder** mode implementations were found (there is zero, not many).
- `docs/PILOT_READINESS_PACK.md`, `docs/BUYER_PROOF_PACKET.md`, `docs/SALES_DEMO_SCRIPT.md` describe a "pilot"/"dogfood" story with no corresponding product mode — documentation outpaces code.

## Risk of Rebuilding Something Already Present

LOW for a founder/self-use business mode: it does not exist, so new build work will not duplicate it. MODERATE for the **owner dashboard**: the `/api/owner/dashboard` aggregation, the `owner-mode` health/queue calculators, the diagnosis pipeline, and the `Engagement/Action/KPI/Recommendation/Evidence` models are reusable primitives — a founder mode should wire these rather than re-create them. Do not rebuild the owner dashboard calculators or the diagnosis engine from scratch; do reconcile the two owner-dashboard services first to avoid a third overlapping implementation.

## Minimum Fix List to Make Founder Mode Usable

1. **Before founder can use it at all:** Define a founder/self-use surface (workspace type or mode flag + nav entry) and a real business-metrics intake (orders, customers, repeat/new, B2B/B2C, costs broken out, complaints, refunds, receivables, marketing spend, turnaround) with currency = INR; persist these as normalized fields.
2. **Before founder can rely on advice:** Replace the static recommendation array and fabricated reliability scores with metric-derived findings/advice; attach real evidence (metric, period, threshold, baseline, financial impact) to findings; capture business constraints.
3. **Before founder can track execution:** Persist action owner/due-date/priority/success-metric; add an assignment endpoint; reconcile the PATCH status enum with `ACTION_STATUSES` so `draft→assigned→in_progress→completed` works.
4. **Before founder can verify business improvement:** Implement before/target/after metric comparison fed by re-ingested data; populate verification status from data; link diagnoses into improvement cycles on one engagement; surface outcomes/verification on the owner dashboard (and give it a UI page).
5. **Before public subscription reuse:** Add workspace-type/`isDemo` separation; persist owner config to the DB; reconcile the duplicate owner-dashboard services; add e2e tests for the founder journey.

## Recommended Next Step

**REBUILD_MODE_FROM_SCRATCH** (as a *founder mode*), reusing existing primitives.

Evidence: there is no founder/self-use mode to VERIFY, WIRE, or REPAIR — the believed "separate complete mode" is absent from product code (no `founder*`/`self*` artifacts; "owner mode" is an admin/portfolio dashboard gated to `admin_or_portfolio_manager`, not the business founder). REMOVE_DUPLICATE_MODES_FIRST does not apply because there are no duplicate *founder* modes (only two overlapping owner-dashboard services, which should be reconciled in passing). WIRE_EXISTING_PARTIAL_MODE overstates what exists: the owner dashboard is partial infrastructure, not a founder mode. The correct path is to build the founder mode as a new, clearly separated surface that *reuses* the diagnosis engine, the `owner-mode` health/queue calculators, the `/api/owner/dashboard` aggregation, and the `Engagement/Action/KPI/Recommendation/Evidence` models — but the founder intake, real metric persistence, action assignment, and outcome verification must be built, because none of them exist today.

## Commands Run

| Command | Result |
|---|---|
| `git status --short` | clean (no untracked before this report) |
| `git branch --show-current` | `claude/vibrant-ramanujan-mdqej8` |
| `git log -1 --oneline` | `99d2ff3 Add OpsIQ real business capability audit and report` |
| `cat package.json` | test runner `vitest`; no founder/self scripts (has `demo:seed`) |
| `find ... -iname '*owner*'/'*founder*'/'*self*'/'*internal*'/...` | found `owner-mode`, `owner-briefing`, `api/owner`, `api/internal` (debug), `generated/prisma/internal`; no founder/self dirs |
| grep set 1 (founder/self-use/dogfood/pilot/...) | matches only in `docs/*` + "founder" string in `business-condition.ts` |
| grep set 2 (selfUse/founderMode/internalMode/...) | **no matches in product code** |
| grep OWNER caps + role map | `OWNER_VIEW` → admin/portfolio mgr (`capability-check.ts:71`); `OWNER_MANAGE` → system_admin only |
| grep `engagementMode` | only value `"expert"` written; no founder/self mode |
| `npx prisma validate` | "The schema at prisma/schema.prisma is valid 🚀" |
| `npm run build` | succeeded (full route table; `/owner/first-value` present, no `/owner` index page) |
| `npx vitest run owner-mode + owner-briefing tests` | 2 files, **50 tests passed** |
| sidebar-nav inspection | nav has Dashboard/Decision Check/Leads/Clients/Engagements/Users/Settings/Scenario Lab/Report — **no /owner, no /diagnosis** |

## Failed / Blocked Commands

| Command | Failure / block | Impact |
|---|---|---|
| Full DB-backed suite / `npm test` end-to-end (`TEST_WITH_DB=true`) | NOT RUN — no PostgreSQL/`DATABASE_URL` ("DATABASE_URL not configured for local testing, skipping DB initialization") | Owner-mode DB-backed routes not exercised at runtime; only unit/calc tests verified |
| `scripts/seed-demo-workspace.mjs` | NOT RUN; schema-mismatched (per prior audit) — `Workspace` requires `slug`, no unique `name`; `Engagement` lacks `name`/`externalId` | Cannot stand up demo/owner data without a DB and a fixed seed |
| `grep` over `app` (top-level) | path does not exist (project uses `src/app`) — re-run scoped to `src/app` | none (adjusted) |

No failed command is hidden.

## Final Verdict

1. Does founder/self-use mode exist? **NO, NOT PROVEN**
2. What is it called? Nearest is **"owner mode"** (admin/portfolio dashboard) — not a founder mode; no founder/self artifact exists.
3. Is it reachable? **PARTIAL** (owner APIs are capability-reachable; dashboard API has no UI page; first-value page not in nav)
4. Is it protected? **YES, PROVEN** (`OWNER_VIEW`/`OWNER_MANAGE`, admin/portfolio-mgr only)
5. Does it intake real data? **NO, NOT PROVEN** (owner mode has no intake; generic diagnosis intakes 3 numbers)
6. Does it generate credible advice? **NO, FAILED** (static array + fabricated scores)
7. Does it create recovery plans? **PARTIAL** (generated but not assignable/verifiable/persisted with owner+due+metric)
8. Does it track execution? **NO, FAILED** (no assignment endpoint; status enum mismatch)
9. Does it verify outcomes? **NO, NOT PROVEN** (hardcoded `unverified`, confidence 0)
10. Can founder use it now? **NO, NOT PROVEN**
11. Should new build work proceed before this mode is reconciled? **YES, PROVEN** — proceed: there is no founder mode to reconcile. Reconcile only the two overlapping owner-dashboard services in passing, and reuse existing primitives rather than rebuilding them.
