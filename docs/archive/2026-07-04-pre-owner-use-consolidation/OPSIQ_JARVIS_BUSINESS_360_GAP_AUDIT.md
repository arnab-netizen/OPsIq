# OPSIQ — "JARVIS FOR BUSINESS" 360° HOSTILE GAP AUDIT

> Read-only hostile capability inventory. No source, tests, or workflows were modified.
> Evidence gathered by direct code inspection + 8 parallel deep-read sub-audits of the
> current branch. Brutally honest; uncertainty is flagged as uncertain.

---

## 1. EXECUTIVE VERDICT

**OpsIQ today is a strong, governed, DB-backed, workspace-isolated *diagnostic-and-guidance*
platform — not yet an autonomous *operating* co-pilot.**

It does extremely well at: ingesting owner-entered period snapshots, running deterministic
per-domain diagnosis (finance, cashflow, sales, operations, SOP/execution, marketing,
strategy, portfolio, recovery, budget, trust), ranking findings/actions, rolling them up into
a single cross-domain **Business Condition Profile** behind a real command-center route, and
enforcing server-side RBAC + audit + a proof state machine. Eleven owner domains are
DB-backed and have per-module CI runtime-proof / DB-verification workflows.

It does **not** yet do the things that make the product mandate "Jarvis": it does not reduce
owner workload through approval memory / standing instructions / batch / recurring automation;
it does not model first-class operational reality (no Equipment, Staff-skill, SOP-document,
Checklist, Process, Customer, Complaint entities — only period *snapshots* of aggregate
counts); its safety guardrails (cash-safety, input-quality, business-impact) are **opt-in and
default-off**; its anti-gaming proof flow has **no separation-of-duty** (submitter can review
own proof) and **no proof-to-completion gate**; and its self-evaluation/learning loop is
modeled in DB but **not closed at runtime**.

### Does the repo currently support "Jarvis for business"?
**No — not as an operating co-pilot.** It supports a partial **owner command center** that
*advises*. The convert-reality-into-verified-profit-protecting-action loop is broken at
execution-gating, anti-gaming, workload-reduction, operational-entity, and self-evaluation
stages.

### Biggest blockers
1. **No operational entity layer.** Owner modules diagnose aggregate *snapshots*; there are no
   Equipment, Staff/Skill/Training, SOP-document, Checklist, Process, Customer, or Complaint
   records to manage, verify, or constrain decisions against.
2. **Guardrails are opt-in (default off).** Cash-safety, input-quality and business-impact
   gates only fire when `requireBusinessImpactAssessment === true` on the workspace. Default
   deployments promote growth/spend recommendations with critical-missing data and unsafe cash.
3. **Anti-gaming is broken.** No submitter≠reviewer enforcement; no proof-to-completion gate;
   no proof freshness; duplicate proof flagged-not-rejected.
4. **No workload reduction.** No approval memory, standing instructions, batch approval,
   recurring-work detection, or owner-time-saved accounting. The system *adds* read/triage work.
5. **No cross-module constraint enforcement at runtime.** Marketing/sales/growth can be
   recommended without runtime cash/capacity/quality/reputation gating (the checks exist as
   pure functions but are not called on the recommendation-promotion path).
6. **Self-evaluation loop not closed.** Rich outcome/attribution/learning models exist but no
   service feeds verified outcomes back into diagnosis, do-not-repeat blocking, or SOP/process
   mutation.

### Biggest false-confidence risks
- A command center that looks authoritative but rolls up **owner-typed, possibly stale**
  numbers with no prominent staleness warning, and serves advice even when gates are disabled.
- "Verification" routes that record a verification without proving the verifier is not the doer.
- Domain-training "responders" that *say* they block marketing on RED quality, but are a
  separate advisory layer not wired into the actual marketing/budget decision routes.
- Per-module "RUNTIME_PROVEN" CI labels that prove the *diagnostic* path, not the
  operating/anti-gaming/constraint-enforcement behaviors a real owner would rely on.

### Final classification
**OWNER_COMMAND_CENTER_PARTIAL** (see §20 for rationale).

---

## 2. REPO EVIDENCE SUMMARY

| Item | Value |
|---|---|
| Branch | `claude/opsiq-jarvis-360-audit-m8jro7` |
| HEAD | `cfc1aa6499a14ab5e03430945d15c66c981fb1bf` (`cfc1aa6`) |
| Working tree | **clean** (`git status --short` empty; `git diff --stat` empty) |
| Latest commits | PR #49 dynamic-budget working-capital UI; #48 archetype operational metrics; #47 WC×archetype; #46 archetype budget packs; #45 WC ageing |
| Remote | `origin` → proxied `arnab-netizen/OPsIq` |
| App stack | Next.js App Router (TS), Prisma + PostgreSQL (Neon/pg adapters), Zod, Vitest, Playwright, Stripe, Sentry |
| Prisma models | **182** models; **48** of them are Owner*`Snapshot/Cycle/Finding/Action/Verification` |
| Prisma migrations | **83** migration folders |
| API routes | ~270 `route.ts` (≈120 under `/api/owner/*`) |
| Pages | ~62 `page.tsx` (18 under `/owner/*`) |
| CI workflows | 60+; **23** are per-module `*-runtime-proof` / `*-db-verification` |
| Markdown reports | 415 `*.md` audit/forensic docs in repo root |

### Scripts of record
`test` = `vitest run`; `test:all` = `TEST_WITH_DB=true vitest run`; `test:ci` = single-worker;
`test:owner-real-world-smb` / `:simulation`; `db:migrate:*`; `governance:scan*`;
`audit:wrapped-handlers`; `validate:deployment`; `smoke:prod`.

### Tests / checks run during this audit
- **Static inspection**: extensive (routes, services, domain engines, Prisma schema, policy
  layer, proof FSM, gate services) — primary evidence base.
