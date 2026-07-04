# OpsIQ Real Business Capability Audit Report

## Executive Verdict

Status: NOT PROVEN

The OpsIQ build compiles (`npm run build` succeeds), validates its Prisma schema (`npx prisma validate` → "valid"), persists a diagnosis transaction (Evidence → Finding → Recommendation → Action) with server-side auth and workspace isolation, and ships a reachable diagnosis UI. That is the extent of the proven chain. The diagnosis intake accepts only three numeric business inputs (`monthlyRevenue`, `monthlyCosts`, `customerCount`) plus free text — none of the order, customer-mix, complaint, refund, receivable, turnaround, B2B/B2C, or marketing metrics a real laundry business needs. Findings are template strings keyed by category, "evidence" is the finding restated, recommendations are a static six-item array with hardcoded impact strings and fabricated constant reliability scores (`evidenceValidationScore: 75`), action plans lose their owner/due-date/success-metric at persistence (`assignedTo: null`, `dueAt: null`), the action-status PATCH route's enum does not match the action state machine (so a diagnosis-created `draft` action cannot be advanced through the API), and outcome verification is hardcoded to `confidence: 0 / "customer_reported_unverified"` with no before/after real-metric comparison. The system cannot prove an action improved a business, cannot ingest the metrics needed to diagnose a real laundry, and cannot distinguish demo from real data (no demo flag in schema; the demo seed script is out of sync with the schema). Founder-use and subscription-readiness are both NOT PROVEN.

## Capability Matrix

