# Paywall owner decisions (resolved by the owner; implemented, not invented, by engineering)

> `PRODUCTION_PAYMENT_GATE_ENABLED=NO` · `BILLING_PAYWALL_ENFORCEMENT_PRODUCTION=OFF` · `MERGE_AUTHORIZED=NO`

This file records the owner's commercial decisions and where each is enforced. Nothing here activates the paywall. Still open: **RB4** (final launch price and live Paddle product/price/Plan seed), **Preview enforcement-ON acceptance** (unproven), and **Paddle Live account/domain approval** (external). The enable tool refuses while `RELEASE_BLOCKERS.json` lists them.

## 1. Policy

| Decision | Resolved policy | Enforced in |
|---|---|---|
| Free allowance | **One free diagnosis per workspace**; workspace-scoped, not per business, domain or module; shared by the owner diagnosis domains and Startup Mode; whichever qualifying diagnosis or **Startup diagnostic session** begins first holds it; reads of it stay available | `assertDiagnosisAllowance` in the 8 cycle writers; `assertStartupAnalysisAllowance` in the 5 Startup writers and arbitration; one advisory lock |
| Existing OPEN_BETA workspaces | **No implicit or permanent grandfathering.** Enforcement OFF: nothing changes. ON: same rules as new workspaces; existing diagnosis history counts as the free diagnosis; unpaid owners can still read it and use account, auth, billing, support and data-safety functions; no free subscription is created; no data removed; no exemption schema | no code path consults signup source or account age |
| Price | **Undecided.** The sandbox `$10` is test data and is not used anywhere | `PUBLIC_PRICE_DISPLAY` stays `null` |
| Public `/agency` | `NON_COMMERCIAL_PUBLIC_ACQUISITION`: public, no subscription, no workspace allowance, no persisted owner-loop state | `commercial-public-acquisition.test.tsx` asserts no db/auth/billing/network/storage code |

## 2. The five formerly open bypasses

| ID | Route | Decision | Enforcement |
|---|---|---|---|
| OD1 | `POST /api/consulting/engagements` | NON_COMMERCIAL for the owner paywall (consulting/staff workbench; needs `CONSULTING_WRITE`) | `staff-only-guard`: test proves the self-serve owner bundle cannot reach it |
| OD2 | `POST /api/diagnosis` | NON_COMMERCIAL for the owner paywall (legacy consulting-engagement path; needs `ENGAGEMENT_CREATE`); does not count as the owner's free diagnosis | same guard; if it ever becomes owner-reachable the test fails until reclassified |
| OD3 | `POST /api/opsiq/consulting-engine/run` | NON_COMMERCIAL (staff; needs `RECOMMENDATION_CREATE`); staff commercial terms are a separate future model | same guard |
| OD4 | `POST /api/owner/budget/spend` | **Capture free, reassessment paid.** Unpaid with enforcement ON: the valid entry is persisted, `reassessBudget` is not run, no paid actions are created, and the response carries `reassessment: { status: "REQUIRES_SUBSCRIPTION", capability: "reassessment", reason }` with `plan: null`. OFF: unchanged | `recordSpendEntry` (service) |
| OD5 | `POST /api/owner/startup/sessions/[sessionId]/analysis` and `…/arbitrate` | **The whole first Startup diagnostic session is the free diagnosis**, from its first analysis step through its first system recommendation (SCREEN, GENERATE_HYPOTHESES, BUILD_ECONOMIC_MODEL, ASSESS_READINESS, evidence/results, arbitration, first BUILD_SYSTEM_RECOMMENDATION). Delivery of the first system recommendation is the completion point; after it, new analysis, rebuilds, arbitration, recommendations and any further Startup session are paid. A Startup journey holds the workspace allowance from its first persisted analysis (no second free diagnosis in an owner domain), and if an owner diagnosis already exists Startup is paid from the first step. An **abandoned** first session remains the free session (resume it to finish free); a new session is paid. `RECORD_HYPOTHESIS_RESULT` is capture and stays free | `assertStartupAnalysisAllowance(tx, workspaceId, sessionId)` in the persisting transaction, derived from persisted rows (no schema change, `STARTUP_FREE_SESSION_REQUIRES_SCHEMA_CHANGE=NO`) |