- **Local `vitest` / `prisma validate`**: **NOT successfully run.** The sandbox could not hold a
  complete dependency tree — `npm install` repeatedly failed with `ECONNRESET` to
  `registry.npmjs.org`, and on the attempts that populated `node_modules`, the
  `node_modules/.bin/vitest` and `prisma` binaries intermittently vanished between invocations.
  No clean local test run was obtained; **no green/red local test count is claimed here.**
- **DB-backed tests**: not runnable — no PostgreSQL is provisioned and `TEST_WITH_DB` paths
  require one.
- **Proof relied upon instead**: the repo's own CI (23 module runtime-proof/db-verification
  workflows) and git history of merge commits tagged `*_DB_PROVEN`, `*_RUNTIME_PROVEN`,
  `*_RBAC_RUNTIME_PARTIAL`. These are credible for the *diagnostic* paths but were authored by
  the same pipeline and do **not** cover the anti-gaming / constraint-enforcement gaps below.

> Honest limitation: proof levels marked `DB_BACKED_CI_PROVEN` rest on the repo's own CI labels
> and code reading, not on an independent local DB run during this audit.

---

## 3. CAPABILITY MATRIX

Proof levels use the prescribed ladder. "Risk" = what happens if an owner trusts it today.

| Capability | Required behavior | Proof level | Evidence paths | Missing pieces | Loopholes / blind spots | Owner risk | Upgrade | Priority | Tests required |
|---|---|---|---|---|---|---|---|---|---|
| **A. Owner Command Center** | Single decision-oriented cockpit; what to ignore; what OpsIQ handled; next best action | RUNTIME_WIRED_COMPLETE | `api/owner/command-center/route.ts`; `services/owner-condition/business-condition.service.ts`; `domain/owner-spine/contracts.ts buildBusinessConditionProfile`; `owner/home/page.tsx` | "What OpsIQ handled/prepared" trail; ignore-list; staleness banner | Survival/exec rollup is **max-based** (one bad domain dominates); stale cycles served silently | Acts on stale/older data; alert overload | Add handled-trail + staleness gate + ignore memory | P2 | E2E command-center with stale + multi-domain fixtures |
| **B. Owner Workload Reduction** | Approval memory, standing instructions, batch, recurring detection, auto-SOP, time-saved | DOCUMENTED_ONLY | workload *measured* in `owner-guidance/owner-now-view.service.ts`; approval in `services/approval/workflow.ts` | approval memory, standing instructions, batch, recurring detection, time-saved metric, auto-SOP | Approval unique key is `(operatorItemId, approverUserId)` — content change ⇒ re-ask; no standing rules | Owner re-approves repeatedly; OpsIQ adds work | Build approval-memory + standing-instruction + attention-budget engines | **P1** | Repeat-approval suppression; recurring-detection; time-saved accounting |
| **C. Business Profile/Context** | Per-business type, services, hours, staff, equipment, vendors, pricing, costs, risk tolerance, approved policies | DB_BACKED_LOCAL_ONLY | `OwnerBusiness` (sparse: name/type/location/currency/model); `BusinessConditionProfile` | services, hours, staff roles, equipment, vendor deps, pricing, cost structure, approved policies, risk tolerance | Profile is thin; most "context" is per-period snapshots | Generic advice; can't personalize constraints | Add `OwnerBusinessProfile` + policy/threshold store | P2 | Profile completeness + personalization |
| **D. Data Reliability / Input Sufficiency** | Classify verified/stale/conflicting/missing; **block** weak-data recs | RUNTIME_WIRED_PARTIAL | `OwnerInput*`/`OwnerDataProvenanceRecord`/`OwnerMissingDataFlag`; `domain/owner-mode/input-quality.ts`; gate `services/owner-mode/recommendation-input-quality.service.ts` | mandatory enforcement | **Gate default OFF** (`requireBusinessImpactAssessment===true` required); else no block | Confident advice on critical-missing data | Make gate default-on / opt-out with ack | **P1** | Gate-on-by-default; fail-closed matrix |
| **E. Goal Feasibility** | Tell owner a goal is unrealistic; safer milestone; required deltas | TYPE_ONLY | `domain/domain-training/feasibility-checker.ts` (pure); `domain/decision/scenario.ts` (types) | persistence, service, API, goal model | Not integrated into action creation | Owner pursues infeasible goals unchallenged | Wire feasibility into recommendation path; add goal model | P2 | Feasibility integration; infeasible-goal sims |
| **F. Finance/Budget/Profit Governance** | Capital-allocation governance, not just tracking | DB_BACKED_CI_PROVEN (tracking) / RUNTIME_WIRED_PARTIAL (blocking) | `domain/owner-budget/capital-allocation.ts`, `spend-governance.ts`, `mode-classifier.ts`, `working-capital-ageing.ts`; `services/owner-budget/*`; `domain/owner-finance/cash-safety-gate.ts` | mandatory cash gate; margin-floor block; live feeds | Cash-safety gate **opt-in**; discount-below-margin flagged-not-blocked; advisory actions ≠ persisted tasks; SoD spend = REQUIRE_APPROVAL not HOLD | Growth promoted while cash critical (gate off) | Make gate mandatory; margin-floor block; auto-persist actions | **P1** | Gate-default; margin-floor; growth-on-receivables |
| **G. Operations Mgmt** | Detect what needs action vs show activity | RUNTIME_WIRED_PARTIAL | `services/owner-operations/*`; `OwnerOperationsSnapshot` (staffHours, machineCapacityUnits, idleHours, deliveryFailures) | per-job/order entities; SLA tracking | Snapshot aggregates only; no order/job records | Can't act at job level | Add job/order entity if archetype needs | P3 | Per-order ops sims |
| **H. SOP & Checklist Lifecycle** | Generate→personalize→approve→version→deploy→proof→train→review→stale→archive | BACKEND_PARTIAL (diagnosis) / MISSING (lifecycle) | `domain/owner-sop/*` (execution-accountability diagnosis); `domain/execution/sop.ts` (`PersonalizedWorkflowInstance` type, unused) | SOP-document model, versioning, approval, deploy-to-task, training link, archive, stale-detection | `documentedSops` is a **count input**, not a managed doc; recommendations never become SOPs | "SOP created but never used"; no version control | Build SOP-document lifecycle entity + service | **P1** | SOP version/approve/deploy/stale sims |
| **I. Process Review/Continuous Improvement** | Process inventory each w/ owner, SOP, metric, failure trigger, cadence | MISSING | only `recurringProcesses`/`documentedSops` counts | ProcessInventory + ProcessReview entities | No process registry; diagnosis ≠ process review | No regular reviews; failures recur | Add process inventory + scheduled review | P2 | Process-review cadence sims |
| **J. Staff Training & Skills Matrix** | Observed-gap-based training; skills matrix; equipment authz; post-training measurement | DOCUMENTED_ONLY | generic `domain/domain-training/*`; `WorkspaceMembership` (designation, allowedTaskTypes only) | Skill/Training/Cert models; error→training trigger; effectiveness | No skills matrix; repeated failure triggers nothing | Untrained staff scale; no accountability | Add Staff/Skill/Training entities + triggers | **P1** | Observed-gap training; effectiveness sims |
| **K. Staff Performance/Accountability** | Repeated-mistake, gaming, rubber-stamping, collusion; classify staff vs process vs equip vs incentive | TYPE_ONLY | `domain/owner-budget/collusion.ts`; `domain/remote-operations/reliability.ts`; `domain/reality/human-factors-model.ts` (typed) | persistence; repeated-mistake loop; manager rubber-stamp detection | Collusion/reliability logic **not persisted/wired** | Bad accountability; blind to gaming | Persist + wire accountability signals | P2 | Collusion/rubber-stamp sims |
| **L. Equipment/Asset/Capacity** | Equipment list, capacity, downtime, utilization, bottleneck, ROI; **constrain decisions** | BACKEND_PARTIAL (capacity) / MISSING (equipment) | capacity: `OwnerCapacitySnapshot`, `domain/execution/capacity-ceiling.ts` | **no Equipment/Asset model**; growth never checks capacity at runtime | Utilization computed but advisory; growth ignores RED | Volume growth beyond capacity; equipment unmodeled | Add Equipment entity; capacity gate on growth | **P1** | Capacity-blocks-growth; equipment ROI |
| **M. Maintenance/Downtime** | Preventive maint, breakdown logs, downtime cost, capacity/customer impact | MISSING | none (only `idleHours` field) | all | Downtime causes invisible | Surprise breakdowns; missed promises | Add maintenance entity | P3 | Breakdown/downtime sims |
| **N. Quality Management** | Defect/rework/complaint rates, root cause, cost of poor quality; **block growth** | BACKEND_STUB | counts in snapshots; `domain/domain-training/domains/quality.ts` (advisory); `domain/execution/quality-assessment.ts` | defect/complaint logs; CoPQ; growth-block wiring | Quality "block" is in advisory training layer, not budget/growth routes | Scale while quality failing | Wire quality gate into growth/marketing | **P1** | Quality-blocks-growth |
| **O. Customer Intelligence/Retention** | Segment, LTV, margin, churn, unprofitable flag | TYPE_ONLY | `ClientAccount` (name/industry/size); sales snapshot counts (new/repeat/lost) | **no Customer entity w/ LTV/margin**; churn; unprofitable flag | Marketing can't target profitable customers | Chase unprofitable customers | Add Customer entity + economics | P2 | LTV/churn/unprofitable sims |
| **P. Reputation/Complaint** | Complaints, reviews, recovery, marketing-readiness gate | BACKEND_STUB | sales `complaints` count; `SALES_HIGH_COMPLAINT_RATIO` finding | complaint detail/root cause; review aggregation; growth gate | Marketing not blocked on weak reputation | Amplify a broken service | Add complaint entity + reputation gate | P2 | Reputation-blocks-marketing |
| **Q. Sales Pipeline/Opportunity** | Score, screen-for-profit, prepare proposal, follow-up, win/loss | RUNTIME_WIRED_COMPLETE (diagnosis) / TYPE_ONLY (scoring) / MISSING (proposal, win/loss) | `domain/owner-sales/*`; `LeadRecord`; `services/lead.ts`; `benchmark/growth-opportunity.service.ts scoreOpportunity` (uncalled) | per-deal scoring, proposal prep, win/loss reason | `estimatedValue` free-text, unchecked; scoring never called | Qualify on hope not math | Wire scoring; add proposal + win/loss | P2 | Per-deal scoring; proposal sims |
| **R. Contract/Quote/Proposal Guardrails** | Margin/cost/terms/credit/capacity/legal gates; reject bad deals | MISSING | margin fns in `domain/owner-finance/unit-economics.ts` (uncalled); **no Quote/Contract model** | all guardrails + entities | Owner can accept unprofitable contract | Win business that loses money | Add quote/contract guardrail engine | **P1** | Bad-B2B-contract sims |
| **S. Marketing Decision Engine** | Run-now gated by cash/capacity/quality/reputation; stop-loss | UI_ONLY (recs) | `domain/owner-marketing/*` | runtime gates; stop-loss; expected ROI | No cash/capacity/quality/reputation gate on recs | Burn cash on premature ads | Add constraint gate + stop-loss | **P1** | Marketing-despite-shortage |
| **T. Market/Competitor Intel** | Validated, date-stamped external research | DOCUMENTED_ONLY | `growth-opportunity.service.ts` type w/ citation fields; `validateGrowthOpportunity` uncalled | data collection; persistence; freshness | No real external research | False market confidence | Add validated research layer (later) | P3 | Source-validation sims |
| **U. Vendor/Supply Chain** | Pricing history, reliability, reorder, concentration, alternatives | BACKEND_PARTIAL | `VendorRecord` (bank/relatedParty); `OwnerSupplierInventorySnapshot` (stockout/risk) | pricing history, quality, alternatives, concentration | Snapshot only; no service populating it deterministically | Supply shocks unseen | Deepen vendor entity | P2 | Vendor-price-shock; stockout |
| **V. Compliance/Risk/Legal/Insurance** | Licences, permits, expiry, tax reserve, insurance, professional-review triggers | TYPE_ONLY | generic `Risk` model; COMPLIANCE_SENSITIVE routing in input-quality gate | licence/permit/insurance/tax models | Routing is aspirational; no compliance engine | Miss licence/insurance lapses | Add compliance entity + reminders | P2 | Expiry/insurance-gap sims |
| **W. Business Continuity/Crisis** | Owner absence, breakdown, cash crunch, recovery SOPs, contacts | MISSING | `BusinessConditionProfile` urgency/cashPressure; `services/founder-recovery/*` (recovery cycle) | crisis models, backup plans, recovery SOPs | No continuity orchestration | No survival plan under shock | Add continuity module (later) | P3 | Crisis sims |
| **X. Decision Arbitration** | Resolve conflicting recs; one decision + rejected + why | BACKEND_COMPLETE_NOT_UI | `services/governance/conflict-engine.ts`; `services/decision-core/best-path-selector.ts` (dominance proof, rejected paths) | urgency/reversibility in ranking; survival-first override; UI | Cash-feasible growth can beat cost-reduction; urgency/reversibility absent | Picks risky path under conflict | Add survival-first + urgency/reversibility | P2 | Arbitration conflict sims |
| **Y. Proof/Verification/Anti-Gaming** | Required proof, freshness, dedupe-reject, **submitter≠reviewer**, completion gate, outcome link | BACKEND_PARTIAL (FSM) / MISSING (SoD, gate, freshness) | `services/execution/proof.service.ts reviewProof`; `domain/execution/proof.ts` | SoD, proof-to-completion gate, freshness, dedupe-reject | **No submitter≠reviewer check (proof.service.ts:167–191)**; completion not proof-gated; old proof ok; duplicate flagged-not-rejected | Fake/self-approved completion | Enforce SoD + completion gate + freshness | **P1** | SoD, completion-gate, freshness, dedupe |
| **Z. Permissions/RBAC** | Server-enforced, audited, owner-only finance | RUNTIME_WIRED_COMPLETE | `lib/canonical-route-enforcement.ts`; `domain/workspace/guided-execution-permissions.ts` (owner-only set); `dashboard-access.ts` (recursive redaction); `policies/*` | invite/export/SOP-edit/pricing routes | Some owner-only perms have no wired route; assignment route not located | Mostly safe; some controls unreachable | Wire missing protected routes | P2 | Permission-matrix per route |
| **AA. Alert/Attention/Exception** | Classify ignore/monitor/delegate/auto/batch/owner; fatigue budget | BACKEND_PARTIAL | `services/alerts/alert-service.ts`; `services/governance/alerts.ts` (5 rules); notifications in-memory mock | classification, fatigue budget, false-alarm tracking | No per-owner rate-limit; notifications not DB-backed | Alert fatigue; ignored criticals | Add classification + attention budget | P2 | Alert-fatigue sims |
| **AB. Business Memory/KB** | Approved rules, thresholds, do-not-repeat, playbooks | DB_BACKED_LOCAL_ONLY | `OwnerDecisionMemory` (do_not_repeat etc.); `ThresholdConfig` | enforcement | Memories persisted but **not checked** before re-recommending | Repeats known-bad advice | Enforce do-not-repeat at promotion | P2 | Do-not-repeat enforcement |
| **AC. Case Study/Knowledge** | Applicability-checked SMB patterns | TYPE_ONLY | `CaseStudy`/`PublicDataset` models exist; benchmark services internal | applicability transfer | Internal calibration only | Generic playbooks | Defer | P3 | Applicability sims |
| **AD. External Research Validation** | Cite, date-stamp, freshness, applicability | MISSING/DOCUMENTED_ONLY | citation *types* only | real research + validation | No web research wired | Acts on stale/biased info | Defer until core loop solid | P3 | Research-validation sims |
| **AE. Scenario/Stress Test** | Best/base/worst, break-even, stop-loss, go/no-go | TYPE_ONLY | `domain/decision/scenario.ts` types; no service/API | service, persistence, API | Not generated for decisions | Unstressed major decisions | Add scenario service | P2 | Stress-test sims |
| **AF. Stop/Pause/Reject/Exit** | Say "no": stop campaign, reject client/contract, cut loss | RUNTIME_WIRED_PARTIAL | budget mode EMERGENCY/STABILIZE defers offensive; kill-rule text in `updated-plan.ts` | explicit reject/exit recommendations | Defers, doesn't actively reject; needs human review | Bad growth not stopped | Add explicit stop/reject engine | P2 | Missed-need-to-stop sims |
| **AG. Self-Evaluation** | Did rec work; profit/cash/workload impact; failure classification; update playbook | BACKEND_PARTIAL | `OwnerActionOutcome`, `OwnerFailureAdjudication`, `OwnerCausalAttribution`, `OwnerReassessmentEvent`, controlled-learning models; `outcome-core/outcome-auditor.ts` | learning loop service; do-not-repeat; playbook mutation | Models complete; **loop not closed at runtime** | Can't prove it helped; no improvement | Wire learning loop closure | **P1** | Loop-closure sims |