| # | Capability | Status | Evidence | Missing / Risk | Required Fix |
|---|------------|--------|----------|----------------|--------------|
| 1 | Real business data intake | NOT PROVEN | `src/engines/contracts.ts` `BusinessAssessment`; `src/services/diagnosis.ts:38-44` `BusinessProblemInput`; UI `src/app/(authenticated)/diagnosis/page.tsx` — only `monthlyRevenue/monthlyCosts/customerCount` + text | None of ~25 required laundry metrics (orders, AOV, repeat, complaints, refunds, receivables, B2B/B2C, turnaround, marketing spend, churn, delivery/chemical cost) | Add normalized metric intake model + form fields; wire to diagnosis |
| 2 | Data validation | PARTIAL | Route Zod `diagnosisSchema` `src/app/api/diagnosis/route.ts:14-29`; `validateBusinessProblem` `src/services/diagnosis.ts:132-155`; idempotency-key required `route.ts:42-44` | No max ranges, no currency/period fields, no staleness; cross-field checks are soft "warnings" only | Add range/currency/period validation; reject impossible values |
| 3 | Persistence schema | PARTIAL | `prisma/schema.prisma` models Finding(487), Recommendation(756), Action(11), Evidence(359), KPI(572), BusinessConditionProfile(97); workspace scoping via `Engagement.workspaceId` | Metrics not stored as normalized fields; `FinancialBaseline` never written by diagnosis; no before/after store; no demo/real flag | Persist metrics; populate baseline; add `isDemo` |
| 4 | Business metric calculation | PARTIAL | `src/engines/FinancialEngine.ts` (cost ratio, margin, loss, revenue scale) | Only 3 inputs; no gross/net margin from cost breakdown, no repeat/churn/AOV/ROI/receivables/turnaround; currency hardcoded `$` | Add real metric formulas on persisted data |
| 5 | Diagnosis generation | PARTIAL | `src/engines/DiagnosisOrchestrator.ts`; `src/services/diagnosis.ts:574-642`; 40 unit tests pass | Findings/actions are hardcoded templates per category; limited to 3 financial inputs | Drive findings from real metrics |
| 6 | Evidence-backed findings | FAILED | Evidence created as finding restated: `src/services/diagnosis.ts:716-728` (`source:"diagnosis"`, title/description = finding); `Finding.confidenceScore/priorityScore` left null | No source metric, period, threshold, baseline, financial impact, confidence | Attach real metric evidence to findings |
| 7 | Recommendation / advice credibility | FAILED | Static `BASE_RECOMMENDATIONS` `src/services/recommendation/engine.ts:54-99`; persisted with constant `evidenceValidationScore:75, kpiHealthScore:75` `src/services/diagnosis.ts:773-777`; `estimatedImpact: null` | No constraint capture (budget/staff/cash/geography); fabricated scores; generic impact strings | Capture constraints; derive impact from data |
| 8 | Recovery plan generation | FAILED | `generateActionPlan` `src/services/diagnosis.ts:319-590` builds owner/dueInDays/successMetric, but persistence drops them: `assignedTo: null, dueAt: null, status:"draft"` `diagnosis.ts:792-805` | Persisted action loses owner, due date, success metric, priority | Persist plan fields onto Action |
| 9 | Priority ranking | NOT PROVEN | Action `priority` is a static template label; no impact/effort/risk scoring in diagnosis path | Ranking is hardcoded, not computed for diagnosis output | Add scoring-based ranking for diagnosis actions |
| 10 | Assignment and accountability | FAILED | `Action.assignedTo` exists (schema:18); PATCH `src/app/api/engagements/[engagementId]/actions/[actionId]/route.ts` accepts status only, enum `["open","in_progress","completed","blocked","deferred"]` ≠ `ACTION_STATUSES ["draft","assigned",...]` `src/domain/constants/statuses.ts:43-52`; queries non-existent `Action.workspaceId` (route:31) | No assignment endpoint; `draft`→`assigned` unreachable via route; status enum mismatch | Add assignment route; reconcile status enums; fix workspace filter |
| 11 | Execution tracking | PARTIAL | Schema has startedAt/completedAt/verifiedAt; `updateActionStatus` state machine `src/services/action.ts:44-72` | Diagnosis `draft` actions cannot advance via API (enum mismatch); no outcome/evidence required on completion | Fix transition path; require evidence on complete |
| 12 | Outcome verification | NOT PROVEN | `verifyOutcomeValue` returns `confidence:0, "customer_reported_unverified"` `src/services/outcome/verification.ts:51-58`; test asserts it `src/__tests__/r1-runtime/outcome-verification.test.ts:9-20` | No before/after real-metric comparison; "actual" derived from same condition profile | Re-ingest post-action metrics; compare to baseline |
| 13 | Dashboard reflection | PARTIAL | Engagement page fetches findings/recommendations/actions/kpis/evidence `src/app/(authenticated)/engagements/[engagementId]/page.tsx:33-79`; owner dashboard service | Phase badge key mismatch (`stabilization` vs UI `stabilize`); no verification/outcome surfaced; no demo/real marker | Surface verification/outcomes; fix phase keys |
| 14 | Closed-loop improvement | NOT PROVEN | Each diagnosis creates a NEW engagement `code:"DIAG-"+Date.now()` `src/services/diagnosis.ts:~655`; `triggerReEvaluation` is event re-scoring `src/services/re-evaluation.ts:441` | No same-business re-ingestion or cycle comparison from new real data | Tie diagnoses to one engagement; compare cycles |
| 15 | Founder business use-readiness | NO, NOT PROVEN | Sections 1,4,7,12 evidence; currency hardcoded `$` `src/engines/FinancialEngine.ts:81-139` while outcomes use INR `src/services/outcome/outcome.service.ts:16-18` | Cannot ingest laundry metrics; wrong currency; advice generic; outcomes unverifiable | Build metric intake + INR + verification |
| 16 | Subscription customer readiness | NO, NOT PROVEN | Auth/workspace isolation + Stripe/`Subscription`/`Plan` models present; beta disclaimer `src/components/diagnosis/DiagnosisBetaNotice.tsx`; demo seed broken (below) | No demo/real separation; advice not credible; execution/verification broken | Fix data separation, credibility, execution, verification |

## Full Findings

### 1. Real Business Data Intake

PARTIAL on plumbing, NOT PROVEN on the metrics that matter.

The only end-to-end intake is the diagnosis flow. The accepted shape is fixed in three places that agree:
- UI form fields: `src/app/(authenticated)/diagnosis/page.tsx` — `businessName`, `businessType`, `problemStatement` (textarea), `mainIssue` (select of 6 values), and three optional numbers: `monthlyRevenue`, `monthlyCosts`, `customerCount`.
- Route schema: `src/app/api/diagnosis/route.ts:14-29` (`diagnosisSchema`).
- Service input: `src/services/diagnosis.ts:38-44` (`BusinessProblemInput`) and engine contract `src/engines/contracts.ts` (`BusinessAssessment`).

