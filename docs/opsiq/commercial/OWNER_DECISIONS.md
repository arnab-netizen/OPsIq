# Paywall owner decisions (nothing here is decided by engineering)

> `PRODUCTION_PAYMENT_GATE_ENABLED=NO` · `BILLING_PAYWALL_ENFORCEMENT_PRODUCTION=OFF` · `MERGE_AUTHORIZED=NO`

Reachability matters: a self-serve owner (workspace membership role `owner`) is narrowed to `OWNER_VIEW/OWNER_MANAGE/OWNER_ONBOARD/SOP_MANAGE`, `USER_VIEW` and file capabilities (`src/policies/capability-check.ts`). Of the 28 pending handlers, **13 are reachable by a self-serve owner and 15 need consulting-firm capabilities** (`ENGAGEMENT_*`, `CONSULTING_*`, `RECOMMENDATION_CREATE`, `DECISION_CREATE`, `DIAGNOSIS_READ`, `ACTION_*`, `INTEGRATION_MANAGE`) that an owner does not hold. Computed by `getCapabilitiesForRole("admin_or_portfolio_manager","owner")` against each route's declared capabilities.

Count note: the earlier "26" are handlers classed CLASSIFICATION_REQUIRES_DECISION by tracing; two more, `POST /api/diagnosis` and `POST /api/owner/startup/sessions/[sessionId]/analysis`, were free-first-value routes that are unmetered on repeat and so were also left pending. The union is **28 distinct handlers**. Three of the five open bypasses are inside the 26; two are the extra ones.

## 1. The five open bypasses

| ID | Route | Reachable by self-serve owner |
|---|---|---|
| OD1 | `POST /api/consulting/engagements` | no (`CONSULTING_WRITE`) |
| OD2 | `POST /api/diagnosis` | no (`ENGAGEMENT_CREATE`) |
| OD3 | `POST /api/opsiq/consulting-engine/run` | no (`RECOMMENDATION_CREATE`) |
| OD4 | `POST /api/owner/budget/spend` | yes (`OWNER_MANAGE`) |
| OD5 | `POST /api/owner/startup/sessions/[sessionId]/analysis` | yes (`OWNER_MANAGE`) |

**OD1: `POST /api/consulting/engagements` (multiplexed by `?action=`).** Creates an engagement; advances phase; creates findings; generates a recommendation (`recommendation.create`); assigns actions; closes; updates health and dimensions. Value: a consultant-run intervention loop. Ungated because it is the consulting-firm workbench, outside the owner Pro contract, and its first-versus-later split is undefined. Decision: is the consulting workbench inside the owner paywall at all? FREE: consultants run unlimited loops with no subscription (as today). PAID: a consultant seat would need an entitled workspace, and a per-action split is required because a route-level gate would also block the free actions (`create`, `create_finding`). Recommended: **NON_COMMERCIAL** (staff surface; commercial terms for consulting seats are a separate decision), guarded by a test that the owner-narrowed bundle cannot reach it. No schema change.

**OD2: `POST /api/diagnosis`.** Quick diagnosis: creates a client, an engagement, findings, recommendations and a draft action; every call has a unique title so nothing caps repeats. Value: a full diagnosis plus recommendation. Ungated because it is a legacy consulting-engagement path, not one of the eight owner cycle tables, so the first-diagnosis invariant does not see it. Decision: is this path part of the owner's single free diagnosis? FREE: unlimited consultant diagnoses, and the owner path is unreachable anyway. PAID: needs a separate allowance counter over engagements (no schema change: count `engagements` per workspace under the same advisory lock). Recommended: **NON_COMMERCIAL** with the staff-only guard test; if consulting is later brought inside the paywall, count engagements into the same workspace allowance. No schema change.

**OD3: `POST /api/opsiq/consulting-engine/run`.** Runs the consulting pipeline: decision memo, recommendations and actions, with decision-engine usage metering. Value: subsequent recommendations. Ungated because it cannot tell a first run from a later one and sits behind a plan-quota check, not a commercial gate. Decision: same as OD1. FREE or PAID consequences as OD1; `/api/execute` follows the same answer. Recommended: **NON_COMMERCIAL** (staff). No schema change.