---

## 4. PRODUCT LAW COMPLIANCE

| Law | Verdict | Evidence | Risk | Required fix |
|---|---|---|---|---|
| **1 — Owner workload must reduce** | **FAIL** | Workload *measured* (`owner-now-view.service.ts`) but no approval memory / standing instructions / batch / recurring / time-saved | OpsIQ adds triage load; owner re-approves repeatedly | Build approval-memory + standing-instruction + attention-budget + recurring-automation |
| **2 — Owner final authority on material decisions** | **PARTIAL** | RBAC owner-only set real & server-enforced; `ApprovalRequest`; budget override governance | Threshold global (100k), no per-category; no real-time spend block; no multi-approver | Per-category thresholds; enforce at spend-entry; multi-approver for big decisions |
| **3 — No recommendation without business-reality check** | **PARTIAL/FAIL by default** | Cash-safety + input-quality gates exist (`cash-safety-gate.ts`, `input-quality.ts`) | **Gates default OFF**; marketing/sales lack runtime cash/capacity/quality gate | Default-on gates; wire constraint checks into all recommendation promotion |
| **4 — No false confidence** | **PARTIAL** | `decision-confidence/*`, `explanation/generate.ts` (drivers/assumptions/missingData), abstention engine | Confidence result omits explicit missing-evidence disclosure to owner; assumptions templated; stale data not surfaced | Disclose evidence-used/missing/assumptions/confidence in owner-facing output |
| **5 — No action without proof and outcome** | **FAIL** | Proof FSM, required-reason on reject, immutability (no PATCH) | **No submitter≠reviewer**; completion not proof-gated; no freshness; duplicate flagged-not-rejected | Enforce SoD + proof-to-completion gate + freshness + dedupe-reject |
| **6 — Growth must be profitable & fulfillable** | **PARTIAL/FAIL** | Capital allocation defers growth in defensive modes; archetype B2B margin blocks | No runtime capacity/quality/equipment gate on growth; cash gate opt-in; no contract guardrails | Mandatory growth gate across cash/margin/capacity/quality/equipment |
| **7 — SOPs/checklists/training are living systems** | **FAIL** | Execution-accountability diagnosis only; `documentedSops` is a count | No SOP-document, versioning, deploy-to-task, training link, archive, stale-detection | Build SOP-document lifecycle entity + service |
| **8 — Staff training observed-gap-based** | **FAIL** | Generic domain-training docs; membership has no skills | No skills matrix; no error→training trigger; no effectiveness | Add Staff/Skill/Training entities + observed-gap triggers + effectiveness |
| **9 — Equipment & capacity constrain decisions** | **PARTIAL/FAIL** | Capacity snapshot + ceiling computed | **No Equipment model**; capacity advisory, not a runtime gate | Add Equipment entity; capacity/equipment gate on growth/marketing/contract |
| **10 — OpsIQ must be self-auditing** | **PARTIAL** | Outcome/attribution/learning models + outcome-auditor | Loop not closed; no time-saved/profit-protected accounting; no playbook mutation | Close learning loop; measure its own impact |