Per-item support (diagnosis intake):

| Required item | Supported? | Source / DB field |
|---|---|---|
| daily revenue | NOT SUPPORTED | only `monthlyRevenue` (transient, not persisted as a field) |
| order count | NOT SUPPORTED | absent |
| customer count | SUPPORTED (transient) | `customerCount` input; not stored as a column |
| repeat customer count | NOT SUPPORTED | absent |
| new customer count | NOT SUPPORTED | absent |
| average order value | NOT SUPPORTED | absent |
| gross margin | NOT SUPPORTED | absent (only revenue−cost ratio) |
| net profit | NOT SUPPORTED | absent |
| staff cost / rent / utilities / delivery / chemical | NOT SUPPORTED | only aggregate `monthlyCosts` |
| marketing spend | NOT SUPPORTED | absent |
| complaints / refunds / rewashes | NOT SUPPORTED | absent |
| unpaid receivables | NOT SUPPORTED | absent |
| B2B revenue / B2C revenue | NOT SUPPORTED | absent |
| order turnaround time | NOT SUPPORTED | absent |
| staff productivity | NOT SUPPORTED | absent |
| campaign activity / conversion | NOT SUPPORTED | absent |
| customer retention / churn | NOT SUPPORTED in diagnosis | see growth APIs below |

A separate `src/services/growth/*` family (retention, unit-economics, acquisition, pricing, sales-pipeline, revenue-streams, offers) has Zod schemas accepting richer metrics (e.g. `retention-metrics/route.ts` cohort/churn). FAILED as real intake: no file under `src/services/growth/` imports `@/lib/db` (grep returned nothing), `RetentionEngine.recordMetrics` `src/services/growth/retention-engine.ts:30-66` returns a computed object with no DB write, there are no growth tables in `prisma/schema.prisma`, and there is no growth UI page (`find src/app -path '*growth*' -name '*.tsx'` → none). These are stateless calculators behind API headers, not reachable or persisted intake.

Seed/demo separation: there is no demo flag. `Workspace` `prisma/schema.prisma:1157-1172` has no `isDemo`/`status` field. The demo seed `scripts/seed-demo-workspace.mjs` writes fields that do not exist on the current schema (`Workspace` upsert keyed on non-unique `name`, missing required `slug`; `Engagement` with `name`/`externalId`/`health`/inline `businessConditionProfile` JSON that the schema does not have). FAILED: demo and real data are indistinguishable, and the demo path is itself broken.

### 2. Data Validation

PARTIAL. Validation library is Zod v4 (`src/app/api/diagnosis/route.ts:9,14-29`). The route validates types, `min(0)`, required strings, and the `mainIssue` enum; `validateBusinessProblem` (`src/services/diagnosis.ts:132-155`) repeats non-negativity checks. Duplicate submission is guarded by a required `idempotency-key` header (`route.ts:42-44`) and `checkIdempotencyKey`. Workspace ownership/role is enforced server-side via `withCanonicalEnforcement({ requireCapabilities:[ENGAGEMENT_CREATE] })` and `requireServiceContext`/`enforceWorkspaceId` (`diagnosis.ts:592-594` region).

Gaps: no maximum ranges, no impossible-value rejection (revenue/customer mismatch only produces a soft "data warning", not a rejection — `DataValidationEngine.ts:24-60`), no currency field (amounts are unitless, rendered as `$`), no time-period field, no staleness check, no demo/real flag. Not FAILED (it will not silently accept negative numbers), but thin.

### 3. Persistence Schema

PARTIAL. Validated (`npx prisma validate` → valid). Diagnosis persists in one transaction (`src/services/diagnosis.ts` `db.$transaction`): `Evidence` → `Finding` (FK `primaryEvidenceId`) → `Recommendation` → `Action`, plus `ClientAccount`, `Engagement`, and `BusinessConditionProfile` (via `assessCondition`).

