# Owner Decision Consolidation — Architecture Proof

Start state: `main` @ `548908a8501e45a587b90fffeaa286fcfbc7d6a9` (after #553, production-verified).
Phase: architecture proof only. Every claim below cites the file it was read from at that SHA.

## 1. Every live system that can elect an overall owner "#1"

| # | Elector | Where the #1 is chosen | Ranking rule | Status filter | Consumers |
|---|---|---|---|---|---|
| E1 | Owner Home required actions | `src/domain/owner-home/summary.ts:164-166` | `rankOwnerActions` (priority → impact → confidence → findingCode → title) | open only (`OPEN_ACTION_STATUSES`, summary.ts:38) | `/api/owner/home` → `/owner/home`; `getCockpitDomainPriority` |
| E2 | Business Condition rollup `recommendedNextAction` | `src/domain/owner-spine/contracts.ts:391-393`, fed by `src/services/owner-condition/business-condition.service.ts:486-519` | `rankOwnerActions` | **none** — completed/cancelled can win | `/api/owner/command-center` → `/owner` "Do this next"; `/api/owner/control-center` `nextBestAction`; portfolio `top3Priorities` |
| E3 | Owner Now View `topOwnerActions` | `src/domain/owner-guidance/guidance-orchestrator.ts:138,204`, `issue-priority.ts:108-117` | category ladder `ISSUE_PRIORITY_RANK` → severity → requiresOwnerAction → id | n/a | Cockpit assessment narrative `primaryIssue` (`owner-assessment-reconciliation.ts:142`) |
| E4 | Process-execution `topRoute` | `src/domain/owner-mode/process-execution-bridge.ts:317-325`, override `owner-now-view.service.ts:2172-2175` | bridge severity → priorityRank band | terminal task statuses | Cockpit primary card; `/owner/priorities`; process-intelligence |
| E5 | Cockpit fixed precedence | `src/components/owner/MinimumOwnerCockpit.tsx:1184,1216-1220` | `topRoute` > `financeTopPriority` > `domainTopPriority` — **by source, not by score** | Finance: **none** (`cockpit-finance-priority.service.ts:81`, `owner-finance/dashboard.service.ts:176`) | `/owner/cockpit` (sidebar "Home") |
| E6 | `/owner/priorities` browser ranking | `src/app/(authenticated)/owner/priorities/page.tsx:155-227` | 3-tier client sort over topRoute, risks, alerts, blocked decisions; insertion order within tier | per source | `/owner/priorities` |
| E7 | `/owner` "Primary driver" | `src/app/(authenticated)/owner/page.tsx:712-716` | first critical/high of `topFindings` | n/a — `topFindings` is always `[]` (business-condition.service.ts:574-581 never passes it), dead block | `/owner` |

Domain dashboards' `recommendedNextAction = latestCycle.actions[0]` (e.g. `owner-finance/dashboard.service.ts:176-177`) are **domain-local** electors. They are legitimate inside their own domain page and only became cross-domain through E5.

### Proven defects

- **D1 (production defect).** A completed or verified Minor Finance action outranks an active Strategy funding gap. `getCockpitFinancePriority` takes the Finance cycle's `actions[0]` with no status filter. E5 then gives Finance the primary slot unconditionally, ahead of `domainTopPriority`. That domain priority is where the Strategy action arrives, already open-filtered through Home. Score is never compared.
- **D2.** E2 elects completed or cancelled actions.
- **D3.** `calculateOwnerPriorityScore` clamps to 100 (`contracts.ts:236-249`, raw maximum ≈ 300). Saturation is acknowledged in `src/__tests__/services/owner-action-dashboard-ordering-governance.test.ts:9-12`. Saturated ties fall to `findingCode`/`title` string order (`contracts.ts:267-268`). There is no business precedence and no id key, so the order is not total.
- **D4.** Recovery priorities are a fixed lookup {90, 70, 45, 20} (`business-condition.service.ts:85-87,320-338`). A critical Recovery action can therefore never compete with any saturated optimisation action (100). The adapters also drop severity for every domain (`urgencyScore: 0`, no `severity`).
- **D5.** `/owner/priorities` reads `topRoute.title`, which `BridgedExecutionRoute` does not have (`process-execution-bridge.ts:51-88`). The #1 card title renders empty.
- **D6.** Verification is a separate record. An open action with a `verified_improved`, target-reached verification still ranks (`owner-finance/verification.service.ts` writes verification only).
- **D7.** Finance with revenue known and costs and cash missing persists health 50, risk 0, opportunity 0 and confidence 0 (`owner-finance/metrics.ts:303,348-360,362-372`). Risk 0 then drives a 30-day "stable" cadence (`business-condition.service.ts:361-373`). The two data-gap actions are hard-coded to confidence 1 and score 51 and 62. The 62 ("data quality", a low-severity opportunity) outranks the critical missing-data action, and via E5 takes the Cockpit primary.

## 2. Survivor matrix

| System | Inputs | Produces evidence? | Produces domain decision? | Chooses overall priority today? | Current consumers | Intended role | Keep / merge / retire |
|---|---|:-:|:-:|:-:|---|---|---|
| Finance | `OwnerFinancialSnapshot` (+cashflow bank balance, intake) | yes (`OwnerFinanceFinding`) | yes (`planFinanceActionsFromDiagnosis`) | **yes, via E5** | `/owner/finance`, Home, command-center, cockpit Finance card | Domain specialist | Keep. Remove its cross-domain primacy (E5). |
| Cashflow | `OwnerCashflowSnapshot` | yes | yes | no | `/owner/cashflow`, Home | Domain specialist | Keep |
| Strategy | `OwnerStrategySnapshot` | yes | yes (`deriveStrategyDecision`, 5 codes) | no (explicitly, `owner-strategy/actions.ts:85-88`) | `/owner/strategy`, Home via `coherentStrategyActions` | Domain specialist | Keep |
| Recovery | `OwnerMetricSnapshot` | yes (`RecoveryFinding`) | per finding | no | `/owner/recovery`, Home | Domain specialist | Keep. Fix severity mapping into the spine (D4). |
| Sales | `OwnerSalesSnapshot` | yes | yes | no | `/owner/sales`, Home | Domain specialist | Keep |
| Operations | `OwnerOperationsSnapshot` | yes | yes | no | `/owner/operations`, Home | Domain specialist | Keep |
| SOP / Execution | `OwnerSopSnapshot` | yes | yes | no | `/owner/execution`, Home | Domain specialist | Keep |
| Marketing | `OwnerMarketingSnapshot` | yes | yes | no | `/owner/marketing`, Home | Domain specialist | Keep |
| Owner Intelligence Spine (`src/domain/owner-spine/contracts.ts`) | normalized `OwnerAction`s | no (contract only) | no | yes (`rankOwnerActions` used by E1, E2) | Home, Business Condition, domain planners | **Canonical arbiter** | **Keep — survivor (contract + arbitration)** |
| Owner Home (`owner-home/home.service.ts`, `domain/owner-home`) | latest cycle of all 8 domains, findings, verifications | rolls up | no | yes (E1) | `/owner/home`, cockpit domain card | **Canonical candidate aggregation + resolver** | **Keep — survivor (aggregation)** |
| Business Condition rollup (`owner-condition/business-condition.service.ts`) | same 8 domains, no status filter | no | no | **yes (E2), duplicate of Home** | `/owner`, control-center, portfolio | Informational condition rollup (domain scores, cadence, sufficiency) | **Merge**: keep adapters, domain scores, cadence and sufficiency. `recommendedNextAction` comes from the canonical decision. |
| `OwnerBusinessConditionProfile` (`owner-mode/owner-bcp.service.ts`) | caller-supplied health facts | no | no | no | `/api/owner/bcp` only | InterventionMode/Phase/cadence store | Keep, untouched in this mission (not an elector). Its non-changing auto re-evaluation is a separate follow-up. |
| Owner Now View (`owner-guidance/owner-now-view.service.ts`) | categorical cash/finance states, workload/capacity/metric/supplier snapshots, proofs | contextual | no | yes (E3 narrative) | cockpit, `/owner/now`, priorities, process-intelligence | **Contextual enrichment** (what changed, avoid, overload, proof, constraints, execution) | Keep. Must not elect a competing overall target. |
| processExecution / `topRoute` | process corrections, cash/profit protection, expansion families (computed live, persisted only on POST) | no | no | yes (E4, E5 primary) | cockpit, priorities, process-intelligence | **Governed execution vehicle** (Now View context) | Keep as execution context. Stop labelling it "Your top priority now". |
| Risks (`BusinessRiskEntry`) | owner-entered risks | yes | no | via E6 | `/owner/risks`, priorities | Workspace attention | Keep. **workspaceId only, no businessId**: cannot enter a business decision without cross-business leakage. |
| Alerts (`Alert`) | risk/compliance/execution producers | no | no | via E6 | priorities | Workspace/user attention | Keep. workspaceId + userId only, same constraint. |
| Blocked decisions (`OperatorItem` status blocked) | operator queue | no | no | via E6 | priorities | Workspace attention | Keep. workspaceId only, same constraint. |
| `/owner/priorities` | E4 + risks + alerts + decisions | no | no | **yes (E6, client-side)** | page | Presentation of canonical order + workspace attention | **Rewire**: render the server-resolved canonical order. The browser never elects. |
| Home (`/owner/home`) | `/api/owner/home` | – | – | renders E1 | page | Presentation | Rewire to the canonical decision |
| Cockpit (`/owner/cockpit`) | now-view + finance/domain bridges | – | – | **yes (E5)** | page | Presentation | Rewire to the canonical decision. Remove E5 precedence. |
| legacy `/diagnosis` (+ `POST /api/diagnosis`, `services/diagnosis.ts`, `src/services/recommendation/engine.ts`) | free-text form, optional revenue/costs/customers (missing → 0) | writes template Evidence/Findings | fixed 6 recommendations reordered | its own (consultant-only) | `ENGAGEMENT_CREATE` holders only | none | **Retire (PR B)** |
| Formal Consulting Mode (`domain/consulting`, `services/consulting`, `/api/consulting/engagements`) | consultant input | human findings | human | no | SYSTEM_ADMIN (`CONSULTING_*`) | Human consulting workflow | **Keep, untouched.** Independent of the legacy engine (no imports). |

## 3. Canonical survivor and why

**Survivor: Owner Intelligence Spine (contract + arbitration) + Owner Home aggregation.**

- **All eight domains in one contract.** It is the only path that normalizes all 8 domains into one contract (`OwnerAction`) using per-domain adapters (`business-condition.service.ts:48-338`, reused by `home.service.ts:207-307`). It is also the only path that filters to open work (summary.ts:164).
- **Now View cannot be the survivor.** It reads **no** domain action or finding table (only categorical cycle states, `owner-now-view.service.ts:876-877`). Its ladder has compliance below profit leak (`issue-priority.ts:39-50`). Electing it would lose every domain decision.
- **`topRoute` cannot be the survivor.** It is computed live from workspace-level signals, is ambiguous across businesses (`owner-now-view.service.ts:2140-2145`), and is not persisted until an owner starts work.
- **Business Condition's rollup is a strict duplicate** of Home with a weaker filter.

## 4. Priority-score hostile audit

- **Saturation.** The raw product reaches 300, so any combination with impact × confidence ≥ ~50 and high urgency or severity saturates at 100. Example: Strategy funding gap, investment ₹60,000 vs cash ₹10,000, computes 143 → 100.
- **Tie semantics.** After saturation, the order is decided by `findingCode` string order: e.g. `"FIN_…" < "STR_…"`, so Finance always wins a saturated tie against Strategy for alphabetical reasons.
- **Severity is invisible at arbitration.** Only the stored `priorityScore` is ranked, and severity is dropped by every adapter.
- **Cross-domain incomparability.** Recovery uses a fixed lookup scale and never reaches 100. The "survival" multiplier means a different risk score per domain.

**Existing documented precedence (reused, not invented):**
- `docs/real-world-data/worst-case-survival-recovery-proof/CRISIS_PRIVACY_AND_SAFETY_NOTES.md:8`: "Cash/continuity, customer/reputation, quality, legal/contract/tender, and capacity always outrank growth/marketing".
- Category-first, then severity, as in `issue-priority.ts:108-117`.
- `SURVIVAL_DOMAINS` in `contracts.ts:36`.
- The mission's required precedence puts safety/compliance first, consistent with the CRISIS rule that these classes outrank growth.

**Canonical order (implemented in PR A):**

1. `SAFETY_COMPLIANCE`
2. `SURVIVAL_CASH`
3. `CUSTOMER_SERVICE_FAILURE`
4. `OVERLOAD_BLOCKING`
5. `PROFIT_LOSS`
6. `BLOCKED_EXECUTION`
7. `PLAN_COMMITMENT_RISK` — a plan being evaluated that would put money or delivery at risk if committed now (assigned only from Strategy's resolved decision)
8. `MISSING_CRITICAL_EVIDENCE`
9. `GROWTH_OPPORTUNITY`
10. `PROCESS_OPTIMISATION`

Classification is by finding code, from a total table covering every code the domain rule files emit. An exhaustiveness test enforces it. Codes are classed by the business harm they describe, not by their domain: e.g. `OPS_CAPACITY_BOTTLENECK` is overload, `OPS_HIGH_DELAY`/`SALES_WEAK_REPEAT` are customer failure, loss/cash-leak opportunities are profit loss, `FIN_HIGH_PAYABLES` is survival cash.

**Source-specific classes (never fabricated):**
- **Strategy** is classed from its RESOLVED five-state decision (`NEED_INFO`/`DONT_AS_PLANNED`/`NOT_YET`/`GO_WITH_CONDITIONS`/`GO`) and the actual blocker (`strategyCandidatePriorityClass`): under `NOT_YET`/`DONT_AS_PLANNED` a money-at-risk blocker (unaffordable, low reserve, negative case/ROI, weak ROI, long payback) or high execution risk is `PLAN_COMMITMENT_RISK` — above optional growth and data requests, below every PRESENT problem (the harm happens only if the owner commits; the "don't commit yet" warning is always in `whatNotToDo`). Every other Strategy step, and all positive upside, is `GROWTH_OPPORTUNITY`.
- **Compliance** uses the existing compliance/action-gate semantics only: a hard block (`breached`, or `active` and expired — the gate's hard stop) is `SAFETY_COMPLIANCE`; an expired item already in evidence/review is `BLOCKED_EXECUTION` (`COMPLIANCE_RENEWAL_IN_PROGRESS`). Severity is set only where the compliance service itself raises a critical alert (`breached`); priority score and impact are 0 (none exist in the model); confidence comes from the item's recorded provenance. Upcoming/non-blocking items are not candidates. This reorders compliance relative to the old Now View ladder (which put it below profit leak) — deliberately, per the CRISIS precedence above.
- **Business risks** (workspace-level) are candidates only when the workspace has exactly one real business, fixture rows and fixture-tainted startup sessions excluded; mitigating risks use residual risk; confidence is the fixed owner-recorded value 0.6.

Within a class the order is:
0. a RECORDED compliance block (a breach, or an active expired obligation the action gate stops on) before estimates and diagnosed actions
1. severity
1a. CURRENT evidence before an evidence refresh: a refresh target exists because OpsIQ no longer trusts the stale diagnosis enough to act on it, so it never defeats a fresh, evidence-backed danger of equal class and severity (restored from the linked finding; Recovery from its `priority`)
2. `priorityScore` (the existing spine score)
3. expected impact
4. confidence
5. lower effort

Stable id and code are used only as final deterministic tie-breakers.

## 5. Terminal and stale handling (canonical eligibility)

A candidate is excluded from the election when any of these holds:
- its status is `completed` or `cancelled`;
- its latest verification reached its target (`extractReachedTargetFromVerification`, `owner-finance/outcome-signals.ts:112`);
- it is not on its domain's latest cycle. Engaged actions whose finding is still raised are re-attached to the new cycle (`owner-finance/dashboard.service.ts:120-125`), so an older-cycle action is one current evidence no longer raises;
- it is a Strategy action that is incoherent with the live decision (`coherentStrategyActions`);
- it is a survival-class Cash or Finance action whose unsafe reading was superseded by a NEWER, disagreeing reading of the other source (`resolveCashFinanceSignal`, the same arbitration Now View uses). "Newer" is the evidence PERIOD each reading describes (its snapshot's `periodEnd`), never the cycle's `createdAt` — a re-diagnosis from an old snapshot after an action is completed/verified must not look current. Incomparable freshness (equal or missing periods) excludes nothing.

**Stale evidence** (evidence period older than 45 days, or a Finance snapshot amended after diagnosis) never lets an old high-class item win: the stale domain's actions are excluded as `stale_evidence` and replaced by ONE explicit `evidence_refresh` target per stale domain, which keeps the class and worst severity (and inherits the confidence and effort) of the most serious item it stands in for (an out-of-date survival danger stays urgent to CONFIRM, never demoted behind fresh minor work) and names the stale items. Ageing never "resolves" a critical issue in "what changed": stale critical issues stay open and the owner is told the figures are out of date. Current hard safety/compliance items are not domain actions and are unaffected.

**Finance missing data** comes from the EXACT snapshot attached to the latest Finance cycle (`finance.snapshot`) — in Home, Business Condition and the Finance dashboard — never from whichever snapshot has the latest period.

**Unconfirmed survival danger.** When a CURRENT, un-superseded cash/finance reading is unsafe but no eligible survival-cash action covers it (its actions were completed, verified or cancelled while the same snapshot still reads unsafe), the candidates gain an explicit "Confirm your cash position with current figures" target (class `SURVIVAL_CASH`, severity from the reading, marked as an evidence refresh) — lower-class work never wins silently beside a live cash-danger signal.

## 5a. Decision memory ("what changed")

The resolver persists its memory as the audit event `owner.decision_changed` (its own entity type `OwnerDecision`, keyed by businessId, so it never crowds the owner-business audit trail) whenever the decision materially changes, on whichever route resolved it. The write is serialized per workspace with a Postgres advisory transaction lock and re-reads the latest memory inside the lock, so concurrent reads (two tabs, Portfolio fan-out) record one event and never fork the workspace audit hash chain. "What changed" compares against the previous distinct memory, so it no longer depends on the owner visiting Now View. Issues keep a stable identity (domain + finding code / record id) with their severity, so changes are reported as appeared, escalated, improved (still open) or resolved — a critical issue downgraded to high is never "resolved". "New data" is reported only when a domain's evidence identity (the snapshot its diagnosis ran on) changes; a re-diagnosis of the same snapshot is a new calculation, not new evidence. No schema change.

## 5b. Surfaces that are explicitly subordinate or domain-local

- Home, Cockpit, Priorities, Command Center and the `/owner/now` headline/plain-language block all render the one `CurrentOwnerDecision`.
- Plan analysis (supervisor summary, plan checkpoints, plan action & proof, dominant plan constraint) runs its own model, so on the Command Center it is collapsed behind one "Supporting plan analysis" disclosure below the decision card.
- Command Center control-center guardrails ("What NOT to do now") receive the canonical main target and never veto it: a guardrail that would forbid the target becomes a condition on executing it (same pattern as Now View). The Command Center shows ONE review cadence — the one the canonical decision was resolved with.
- `/owner/first-value` (reachable by any `OWNER_VIEW` holder) renders the canonical decision; its engagement-derived "recommended first action" is no longer presented.
- Now View's avoid list is reconciled with the decision (a growth main target turns the growth gate into a "small trial" precondition), and the do-not-repeat annotation is keyed to the main target's class and business.
- Domain dashboards' next action is labelled "this area only" and is the top OPEN action of that domain; wealth and budget moves are labelled as area-only.
- Consultant decisions (`ENGAGEMENT_VIEW`) are not fetched on owner pages; owner alerts are shown below the decision and linked to their canonical position.

## 6. Legacy `/diagnosis`: dependency proof summary (retired in PR B)

- **Runtime importers.** `services/diagnosis.ts` ← only `api/diagnosis/route.ts`. `src/services/recommendation/engine.ts`, `src/engines/*` and `services/diagnosis-signals.ts` ← only `services/diagnosis.ts`.
- **Pages, components and navigation that PR B must remove or rewrite.** `src/app/(authenticated)/diagnosis/page.tsx` (calls `/api/diagnosis`, renders its own "Why this is first"), `src/components/diagnosis/DiagnosisBetaNotice.tsx`, `src/components/diagnosis/DiagnosisEvidenceScopeNotice.tsx`, `FirstDiagnosisCta` (used by `dashboard/page.tsx` and imported by tests), the `/diagnosis` nav entry in `src/ui/shell/sidebar-nav.tsx`, and the `dashboard/page.tsx` fallback link to `/diagnosis`.
- **Tests that read deleted files from disk (must be rewritten in PR B).** `src/__tests__/components/visual-system-p0-contrast-regression.test.ts` (reads `diagnosis/page.tsx`), `src/__tests__/owner-activation/branding-regression.test.ts` (reads `FirstDiagnosisCta.tsx`). Review items: `owner-activation/owner-data-hub-page.test.tsx` (asserts no `/diagnosis` href — becomes vacuous), `services/diagnosis-value-path.test.ts`, comments in `services/idempotency-schema-contract.test.ts` and `services/__tests__/owner-journey-smoke.db.test.ts`; `infra/observability.test.ts` stays valid (`DIAGNOSIS_ERROR` is kept).
- **Tests PR B must delete or rewrite.** `src/services/__tests__/diagnosis.integration.test.ts`, `src/services/__tests__/diagnoseBusiness-db-workspace-isolation.db.test.ts`, `src/__tests__/services/diagnosis-audit.db.test.ts`, `src/__tests__/r1-runtime/recommendation-engine.test.ts`, `src/__tests__/services/diagnosis-signals.test.ts`, `src/__tests__/api/diagnosis-error-visibility.test.ts`, `src/__tests__/components/diagnosis-browser-contract.test.ts`, `src/__tests__/components/dashboard-first-diagnosis-cta.test.tsx`, `src/__tests__/owner-activation/branding-render.test.tsx`, `src/__tests__/owner-activation/activation-surfaces.test.tsx`, `src/__tests__/app/commercial-trust-basics.test.tsx`, `src/__tests__/components/sidebar-nav-pr-c-exposure.test.tsx`.
- **Scripts, workflows and baselines.** `scripts/smoke-production-diagnosis-dashboard.ts` and `.github/workflows/smoke-production-diagnosis-dashboard.yml` post to `/api/diagnosis` (the workflow is also listed in `scripts/ci-governance-check.mjs`); `src/app/api/internal/diagnosis-route-proof/route.ts` mirrors the POST auth pipeline without importing the legacy service (retire candidate); `docs/opsiq/ux/OWNER_FEATURE_PRESERVATION_BASELINE.json` lists `/diagnosis` (its removal needs the owner-approved preservation-change process).
- **Shared code that stays.** `assessCondition` (also used by `api/engagements/[engagementId]/condition/route.ts`), the four `api/diagnosis/{archetype,maturity,root-cause,bottleneck}` routes (`DIAGNOSIS_READ`, `diagnostic-core`), `lib/security/diagnostic-key` and the `DIAGNOSIS_ERROR` observability category.
- **Access.** Self-serve owners (`isSelfServeOwnerContext`) and `CLIENT_OWNER` never hold `ENGAGEMENT_CREATE` (`policies/capability-check.ts`). A provisioned `ADMIN_OR_PORTFOLIO_MANAGER` or `SYSTEM_ADMIN` holds both `OWNER_VIEW` and `ENGAGEMENT_CREATE` and can reach `/diagnosis` from the nav today — a pre-existing competing "first" for those roles only, removed with the nav item in PR B. Owner surfaces for self-serve owners avoid the route (`owner/data/page.tsx`).
- **What it produces.** 6 fixed recommendations re-sorted; missing revenue, costs and customers become 0 (`services/diagnosis.ts`). Evidence, Findings, Recommendations and Actions are written in one `$transaction`; ClientAccount, Engagement (with interventionMode/interventionPhase) and a BusinessCondition row (`assessCondition`) are written outside it, and four audit events are emitted. PR B removes a path that writes condition and intervention records, so historical rows stay readable but no new ones are created by it.
- **No unique reader.** The rows it writes are generic engagement rows; historical rows stay readable through the engagement workspace. PR A's canonical candidate pipeline never reads engagement Recommendation/Action rows.
- **Consulting Mode** (`domain/consulting`, `services/consulting`, `api/consulting`) imports none of it.