---

## 5. FULL REAL-WORLD LOOP AUDIT (17 steps)

| # | Step | Status | Where / breakpoint |
|---|---|---|---|
| 1 | Owner inputs real data | **WIRED** | `file-intake`, `data-intake`, owner intake routes, manual snapshot entry |
| 2 | Validate data quality | **WIRED (partial)** | `data-quality`, `owner-mode/input-quality.ts` — but enforcement opt-in |
| 3 | Detect business reality | **WIRED** | per-domain diagnosis engines; `consulting-engine` |
| 4 | Identify top problem/opportunity | **WIRED** | deterministic finding/action ranking; spine rollup |
| 5 | Check cash/profit/staff/equipment/process/quality/compliance/owner-capacity | **PARTIAL** | finance/cashflow/capacity computed; **equipment/process/compliance absent**; checks not gating |
| 6 | Recommend do / don't | **WIRED** | recommendations + actions-to-avoid |
| 7 | Prepare SOP/checklist/training/report | **PARTIAL/BROKEN** | recommendations describe SOPs; no SOP/checklist/training artifact produced |
| 8 | Reduce workload via approved-rule reuse | **BROKEN** | no approval memory / standing-instruction / reuse |
| 9 | Route only material approvals | **PARTIAL** | RBAC + approval exist; thresholds coarse; re-ask possible |
| 10 | Assign / guide execution | **WIRED** | delegated-task FSM, employee guidance |
| 11 | Staff submits proof | **WIRED** | `api/proof/submit`, proof FSM |
| 12 | Verify proof + outcome | **BROKEN (gating)** | review works but **no SoD, no completion gate, no outcome link** |
| 13 | Detect gaming | **PARTIAL** | duplicate flagged (not rejected); collusion typed-only; **no SoD** |
| 14 | Update process/SOP/training/budget on failure | **BROKEN** | learning eligibility only; no auto-mutation |
| 15 | Measure business result | **PARTIAL** | outcome/profit-assessment models; not consistently closed |
| 16 | Self-evaluate | **PARTIAL** | rich models; loop not closed at runtime |
| 17 | Update next action | **BROKEN** | reassessment exists; no linked next-action chain from prior proof |