Answers:
- Business intake data stored? PARTIAL — `monthlyRevenue/costs/customerCount` are not stored as columns; they are embedded into the `Engagement.description`/summary text and mapped to `BusinessConditionProfile` ordinal levels. `FinancialBaseline` (`schema:469`) is never written by diagnosis (no reference in `diagnosis.ts`).
- Metrics normalized or JSON? Neither — mostly discarded/text.
- Actions stored? YES (`Action` schema:11). Findings? YES. Recommendations? YES. Evidence? YES (but circular — see §6).
- Advice assumptions stored? NO field populated (`Recommendation.constraintsConsidered` exists, left unset by diagnosis).
- Confidence scores stored? PARTIAL — `Recommendation` gets constant fabricated scores; `Finding.confidenceScore` left null in diagnosis.
- Verification metrics / before-after / actual outcome stored? Fields exist on `OperatorItem` (`actualOutcomeValue`, `verificationStatus`, `verificationEvidence`, schema:648-665) but the diagnosis Action path does not populate them; `Action` has only `verifiedAt` with no outcome field.
- Responsible owner stored? Column `Action.assignedTo` exists but diagnosis writes `null`.
- Status history? `version` columns + `AuditEvent` (schema:58).
- Cycle comparison? NO — each diagnosis = new `Engagement` (`code:"DIAG-"+Date.now()`).
- Workspace isolation? YES — `Engagement.workspaceId`, queries scoped.
- Real vs demo separation? NO flag.

### 4. Business Metric Calculation

PARTIAL/FAILED. `FinancialEngine.assess` (`src/engines/FinancialEngine.ts`) computes: customer-base criticality, cost-to-revenue ratio (`lossRatio`), monthly loss, margin %, and a revenue-scale bucket — all from the three inputs, in memory, not from persisted history. `DataValidationEngine` derives revenue-per-customer and completeness. None of revenue trend, gross/net margin, repeat rate, churn, B2B/B2C profitability, campaign ROI, staff productivity, discount leakage, receivables exposure, complaint/refund rate, turnaround, or cashflow pressure is calculated — the inputs do not exist. Currency is hardcoded `$` (USD) across `FinancialEngine.ts:81-139` and `diagnosis.ts:212-215`, while the outcome layer is denominated in INR (`outcome.service.ts:16-18`) — an internal contradiction and wrong unit for an Indian laundry.

### 5. Diagnosis Generation

PARTIAL. Engine: deterministic rule/voting engine — `DiagnosisOrchestrator` runs `DataValidationEngine` + `FinancialEngine`, synthesizes severity (confidence-weighted max), category (vote + user issue tiebreak), phase, and `diagnosticConfidence` (`src/engines/DiagnosisOrchestrator.ts`). No LLM, so no hallucination risk; deterministic. It persists and has passing unit tests (`recommendation-engine`, `outcome-verification`, `diagnosis-value-path`, `diagnosis-signals` → 40 passed). However, `generateFindings` (`diagnosis.ts:225-300`) and `generateActionPlan` (`diagnosis.ts:319-590`) are hardcoded template branches keyed by category; the specific numbers only steer severity/days, not content. Verdict for "diagnose a real failing business from real business data": PARTIAL — it produces *a* governed diagnosis from 3 financial inputs, but it is template-driven and cannot see the operational reality of the business.

### 6. Evidence-Backed Findings

FAILED / NOT CREDIBLE. In the persistence transaction the `Evidence` row is the finding restated: `title: f.title`, `description: f.description`, `source: "diagnosis"` (`src/services/diagnosis.ts:716-728`). Findings carry no source metric, period, threshold, comparison baseline, financial impact, or confidence (`Finding.confidenceScore`/`priorityScore`/`rootCause` left null at `diagnosis.ts:744-762`). The "Evidence" shown in the UI is circular, not data-derived.

### 7. Recommendation / Advice Credibility