**OD4: `POST /api/owner/budget/spend`.** Records a spend entry (idempotent), then synchronously runs `reassessBudget`: new plan snapshot, a reassessment, and `syncBudgetActions` creating actions. Value: a reassessment and new prioritised actions (continuation). Ungated because the write is also plain data entry. Decision: is spend entry free capture with only the reassessment paid, or is the whole write paid after the first diagnosis? FREE: an unpaid owner gets unlimited reassessment and new actions by logging spend, which defeats the boundary. PAID (whole route): an unpaid owner cannot log spend at all after the first diagnosis, which blocks data entry. Recommended: **capture FREE, reassessment PAID**: record the spend entry, and when not entitled skip `reassessBudget` and return the entry with a "reassessment needs a subscription" marker. The sibling routes `budget/authority` and `budget/override` are already gated. No schema change.

**OD5: `POST /api/owner/startup/sessions/[sessionId]/analysis`.** Dispatcher: SCREEN, GENERATE_HYPOTHESES, BUILD_ECONOMIC_MODEL, ASSESS_READINESS, RECORD_HYPOTHESIS_RESULT, BUILD_SYSTEM_RECOMMENDATION; writes screenings, models and system recommendations. Value: startup-mode diagnosis and recommendations, repeatable. Ungated because Startup Mode keeps its own ledger outside the eight cycle tables, so the invariant cannot meter it. Decision: does the first startup analysis consume the workspace's single free diagnosis (shared allowance) or is it a separate allowance? FREE: unlimited startup analyses without a subscription. PAID: first free, later runs paid. Recommended: **one shared allowance per workspace**; first startup analysis free (counted into the same advisory-locked check by also counting startup analysis rows), later runs `PAID_CONTINUATION`; `RECORD_HYPOTHESIS_RESULT` as data capture stays free. No schema change (count existing analysis rows).

## 2. The 28 pending handlers reduced to six product decisions

| # | Decision | Handlers | Behaviour today | Value created | Recommended class | Why | Real bypass if left undecided? | Blocks dormant merge | Blocks activation |
|---|---|---|---|---|---|---|---|---|---|
| PD-1 | Is the consulting-firm workbench inside the owner paywall? | 15, staff-only: `consulting/engagements`, `diagnosis`, `opsiq/consulting-engine/run`, `decisions/create`, `diagnosis/{archetype,bottleneck,maturity,root-cause}`, `engagements/[id]/constraint-checks`, `growth/pricing-tiers/[id]/approve`, `GET intelligence/recommendations`, `GET intelligence/summary`, `scenario`, `complaint-rework`, `owner/integration-events` | Capability-guarded only; owners cannot reach them | Consultant diagnoses, recommendations, decisions | NON_COMMERCIAL for the owner paywall | They need capabilities a self-serve owner lacks; owner Pro is the product | Not for owners today; yes if a membership ever mixes roles | NO | YES until classified (add the staff-only guard test) |
| PD-2 | Stateless calculators | 4: `guardrails/screen`, `tender/screen`, `tender/application-pack`, `vendor/assess` | Compute from caller-supplied numbers; at most an audit event | A go/no-go number; no workspace evidence, no persisted loop state | FREE_FOUNDATION | Not diagnosis or recommendation of the owner's own data | No | NO | YES (confirm) |
| PD-3 | Do approvals outside the diagnosis loop count as "governed approvals"? | 3: `vendor/[id]/approve`, `vendor/[id]/suspend`, `procurement/purchase-orders/[id]/transition` | Status transitions on vendor/PO records | Governance state | `approve`/`transition`: PAID_CONTINUATION; `suspend`: FREE_FOUNDATION | Resolving approvals is paid by contract; suspending is risk-reducing and should never be blocked | Yes: unlimited approvals without a subscription | NO | YES |
| PD-4 | Split capture from transition on multiplexed owner routes | 3: `constraints` POST, `sop-intelligence` POST and PATCH | One handler: create and resolve/complete | Constraint resolution, SOP training completion | Capture/assign: FREE_FOUNDATION; accept/resolve/complete: PAID_CONTINUATION | Capture is data entry; transitions continue the loop | Yes, for the transitions | NO | YES |
| PD-5 | Startup Mode allowance (OD5) plus `arbitrate` | 2: `startup/.../analysis`, `startup/.../arbitrate` | Unmetered repeats | Ranked ideas, analysis | First free, later PAID_CONTINUATION, shared workspace allowance | Same contract as other modes | Yes | NO | YES |
| PD-6 | Budget spend (OD4) | 1: `budget/spend` | Spend entry plus synchronous reassessment | Plan snapshot, actions | Capture FREE_FOUNDATION; reassessment PAID_CONTINUATION | See OD4 | Yes | NO | YES |