**Net:** the loop is solid from 1→6 and 9→11, but **breaks at 7, 8, 12, 13, 14, 16, 17** — i.e.
exactly the "operating co-pilot" half (artifact production, workload reduction, anti-gaming
verification, and closed-loop learning).

---

## 6. OWNER WORKLOAD AUDIT

- **Reduces load:** cross-domain rollup into one Business Condition Profile + single next
  action; deterministic ranking that caps to top-N; beginner explanations in Now-View.
- **Adds load:** every domain wants a period *snapshot* of many fields (owner data entry);
  guidance is advisory steps the owner must execute manually; alerts are not classified or
  budgeted.
- **Repeated approvals:** approval uniqueness is `(operatorItemId, approverUserId)` — a content
  change or different requester can re-prompt; no content-hash memory.
- **Missing automation:** auto-SOP/checklist/report generation; recurring-work detection;
  standing instructions; batch approval; exception-only mode.
- **Missing attention budget:** no per-owner alert cap, no false-alarm tracking, no time-saved
  accounting.
- **Missing approval memory:** approvals are per-item, not remembered as reusable rules.
- **Missing reusable-workflow logic:** `PersonalizedWorkflowInstance` exists as a type but is
  never persisted/reused.

---

## 7. STAFF TRAINING AUDIT

- **Generic vs observed-gap:** entirely **generic** (`domain/domain-training/*` = what the owner
  should learn, not staff-gap-driven). No error/complaint/rework → training trigger.
- **Skills matrix:** **absent** — `WorkspaceMembership` has only `designation`,
  `allowedTaskTypes`, `authorityLimits`; no skills/certs/training history.