FAILED / NOT CREDIBLE. Recommendations originate from a static six-item array `BASE_RECOMMENDATIONS` (`src/services/recommendation/engine.ts:54-99`) with hardcoded `estimatedImpact` strings ("5-15% revenue increase") and generic `rationale`. At persistence (`diagnosis.ts:768-786`) every recommendation receives the same fabricated constants `evidenceValidationScore: 75`, `reliabilityLevel: "medium"`, `kpiHealthScore: 75`, `kpiRiskLevel: "medium"` regardless of input, and `estimatedImpact: null`. No business-constraint capture exists anywhere in the intake (budget, staff, cash position, geography, pricing model, urgency, risk tolerance) — those fields are not in `BusinessProblemInput`. Verdict for "credible advice for the founder's real businesses without guessing": FAILED.

### 8. Recovery Plan Generation

FAILED. `generateActionPlan` produces items with `title`, `description`, `ownerRole`, `dueInDays`, `successMetric` (`diagnosis.ts:319-590`) and the UI renders them. But persistence discards the meaningful fields: each `Action` is created with `assignedTo: null`, `dueAt: null`, `status: "draft"`, and no column for owner role, success metric, priority, effort, confidence, or verification method (`diagnosis.ts:792-805`). The plan is therefore non-assigned, non-due-dated, and non-measurable once stored.

### 9. Priority Ranking

NOT PROVEN. For the diagnosis path, action `priority` is a static `"high"/"medium"` label baked into each template branch; there is no impact/urgency/effort/confidence scoring computed for diagnosis output. `OperatorItem.priorityScore` and the `recommendations/rerank` route belong to a separate decision pipeline not fed by `diagnoseBusiness`. No "top 3" logic, no ranking explanation, no deterministic sort tied to diagnosis.

### 10. Assignment and Accountability

FAILED. Server-side auth + workspace isolation are real (`withCanonicalEnforcement`, `assertEngagementAccess`). But:
- No assignment endpoint: the action collection route exposes only `GET`; the item route `src/app/api/engagements/[engagementId]/actions/[actionId]/route.ts` exposes only `PATCH` accepting `status` (+ `blockageReason`, `version`).
- Status enum mismatch: route enum is `["open","in_progress","completed","blocked","deferred"]` (`route.ts:16-20`); the service state machine uses `ACTION_STATUSES = ["draft","assigned","in_progress","blocked","completed","verified","cancelled","overdue"]` (`src/domain/constants/statuses.ts:43-52`). `"open"`/`"deferred"` are not valid action statuses; `"assigned"` (the only forward transition from the diagnosis-created `"draft"`, per `ACTION_TRANSITIONS` in `src/services/action.ts:46-54`) is not accepted by the route. A diagnosis action cannot be moved forward through the API.
- The PATCH also filters `db.action.findUnique({ where: { id, workspaceId } })` (`route.ts:30-32`) but `Action` has no `workspace_id` column (`prisma/schema.prisma:11-37`).

### 11. Execution Tracking

PARTIAL, effectively FAILED for the diagnosis path. Schema supports `startedAt`, `completedAt`, `verifiedAt`, `status` and `updateActionStatus` enforces a state machine, emits audit events, and triggers re-evaluation. But because of §10 (enum mismatch + `draft`→`assigned` unreachable), diagnosis-created actions cannot progress through the API. Completion requires no outcome value or evidence on the `Action` path.

### 12. Outcome Verification

NOT PROVEN. `verifyOutcomeValue` (`src/services/outcome/verification.ts:24-59`) always returns `allowed: true, confidence: 0, verificationMethod: "customer_reported_unverified"`; the comment states outcomes "are always unverified" pending external integration, and the test asserts exactly this (`src/__tests__/r1-runtime/outcome-verification.test.ts:9-20`). `captureOutcomeVerificationMetadata` only adds fraud heuristics (round numbers, retroactive edits). `recordOutcome` (`src/services/outcome/outcome.service.ts:51-`) derives "actual" impact from `generateBusinessImpact` + `getFinancialDelta` over the existing `BusinessConditionProfile`, not from newly re-measured real metrics. There is no before-metric / after-metric / comparison-window pipeline fed by re-ingested data. The system cannot prove a recommended action improved the business.

### 13. Dashboard Reflection