Also owner-level, not a handler class: **allowance scope and size** (one free diagnosis per workspace is implemented; per business or per domain would change `workspaceHasDiagnosis`).

Total owner decisions: PD-1 to PD-6, allowance scope, grandfathering of existing beta workspaces, and the final price: **9**. Paddle live approval is external and separate.

## 3. `RELEASE_BLOCKERS.json` (verbatim, in file order; the file is not edited)

| BLOCKER_ID | Exact text | QUESTION | WHY_REQUIRED | RECOMMENDED_DECISION | WHAT_CHANGES_IF_ACCEPTED | Blocks dormant merge | Blocks activation |
|---|---|---|---|---|---|---|---|
| RB1 | `PRE_GO_LIVE_OWNER_DECISION_REQUIRED: allowance scope and size (per workspace implemented)` | Is one free diagnosis per workspace right, and is a diagnosis in any domain the one? | The free allowance defines what "first diagnosis free" means; a second business or domain must not mint another | Keep one per workspace, any domain, shared with Startup Mode | Nothing changes in code; record the decision and clear the item. Per business or per domain would change `workspaceHasDiagnosis` and its tests | NO | YES |
| RB2 | `PRE_GO_LIVE_OWNER_DECISION_REQUIRED: classification of the 26 CLASSIFICATION_REQUIRES_DECISION handlers and 5 unenforced HIGH bypasses (PAYWALL_BOUNDARY.md sections 5 and 7)` | PD-1 to PD-6 above | Until classified, 5 bypass candidates are unenforced and 28 handlers have no stated class | PD-1 NON_COMMERCIAL; PD-2 free; PD-3 approve paid / suspend free; PD-4 and PD-6 split; PD-5 shared allowance | Registry entries move from `decision-pending` to their class; paid ones gain `requireCommercial` or a service gate; coverage test updated. No schema change | NO | YES |
| RB3 | `PRE_GO_LIVE_OWNER_DECISION_REQUIRED: grandfathering or exemption of existing OPEN_BETA workspaces` | Do existing beta workspaces keep free access, get a trial, or follow the same wall? | The gate has no implicit grandfathering; a workspace with any diagnosis and no subscription is denied on its next continuation step | Decide per audit result (`paywall-beta-audit.mjs`); any exemption needs an explicit, auditable mechanism that does not exist yet | If exemption is chosen, a new governed record or flag must be built (schema change likely); if not, nothing changes | NO | YES |
| RB4 | `PRE_GO_LIVE_OWNER_DECISION_REQUIRED: final launch price (public-pricing.ts) and live Paddle price/plan seed` | What is the launch price? | `PUBLIC_PRICE_DISPLAY` is null; the sandbox price is test data; the live Paddle price and the Plan seed must match it | Owner-set | Set `PUBLIC_PRICE_DISPLAY`, create the live Paddle price, seed the Plan, set `PADDLE_PRICE_ID` | NO | YES |

Clearing a blocker is a reviewed commit by the owner after deciding; the enable tool refuses while `open` is non-empty.

## 4. Existing OPEN_BETA workspaces (code and data-model analysis; no Production reads)

`IMPLICIT_GRANDFATHERING=NO`. Entitlement is computed from the persisted subscription only (`resolveAccess`); the free diagnosis from the existence of cycle rows only. Nothing consults `Workspace.signupSource`, the beta cohort, platform beta settings or account age. The old comment about the CB1-001 trial describes the switch being off, not an exemption.

If enforcement were enabled, for a workspace with:

| State | First diagnosis | Next diagnosis / re-diagnosis | Continuation steps (execution, approvals, outcomes, reassessment) | Reads, billing, auth, account |
|---|---|---|---|---|
| zero cycles, no subscription | allowed | n/a | denied (402), including before any diagnosis | allowed |
| one cycle, no subscription | used | denied | denied | allowed |
| several cycles, no subscription (beta history) | used | denied | denied; no retroactive allowance | allowed |
| active subscription (also a scheduled cancellation until period end) | allowed | allowed | allowed | allowed |
| past_due inside the 7-day grace | allowed | allowed | allowed until grace ends | allowed |
| past_due after grace, paused, canceled | allowed only if no cycle exists | denied | denied | allowed |

`EXISTING_BETA_USER_OWNER_DECISION_REQUIRED=YES`. The read-only `scripts/release/paywall-beta-audit.mjs` gives the counts when the owner runs it with read access; it was exercised here only against the local throwaway database.