- **Process/equipment link:** absent — no equipment-authorization-by-training.
- **Effectiveness proof:** absent — no post-training performance measurement.
- **Missing tests:** observed-gap training, effectiveness re-check, equipment authz.

---

## 8. PROCESS / SOP AUDIT

- **SOP creation:** only as diagnosis recommendations ("turn failure into an SOP"); no document
  is created.
- **Personalization:** `PersonalizedWorkflowInstance` type exists, **not persisted/wired**.
- **Lifecycle / versioning / effective-date / deploy-to-task / archive:** **all missing.**
- **Proof linkage:** proof-requirement fields exist as types; not mapped to SOP records.
- **Failure review:** repeated failure is *detected* in next diagnosis but triggers no SOP
  review/escalation automation.
- **Stale detection:** only a data-confidence penalty for >45-day snapshots — not an
  operational review trigger.
- **Owner approval model:** no SOP-level approve/version state; actions move to "assigned"
  without formal SOP approval.
- **Process inventory:** **missing** — only `recurringProcesses`/`documentedSops` counts.

---

## 9. EQUIPMENT / CAPACITY AUDIT

- **Equipment model:** **MISSING** (no Equipment/Asset/Maintenance models).
- **Rated/practical capacity, utilization, bottleneck:** present as **capacity snapshot** +
  `capacity-ceiling.ts` (computed), and `OwnerEmployeeWorkloadSnapshot`.
- **Maintenance/downtime:** **MISSING** (only an `idleHours` field).
- **Decision constraints:** capacity is **advisory** — no growth/marketing/contract/hiring/
  budget route consults the capacity ceiling before recommending. The domain-training quality/
  capacity "responders" that claim to block are a separate advisory layer, not wired into the
  budget/growth decision path.
- **Missing gates:** capacity-blocks-growth, equipment-ROI-before-purchase, downtime-buffer
  before accepting B2B volume.

---

## 10. FINANCE / PROFIT / GOVERNANCE AUDIT

- **Budget tracking vs capital allocation:** genuine capital-allocation **governance** exists
  (`capital-allocation.ts` priority hierarchy, mode classifier, working-capital ageing, spend
  governance with split-spend/self-approval/vendor-bank detection) — this is the strongest part
  of the repo and is CI-proven for the diagnostic path.
- **Margin guardrails:** margin/min-price functions exist (`owner-finance/unit-economics.ts`)
  but are **not called** on recommendation/discount promotion → discount-below-margin is flagged
  not blocked.
- **Customer/contract/service profitability:** service-line metrics partial; **no per-customer
  or per-contract profitability** (no Customer/Contract entity).
- **Cash safety:** runway/survival-state computed and CI-proven; **but the hard cash-safety gate
  is opt-in (default off).**
- **Growth affordability:** capital allocation defers offensive spend in defensive modes (good),
  but override can bypass without mandatory finance re-check, and live feeds are not connected.
- **Stop-loss rules:** present as kill-rule *text* and mode deferral; not enforced as automatic
  stop.

---

## 11. MARKETING / OPPORTUNITY AUDIT

- **Local research support:** none real (types only).
- **Opportunity scoring:** generic `scoreOpportunity`/`filterByConstraints` exist but are
  **never called**; sales leads carry unchecked free-text `estimatedValue`.
- **Proposal/application support:** **missing** (no Quote/Contract/Proposal entity).
- **Channel decision logic:** marketing diagnosis emits recs but **no cash/capacity/quality/
  reputation gate** and **no stop-loss**.
- **ROI/stop-loss:** missing.
- **Capacity/profit gating:** missing on the recommendation path.

---

## 12. ANTI-GAMING / PROOF AUDIT

- **Fake-completion risk:** **HIGH.** Task completion is **not gated** on accepted proof
  (`isProofClearedForCompletion` exists but is not enforced at the approval boundary).
- **Proof adequacy:** type/required-field validation is solid; immutability is solid (no PATCH).
- **Manager collusion / self-review:** **submitter≠reviewer is NOT enforced**
  (`services/execution/proof.service.ts reviewProof` records `reviewedByUserId = actorId`
  without comparing to `submittedByUserId`). A manager can submit-by-proxy and approve.
- **Role separation:** RBAC separates *who can review*, but not *that the reviewer is not the
  doer*.
- **Outcome verification:** no deterministic proof-status→outcome-finality link.
- **Freshness / dedupe:** no freshness check; duplicates flagged but not rejected.

---

## 13. COMPLIANCE / RISK AUDIT

- **Legal/tax/professional boundaries:** input-quality gate routes COMPLIANCE_SENSITIVE recs to
  "professional review" — but there is **no underlying compliance engine** (no licence/permit/
  insurance/tax models). The routing is aspirational.
- **Insurance/safety/licence reminders:** **missing.**
- **Contract risk:** **missing** (no contract entity).
- **Data privacy:** controlled-learning has privacy/consent models (good for the learning layer)
  but no business-data-privacy/PII handling for owner records beyond workspace isolation.

---

## 14. DECISION ARBITRATION AUDIT

- **Conflicting recs resolved:** yes — `conflict-engine.ts` detects resource/KPI/priority
  conflicts; `best-path-selector.ts` produces one selected path + rejected alternatives + a
  dominance proof vs runner-up. This is a real strength (BACKEND_COMPLETE_NOT_UI).
- **Prioritization rules:** priority_score → expected_value → ROI with feasibility filters.
- **Gaps:** **urgency and reversibility are not modeled** in ranking; no explicit
  survival-first override (cash-feasible growth can outrank cost-reduction); not surfaced in UI;
  ESCALATE conflicts have no wired escalation route.

---

## 15. SELF-EVALUATION AUDIT

- **Measures recommendation quality:** models exist (`OwnerActionOutcome`,
  `OwnerFailureAdjudication` with rich failure classes, `OwnerCausalAttribution`,
  `OwnerReassessmentEvent`, controlled-learning candidate/admission/rollback/harm).