PARTIAL. The engagement detail page fetches and renders findings, recommendations, actions, KPIs, and evidence (`src/app/(authenticated)/engagements/[engagementId]/page.tsx:33-79`); an owner dashboard service exists (`getOwnerDashboard`, route `src/app/api/engagements/[engagementId]/dashboard/route.ts`). Gaps: verification status and actual outcomes from the diagnosis path are not surfaced; the diagnosis result page's `PHASE_COLORS` keys (`stabilize`, `grow`, `repair`, `strengthen`, `protect`) do not match engine-emitted phases (`stabilization`, `recovery`, `growth`) — badge color resolves to undefined; no demo/real indicator.

### 14. Closed-Loop Improvement

NOT PROVEN. `diagnoseBusiness` always creates a fresh `Engagement` (`code: "DIAG-"+Date.now()`), so two diagnoses of the same business are unlinked records; there is no re-ingestion of updated metrics into one engagement and no cycle comparison. `triggerReEvaluation` (`src/services/re-evaluation.ts:441`) re-scores on significant-change events using existing stored state — it is not a "new real data → revised diagnosis → next action" loop.

### 15. Founder Business Use-Readiness

Per-item for a Tumbledry/laundry business:

| Item | Status | Evidence / gap |
|---|---|---|
| B2C order recovery | NOT PROVEN | no order/customer-level intake |
| dormant customer recovery | NOT PROVEN | no customer records or churn intake |
| B2B pricing assessment | NOT PROVEN | no B2B revenue/pricing intake |
| staff productivity tracking | NOT PROVEN | not captured |
| delivery cost tracking | NOT PROVEN | only aggregate `monthlyCosts` |
| complaint/refund tracking | NOT PROVEN | not captured |
| repeat customer tracking | NOT PROVEN | not captured |
| discount leakage | NOT PROVEN | not captured |
| local marketing ROI | NOT PROVEN | no marketing spend/campaign intake |
| receivables tracking | NOT PROVEN | not captured |
| monthly recovery planning | PARTIAL | plan generated but persistence drops owner/due/metric (§8) |
| daily/weekly operating review | NOT PROVEN | no recurring metric ingestion |
| manager accountability | FAILED | no assignment route; status enum broken (§10) |
| owner-level decision dashboard | PARTIAL | dashboard renders findings/actions but not outcomes/verification |

Additional blocker: currency hardcoded `$` (USD) in engines/diagnosis vs INR in outcomes — wrong unit for India.

Can the founder use the current build seriously for Tumbledry/current businesses today?

NO, NOT PROVEN

### 16. Subscription Customer Readiness

Present: server-side auth + capability checks, workspace isolation, Stripe + `Subscription`/`Plan`/`BillingAccount` models (`prisma/schema.prisma:976,721,82`), a beta data-safety disclaimer (`src/components/diagnosis/DiagnosisBetaNotice.tsx`), error handling on the diagnosis route. Missing/blocking: no demo/real data separation (§1), demo seed script broken against the schema, advice not credible (§7), execution path broken (§10/§11), outcomes unverifiable (§12), no export/delete UI surfaced, no onboarding that explains required data because the required data cannot be entered.

Can OpsIQ be sold safely as a subscription product now?

NO, NOT PROVEN

## Blocking Gaps

1. Diagnosis intake limited to 3 numeric inputs; cannot ingest the operational metrics a real business diagnosis requires (§1).
2. Outcome verification hardcoded to `confidence: 0 / unverified`; no before/after real-metric comparison — turnaround cannot be proven (§12).
3. Recovery-plan persistence drops owner, due date, and success metric (`assignedTo: null`, `dueAt: null`) (§8).
4. Action status PATCH enum (`open/deferred/...`) does not match the action state machine (`draft/assigned/...`); diagnosis actions cannot be advanced through the API (§10/§11).
5. Recommendations are a static array with fabricated constant reliability scores and null impact — not credible (§7).
6. Findings carry no metric-derived evidence; Evidence rows restate the finding (§6).
7. No closed loop: every diagnosis is a new unlinked engagement (§14).
8. No demo/real data separation flag; demo seed script is out of sync with the schema (§1, §16).
9. Currency hardcoded `$` (USD) in diagnosis vs INR in outcomes — wrong unit and internally inconsistent (§4, §15).
10. Action item route filters a non-existent `Action.workspaceId` column (§10).

