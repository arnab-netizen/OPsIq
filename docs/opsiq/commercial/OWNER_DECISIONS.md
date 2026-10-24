# Paywall owner decisions (resolved by the owner; implemented, not invented, by engineering)

> `PRODUCTION_PAYMENT_GATE_ENABLED=NO` · `BILLING_PAYWALL_ENFORCEMENT_PRODUCTION=OFF` · `MERGE_AUTHORIZED=NO`

This file records the owner's commercial decisions and where each is enforced. Nothing here activates the paywall. Still open: **RB4** (final launch price and live Paddle product/price/Plan seed), **Preview enforcement-ON acceptance** (unproven), and **Paddle Live account/domain approval** (external). The enable tool refuses while `RELEASE_BLOCKERS.json` lists them.

## 1. Policy

| Decision | Resolved policy | Enforced in |
|---|---|---|
| Free allowance | **One free diagnosis per workspace**; workspace-scoped, not per business, domain or module; shared by every owner diagnosis domain and Startup Mode; whichever qualifying diagnosis or analysis runs first consumes it; reads of it stay available | `workspaceHasDiagnosis` + `assertDiagnosisAllowance` in the 8 cycle writers and 5 Startup writers |
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
| OD5 | `POST /api/owner/startup/sessions/[sessionId]/analysis` and `…/arbitrate` | Startup shares the workspace's single free diagnosis. The first qualifying analysis (SCREEN, GENERATE_HYPOTHESES, BUILD_ECONOMIC_MODEL, ASSESS_READINESS, BUILD_SYSTEM_RECOMMENDATION) may consume it; later qualifying analysis is paid. `RECORD_HYPOTHESIS_RESULT` is pure capture and stays free. Arbitration is paid continuation | 5 Startup writers call `assertDiagnosisAllowance` in-tx under the shared advisory lock; arbitrate declares `requireCommercial: "reassessment"` |

Observation for the owner (no action taken): read literally, the first qualifying Startup analysis action consumes the allowance, so a startup owner's second action (for example hypothesis generation after screening) is already paid. If the intended free unit is a whole first Startup session's analysis pipeline, that is a further decision.

## 3. The other pending handlers

| Group | Handlers | Class | Enforcement |
|---|---|---|---|
| PD-1 consulting workbench (15, staff-only) | `consulting/engagements`, `diagnosis`, `opsiq/consulting-engine/run`, `decisions/create`, `diagnosis/{archetype,bottleneck,maturity,root-cause}`, `engagements/[id]/constraint-checks`, `growth/pricing-tiers/[id]/approve`, `GET intelligence/{recommendations,summary}`, `scenario`, `complaint-rework`, `owner/integration-events` | NON_COMMERCIAL | reachability test; no owner subscription check added |
| PD-2 stateless calculators (4) | `guardrails/screen`, `tender/screen`, `tender/application-pack`, `vendor/assess` | FREE_FOUNDATION | none; they do not consume the allowance |
| PD-3 governed approvals | `vendor/[id]/approve`, `procurement/purchase-orders/[id]/transition` | PAID_CONTINUATION | `requireCommercial: "approval_resolution"` |
| | `vendor/[id]/suspend` | FREE_FOUNDATION (safety, never blocked) | none |
| PD-4 multiplexed capture + transition | `constraints` POST | MIXED_ACTION_SPLIT: CREATE free, ACCEPT/RESOLVE paid | handler asserts `governed_execution` on the paid actions only |
| | `sop-intelligence` POST (assign training, raise alert) | FREE_FOUNDATION | none |
| | `sop-intelligence` PATCH (record completion) | PAID_CONTINUATION | `requireCommercial: "governed_execution"` |
| PD-5 Startup | `startup/.../analysis` (OD5), `startup/.../arbitrate` | see OD5 | see OD5 |
| PD-6 budget | `budget/spend` (OD4) | MIXED_ACTION_SPLIT | see OD4 |

Observations (no action taken, flagged for the owner): the purchase-order transition route is gated as a whole, so cancelling a purchase order is also paid; `owner/kpi-ownership` `RECORD_REVIEW` remains classified free capture.

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
| zero diagnoses, no subscription | allowed (consumes the allowance) | denied (402) | denied, including before any diagnosis | allowed |
| one diagnosis, no subscription | used | denied | denied | allowed |
| several diagnoses (beta history), no subscription | used | denied; no retroactive allowance | denied | allowed |
| active subscription (also with a scheduled cancellation until period end) | allowed | allowed | allowed | allowed |
| past_due inside the 7-day grace | allowed | allowed | allowed until grace ends | allowed |
| past_due after grace, paused, canceled | allowed only if none exists | denied | denied | allowed |

`IMPLICIT_GRANDFATHERING=NO`.