## 3. The other pending handlers

| Group | Handlers | Class | Enforcement |
|---|---|---|---|
| PD-1 consulting workbench (15, staff-only) | `consulting/engagements`, `diagnosis`, `opsiq/consulting-engine/run`, `decisions/create`, `diagnosis/{archetype,bottleneck,maturity,root-cause}`, `engagements/[id]/constraint-checks`, `growth/pricing-tiers/[id]/approve`, `GET intelligence/{recommendations,summary}`, `scenario`, `complaint-rework`, `owner/integration-events` | NON_COMMERCIAL | reachability test; no owner subscription check added |
| PD-2 stateless calculators (4) | `guardrails/screen`, `tender/screen`, `tender/application-pack`, `vendor/assess` | FREE_FOUNDATION | none; they do not consume the allowance |
| PD-3 governed approvals | `vendor/[id]/approve` | PAID_CONTINUATION | `requireCommercial: "approval_resolution"` |
| | `procurement/purchase-orders/[id]/transition` | MIXED_ACTION_SPLIT: **CANCELLED is free (risk-reducing stop action)**; REVIEWED, APPROVED, ISSUED, DELIVERED are paid (`DRAFT`→`REVIEWED`→`APPROVED`→`ISSUED`→`DELIVERED`, `CANCELLED` reachable from any non-final state) | handler asserts `approval_resolution` when `toStatus !== "CANCELLED"` |
| | `vendor/[id]/suspend` | FREE_FOUNDATION (safety, never blocked) | none |
| PD-4 multiplexed capture + transition | `constraints` POST | MIXED_ACTION_SPLIT: CREATE free, ACCEPT/RESOLVE paid | handler asserts `governed_execution` on the paid actions only |
| | `sop-intelligence` POST (assign training, raise alert) | FREE_FOUNDATION | none |
| | `sop-intelligence` PATCH (record completion) | PAID_CONTINUATION | `requireCommercial: "governed_execution"` |
| PD-5 Startup | `startup/.../analysis` (OD5), `startup/.../arbitrate` | FREE_FIRST_VALUE (first complete session); later paid | see OD5 |
| PD-6 budget | `budget/spend` (OD4) | MIXED_ACTION_SPLIT | see OD4 |

Observation (no action taken): `owner/kpi-ownership` `RECORD_REVIEW` remains classified free capture.

## 4. Release blockers

| ID | Status |
|---|---|
| RB1 allowance scope and size | **RESOLVED**: one per workspace, shared |
| RB2 handler classifications | **RESOLVED**: as in sections 2 and 3; `PAYWALL_BYPASSES_OPEN=0`, `UNDECIDED_HANDLER_COUNT=0` |
| RB3 grandfathering | **RESOLVED**: none |
| RB4 final price, live Paddle product/price, Plan seed | **OPEN** |
| Preview enforcement-ON acceptance | **OPEN** (activation prerequisite) |
| Paddle Live account/domain approval | **OPEN** (external) |

## 5. Existing workspaces if enforcement is later enabled (code analysis; no Production reads)

| State | First diagnosis | Next diagnosis / re-diagnosis | Continuation steps | Reads, billing, auth, account |
|---|---|---|---|---|
| zero diagnoses, no subscription | allowed (an owner diagnosis, or the whole first Startup session, holds the allowance) | denied (402) | denied, including before any diagnosis | allowed |
| one diagnosis, no subscription | used | denied | denied | allowed |
| several diagnoses (beta history), no subscription | used | denied; no retroactive allowance | denied | allowed |
| active subscription (also with a scheduled cancellation until period end) | allowed | allowed | allowed | allowed |
| past_due inside the 7-day grace | allowed | allowed | allowed until grace ends | allowed |
| past_due after grace, paused, canceled | allowed only if none exists | denied | denied | allowed |

`IMPLICIT_GRANDFATHERING=NO`.