## Partial Capabilities

- Data validation (Zod + idempotency + workspace auth, but thin) — §2.
- Persistence of the diagnosis object graph with workspace isolation (but metrics not normalized) — §3.
- Deterministic diagnosis engine (but template-driven, 3-input ceiling) — §5.
- Dashboard rendering of findings/recommendations/actions/KPIs/evidence (but no outcomes/verification) — §13.

## Proven Capabilities

- `npm run build` compiles successfully (Next.js 16, full route table generated).
- `npx prisma validate` → "The schema at prisma/schema.prisma is valid".
- Diagnosis API persists Evidence→Finding→Recommendation→Action in one `db.$transaction` with server-side capability enforcement, workspace scoping, idempotency-key requirement, and audit events.
- 40 targeted unit tests pass (recommendation engine, outcome verification, diagnosis value-path, diagnosis signals).
- Reachable diagnosis UI with a beta data-safety disclaimer.

(Each of the above is proven only as plumbing; none proves end-to-end real-business capability.)

## False / Overstated Claims Found

- "Evidence-backed findings": the persisted Evidence is the finding restated (`source:"diagnosis"`), not data-derived (§6).
- Recommendation reliability/KPI scores (`evidenceValidationScore: 75`, `kpiHealthScore: 75`) are hardcoded constants, presented as if computed (§7).
- Action plans display owner/due-date/success-metric that are not persisted onto the Action (§8).
- `DASHBOARD_REAL_DATA_PROOF.md` and similar root-level "proof" docs are not evidence per audit Hard Rule 5; the running code contradicts the "real data" framing for metrics intake and outcome verification.
- Demo seed script implies a working demo workspace but cannot run against the current schema (§1).

## Data Required for Real Tumbledry / Laundry Use

The product currently cannot accept any of these; all are required additions:
- Daily/period revenue split B2C vs B2B; order count; AOV; new vs repeat customer counts; churn/dormancy indicators.
- Cost breakdown: staff, rent, utilities, delivery, chemical/consumables, marketing spend (not a single `monthlyCosts`).
- Quality/ops: complaints, refunds/rewashes, order turnaround time, staff productivity.
- Cash: unpaid receivables, cash position.
- Marketing: campaign activity and conversion for ROI.
- Currency = INR with an explicit currency field and time period per metric.

## Minimum Fix List Before Founder Can Use It Seriously

1. Add a normalized business-metrics model + intake form covering the §15 laundry metrics, with currency (INR) and period.
2. Persist action owner, due date, priority, and success metric onto `Action`; add an assignment endpoint.
3. Reconcile the action status enum between route and `ACTION_STATUSES`; fix the `Action.workspaceId` filter; make `draft→assigned→in_progress→completed` reachable via API.
4. Implement real outcome verification: re-ingest post-action metrics and compare to a stored baseline; populate `actualOutcomeValue`/`verificationStatus` from data.
5. Replace the static recommendation array + constant reliability scores with metric-derived advice and impact estimates; capture business constraints.
6. Attach metric/period/threshold/baseline/financial-impact to findings (real evidence).
7. Link diagnoses to a persistent engagement so cycles can be compared.
8. Fix currency consistency (INR end to end) and the dashboard phase-key mismatch.

## Minimum Fix List Before Public Subscription

1. All founder-use fixes above.
2. Add an `isDemo` flag (workspace/engagement) and visibly separate demo from real data; repair or remove the demo seed script.
3. Credible disclaimers tied to confidence/verification state; do not present unverified outcomes as proven.
4. Self-serve onboarding that explains and collects required data without developer help.
5. Data export/delete (privacy), and billing-gated entitlements verified against the metric-intake features.
6. End-to-end tests against a real database for the diagnosis→assign→execute→verify loop (DB-backed suite was not runnable here — see Failed/Blocked).

## Commands Run