- **Owner time saved / profit / cash / customer / process impact:** **not measured.**
- **Failed-recommendation classification:** modeled (wrong_diagnosis/priority/action/timing/
  assumption/execution/external/insufficient-evidence/owner-conflict/safety) — **but no service
  closes the loop** by feeding this back into diagnosis, do-not-repeat blocking, or playbook
  mutation.
- **Net:** OpsIQ can *describe* whether it helped in data structures, but cannot currently
  *prove* it helped or *improve itself* automatically.

---

## 16. ADVERSARIAL SIMULATION GAP LIST

Existing hostile coverage is genuinely substantial (≈21/40 scenarios): budget hostile pack
(`tests/fixtures/owner-mode/budget-hostile-scenarios.ts`), owner-guidance adversarial sims,
adversarial signals, 12 real-world SMB cases, historical-failure validation runs (Go First,
Byju's, Supertech, JCPenney), and a hostile E2E audit. Revenue-up-profit-down,
discount-kills-margin, scale-too-early, complaints-rising, stockout-blocks-growth,
proof-overdue, workspace-isolation, compliance-routing are covered.

**Missing hostile tests (priority order):**
1. **Submitter==reviewer self-approval** (proof SoD) — *critical*
2. **Task completed without accepted proof** (completion gate) — *critical*
3. **Backdated / stale proof acceptance** — *critical*
4. **Reused proof across tasks rejected** (dedupe) — high
5. **Marketing recommended despite capacity/quality/reputation RED at runtime** — high
6. **Growth promoted while cash-safety gate OFF** (default-off exposure) — high
7. **Equipment bottleneck/breakdown blocks volume growth** — high
8. **Bad contract: cash-cycle damage despite profit** — high
9. **Training did not improve outcome → retraining trigger** — medium
10. **SOP created but never used / checklist completed but quality failed** — medium
11. **Vendor price shock / late receivables collection** — medium
12. **Alert fatigue / too many alerts capping** — medium
13. **Do-not-repeat memory blocks a re-recommendation** — medium
14. **Owner workload increased by a recommendation** (load regression) — medium

---

## 17. IMPLEMENTATION ROADMAP

Ordered to avoid breaking existing Owner Mode and to avoid duplicate engines. Reuse the
existing spine (`owner-spine/contracts`), the canonical route enforcement, the audit helper,
the policy/capability layer, and the existing diagnosis services — **do not** fork new
execution/confidence/audit engines.

### Slice 0 — Safety/readiness prerequisites
- **Goal:** make existing guardrails actually fire by default.
- **Addresses:** gates opt-in (D, F, Law 3/4/6).
- **Files:** `services/owner-mode/recommendation-input-quality.service.ts`,
  `services/owner-finance/recommendation-cash-safety.service.ts`,
  `services/business-impact/*` (flip default; add explicit opt-out + audit).
- **DB:** add workspace flag default / migration for `requireBusinessImpactAssessment`.
- **Tests:** gate-default-on; fail-closed matrix.
- **Risk:** may surface previously-silent blocks → stage behind a migration + audit event.
- **Done:** weak-data/unsafe-cash recs are blocked unless explicitly overridden with reason.
- **Do not touch:** existing diagnosis math, RBAC.

### Slice 1 — Capability inventory stabilization
- **Goal:** single source-of-truth registry mapping each capability → proof level → wired route.
- **Addresses:** false-confidence (§18).
- **Files:** new `docs/` registry + a `governance:scan` extension (no source behavior change).
- **Done:** CI asserts each "owner-facing" capability has a wired route + test.

### Slice 2 — Owner command center gap closure
- **Goal:** add "what OpsIQ handled/prepared", ignore-memory, prominent staleness banner; fix
  max-based rollup blind spot.
- **Files:** `business-condition.service.ts`, `owner/home` + `now` pages, spine contracts.
- **Tests:** stale + multi-domain rollup E2E.

### Slice 3 — Owner load reduction / approval memory  *(P1)*
- **Goal:** approval memory (content-hash), standing instructions, batch approval,
  exception-only escalation, recurring-work detection, owner time-saved accounting, attention
  budget.
- **DB:** `OwnerStandingInstruction`, `OwnerApprovedRule`, approval content-hash, attention-budget
  counters.
- **Files:** `services/approval/*`, alerts classification.
- **Tests:** repeat-approval suppression; recurring detection; time-saved.

### Slice 4 — Data reliability / input sufficiency  *(P1, depends on Slice 0)*
- **Goal:** mandatory enforcement + owner-facing evidence/missing/assumptions/confidence
  disclosure; wire abstention engine into owner recommendation promotion (it is already wired
  into the consulting path via `consulting-safety-adapter.ts`).
- **Files:** `decision-confidence/*`, `explanation/generate.ts`, `governance/abstention-engine.ts`.

### Slice 5 — Finance/profit/cash guardrails  *(P1)*
- **Goal:** margin-floor block on discounts; auto-persist advisory actions as governed tasks;
  growth-on-receivables gate at spend entry.
- **Files:** `owner-budget/spend-governance.ts`, `owner-finance/unit-economics.ts` call sites.

### Slice 6 — SOP/checklist lifecycle  *(P1)*
- **Goal:** first-class SOP-document entity: generate→personalize→approve→version→deploy-to-
  recurring-task→proof-map→archive→stale-detect.
- **DB:** `OwnerSopDocument`, `OwnerSopVersion`, `OwnerChecklist`, `OwnerChecklistItem`,
  link to `ScheduledTask`.
- **Note:** keep the existing `owner-sop` *execution-accountability* diagnosis — it stays as the
  measurement layer feeding the new lifecycle.

### Slice 7 — Staff training / skills matrix  *(P1)*
- **DB:** `Staff`, `Skill`, `StaffSkill`, `TrainingRecord`, `EquipmentAuthorization`.
- **Goal:** observed-gap triggers (error/complaint/rework → training), effectiveness re-check,
  equipment-authz-by-training.

### Slice 8 — Process review / continuous improvement
- **DB:** `ProcessInventory`, `ProcessReview` (owner, SOP, metric, failure-trigger, cadence).

### Slice 9 — Equipment / capacity / maintenance  *(P1)*
- **DB:** `Equipment`, `MaintenanceRecord`, `DowntimeEvent`.
- **Goal:** capacity/equipment **gate** on growth/marketing/contract/hiring; equipment ROI.

### Slice 10 — Guided execution / proof / anti-gaming  *(P1, critical)*
- **Goal:** enforce **submitter≠reviewer**; **proof-to-completion gate**; proof freshness;
  duplicate-proof rejection; outcome-link.
- **Files:** `services/execution/proof.service.ts`, `domain/execution/proof.ts`,
  task-transition/approval service, `services/routes/guided-execution-handlers.ts`.
- **Tests:** SoD, completion-gate, freshness, dedupe, owner-self-review.

### Slice 11 — Decision arbitration
- **Goal:** add urgency + reversibility + survival-first override to `best-path-selector.ts`;
  wire ESCALATE conflicts to owner.

### Slice 12 — Marketing/opportunity/contract guardrails  *(P1)*
- **Goal:** runtime cash/capacity/quality/reputation gate + stop-loss on marketing; per-deal
  scoring; Quote/Contract guardrail engine; win/loss tracking.
- **DB:** `Quote`, `Contract`, `OpportunityScore`.

### Slice 13 — Customer/reputation/vendor/compliance
- **DB:** `Customer` (LTV/margin/churn/unprofitable), `Complaint`, deepen `VendorRecord`,
  `LicenceRecord`/`InsurancePolicy`/`ComplianceItem`.

### Slice 14 — Self-evaluation / business memory  *(P1)*
- **Goal:** close the learning loop — service that consumes `OwnerActionOutcome`/
  adjudication/attribution, enforces do-not-repeat, mutates playbooks, and accounts owner
  time-saved + profit/cash protected.

### Slice 15 — Adversarial simulations + Playwright E2E
- Add the 14 missing hostile sims (§16) + owner-flow E2E.

### Slice 16 — Controlled real-business pilot readiness
- Only after Slices 0,3,4,5,6,7,9,10,12,14 are E2E + adversarial-proven.

**What not to touch (any slice):** auth, workspace isolation, audit helper, canonical route
enforcement, the proof FSM contract, the spine rollup contract, existing migrations — extend,
don't fork. No duplicate execution/confidence/audit engines.

---

## 18. RED FLAGS (false-capability beliefs an owner could form)

1. **"My SOPs are managed."** They are not — `documentedSops` is a number; recommendations to
   "create an SOP" never produce or version a document.
2. **"Staff completion is verified."** Completion is not gated on accepted proof, and the
   verifier can be the doer (no SoD).
3. **"OpsIQ won't let me grow recklessly."** Cash-safety/capacity/quality gates are advisory or
   opt-in; default deployments don't block.
4. **"It checks data quality before advising."** Only if the workspace enabled the gate.
5. **"It tracks my equipment and capacity."** Capacity is a snapshot metric; there is no
   equipment registry and capacity does not gate decisions.
6. **"It manages my customers/vendors/complaints."** Only aggregate counts + a thin
   `VendorRecord`; no customer economics, no complaint records.
7. **"It learns from outcomes."** Outcome/learning data structures exist; the loop is not closed.
8. **"RUNTIME_PROVEN in CI means the feature is owner-ready."** It proves the *diagnostic* route,
   not anti-gaming/constraint-enforcement/operating behavior.
9. **"Quality RED blocks marketing."** That logic lives in an advisory training responder, not
   in the marketing/budget decision route.
10. **"Verification means an independent check."** It records a verification row; independence is
    not enforced.

---

## 19. DO-NOT-BUILD-YET (freeze until owner-mode proof exists)

- Public SaaS onboarding / self-serve signup at scale
- Billing/subscription expansion beyond what exists
- Product Hunt / public launch / marketing site polish
- Broad external integrations (POS/bank/accounting live feeds) — *except* a single read-only
  pilot feed once the core loop is gated
- Cross-user / collective learning rollout to production owners
- Uncontrolled AI autonomy (auto-execute without owner approval)
- More business archetypes beyond laundry + housekeeping (don't dilute depth)
- Advanced forecasting / scenario ML before the core verify-and-gate loop is closed
- External web-research engine before research validation + applicability is built

---

## 20. FINAL CLASSIFICATION

### **OWNER_COMMAND_CENTER_PARTIAL**

**Rationale.** The repo is well past a foundation: 11 owner domains are DB-backed with CI
runtime-proof/db-verification, a real cross-domain command center is wired behind enforced
auth + workspace isolation, capital-allocation governance and a proof FSM and decision
arbitration are genuinely implemented, and there is substantial adversarial test scaffolding.
That is a *partial owner command center* that diagnoses and guides well.

It is **not** an operating co-pilot, so it sits below
`OWNER_OPERATING_COPILOT_READY_FOR_SIMULATION`: the operating half of the loop is broken or
opt-in — no operational entity layer (equipment/staff-skill/SOP-document/customer/process),
guardrails default-off, anti-gaming without separation-of-duty or a proof-to-completion gate,
no workload-reduction automation, and a self-evaluation loop that is modeled but not closed.
Until Slices 0, 3, 4, 5, 6, 7, 9, 10, 12, 14 land and are adversarially proven, an owner relying
on it for *action and verification* (not just *diagnosis*) faces real false-confidence and
fake-completion risk.

**Uncertainty noted:** local `vitest`/`prisma` could not be run in this sandbox (network/disk
instability), so DB-proven claims rest on the repo's own CI and code reading rather than an
independent local run. Task-assignment route enforcement and a few owner-only protected routes
(SOP-edit, pricing, invite, export) could not be fully located and are flagged uncertain.

---

*End of audit. No source, tests, or workflows were modified. No PR opened.*