| Command | Result |
|---|---|
| `git status --short` | only `OPSIQ_REAL_BUSINESS_CAPABILITY_AUDIT.md` untracked (before report) |
| `git branch --show-current` | `claude/vibrant-ramanujan-mdqej8` |
| `git log -1 --oneline` | `466ae9e FIX P0: Resolve dynamic route slug conflict - rename /api/decisions/[id] to [decisionId]` |
| `cat package.json` | test runner = `vitest`; scripts inspected (no `jest`) |
| `ls src/ src/domain src/services src/engines src/app prisma` | structure enumerated |
| structural `grep` for diagnosis/recommendation/finding/evidence/action/verification/outcome/revenue/margin/etc. | used to locate code (Grep tool / inline) |
| `npm install --no-audit --no-fund` | installed 1055 packages; `postinstall` ran `prisma generate` → client generated to `src/generated/prisma` |
| `npx prisma validate` | "The schema at prisma/schema.prisma is valid 🚀" |
| `npx vitest run src/__tests__/r1-runtime/recommendation-engine.test.ts r1-runtime/outcome-verification.test.ts services/diagnosis-value-path.test.ts services/diagnosis-signals.test.ts` | 4 files, 40 tests passed |
| `npm run build` | Next.js build succeeded; full route table emitted |
| `find src -name '*.test.ts*' \| wc -l` | 329 test files present |

## Failed / Blocked Commands

| Command | Failure | Blocks capability proof? | Missing dependency |
|---|---|---|---|
| `npx prisma validate` (first attempt, before install) | "Cannot find module '@prisma/config'" | No (re-run passed after `npm install`) | `node_modules` not present initially |
| `npx vitest run src/__tests__/mvp-operational-flow.test.ts` | "No test files found" (path does not exist) | No | file not present at that path |
| Full DB-backed suite (`TEST_WITH_DB=true vitest run`, `npm run test:all`, `demo:seed`) | NOT RUN — no PostgreSQL/`DATABASE_URL` configured ("DATABASE_URL not configured for local testing, skipping DB initialization") | YES — end-to-end persistence/verification cannot be exercised at runtime here | PostgreSQL database + secrets not provisioned in this environment |
| `scripts/seed-demo-workspace.mjs` | NOT RUN; by inspection its writes do not match `prisma/schema.prisma` (Workspace `slug`/uniqueness, Engagement `name`/`externalId`/`health`) | Confirms demo path broken | requires DB; also schema-mismatched |

DB-backed runtime verification was blocked by the absence of a provisioned PostgreSQL instance. Static + unit + build + schema evidence is reported above; no failed command is hidden.

## Final Go / No-Go Verdict

Direct answers (evidence-only):

1. Intake real business data? PARTIAL — only 3 numeric inputs; not the metrics a real business needs → NO, NOT PROVEN for real diagnosis.
2. Validate that data? PARTIAL.
3. Persist that data correctly? PARTIAL — object graph yes; business metrics no.
4. Calculate useful business metrics? PARTIAL.
5. Diagnose a failing business? PARTIAL.
6. Provide evidence-backed findings? NO, FAILED.
7. Provide credible, realistic advice? NO, FAILED.
8. Create a recovery plan? PARTIAL — generated, but persistence drops owner/due/metric → effectively NO, FAILED.
9. Prioritize actions by impact? NO, NOT PROVEN.
10. Assign execution? NO, FAILED.
11. Track completion? PARTIAL — blocked by status-enum mismatch on the diagnosis path.
12. Verify whether the action worked? NO, NOT PROVEN.
13. Update the dashboard with outcomes? PARTIAL — findings/actions yes, outcomes/verification no.
14. Run repeated improvement cycles? NO, NOT PROVEN.
15. Founder use now for Tumbledry/current businesses? NO, NOT PROVEN.
16. Sell safely as subscription now? NO, NOT PROVEN.

GO / NO-GO: **NO-GO** for both founder real-business use and public subscription. The build is a governed, well-isolated skeleton with a deterministic but template-bound diagnosis and a persisted object graph; it is not a system that can ingest real operational data, give credible evidence-backed advice, durably assign and execute a plan, or verify that a business actually improved. Per the Expected Final Conclusion Standard: because outcomes cannot be verified, this build must not be described as able to turn around a business; because it cannot ingest real business metrics, it must not be described as able to diagnose a real business; and because demo and real data are indistinguishable, customer trust is a blocking risk for subscription.
