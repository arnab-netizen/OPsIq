# Shadow Pilot — Data Requirements (PASS 41)

**Date:** 2026-07-07 · **Scope:** private owner shadow pilot (non-live, anonymized, manual/fixture-controlled).

No real private data is ingested in PASS 41. This document defines the data categories a shadow pilot
would use, each mapped to the OpsIQ module that consumes it (see `SHADOW_PILOT_MODULE_COVERAGE_MATRIX.json`).

**Legend** — Required/Optional · Format · Redaction (NONE / PLACEHOLDER / AGGREGATE-ONLY / EXCLUDE) ·
Risk (LOW/MED/HIGH) · Module.

| # | Category | Req/Opt | Acceptable format | Redaction | Risk | OpsIQ module(s) |
|---|----------|---------|-------------------|-----------|------|-----------------|
| 1 | Basic business profile | Required | `{ name(placeholder), businessType, location(area only), currency }` | PLACEHOLDER (name→OWNER_BUSINESS_A; location→area/city only) | LOW | now-view, cockpit, ownerBusiness |
| 2 | Current services/products | Required | list of service names + short description | NONE (operational) | LOW | now-view, cockpit |
| 3 | Current pricing | Optional | list `{ service, price, currency }` as owner-supplied numbers | AGGREGATE-ONLY where sensitive | MED | cash/profit protection, opportunity |
| 4 | Current volume / order count | Required | aggregate counts per period (e.g. orders/week) | AGGREGATE-ONLY | LOW | now-view, capacity, recovery |
| 5 | Current cost summary | Required | `{ revenue, costOfGoods, fixedCosts, variableCosts }` aggregates | AGGREGATE-ONLY | MED | cash/profit protection, survival/recovery |
| 6 | Cash pressure summary | Required | `{ cashInHand, receivablesOverdue, payables }` aggregates + confidence | AGGREGATE-ONLY | HIGH | survival/recovery, cash protection |
| 7 | Owner workload pain points | Required | short operational notes ("owner handles all follow-ups") | PLACEHOLDER (no personal names) | LOW | workload reduction, delegation |
| 8 | Staff/role structure | Required | roles as placeholders `STAFF_A / MANAGER_A` + function | PLACEHOLDER (no staff PII) | HIGH | SOP/training, workload, capability gap |
| 9 | Process/SOP issues | Required | operational notes on process gaps | NONE (operational) | LOW | SOP/training, complaint/rework |
| 10 | Customer complaints | Required | anonymized: `{ customer: CUSTOMER_001, issue, severity, evidenceRef? }` | PLACEHOLDER (no customer PII) | HIGH | complaint/rework, process execution |
| 11 | Rework / quality issues | Required | counts + operational description of the failure loop | AGGREGATE-ONLY + PLACEHOLDER | MED | complaint/rework, recovery |
| 12 | Vendor issues | Optional | `{ vendor: VENDOR_A, issue, impact }` | PLACEHOLDER (no vendor PII) | MED | process execution, cost |
| 13 | Marketing / lead notes | Optional | anonymized lead notes, no contact details | PLACEHOLDER (no lead PII) | MED | opportunity, marketing |
| 14 | Current opportunities | Optional | `{ B2B_CLIENT_A, need, relevance, hasUnitEconomics }` | PLACEHOLDER | MED | opportunity/tender, public signal |
| 15 | Current constraints | Required | owner-supplied operating constraints (capacity, cash cap, time) | AGGREGATE-ONLY | LOW | survival/recovery, capacity |
| 16 | Urgent risks | Required | short operational risk notes | NONE (operational) | MED | now-view, recovery, survival |
| 17 | Recent outcomes | Optional | what changed since last check (aggregate) | AGGREGATE-ONLY | LOW | now-view "what changed", reassessment |
| 18 | Evidence available | Required | list of evidence refs (photo/order-note/report ids, not contents) | PLACEHOLDER (ref ids only) | MED | evidence gating, completion |
| 19 | Missing data (known) | Required | list of data the owner knows is missing | NONE | LOW | missing-data request |
| 20 | Owner goals | Required | short goal statements (stabilize cash, cut rework, delegate) | NONE | LOW | now-view prioritisation, recovery |

## Minimum pilot dataset (to produce a governed top action)
Categories **1, 2, 4, 5, 6, 9, 10, 18, 19, 20** — enough to (a) identify the workspace/business, (b) detect a
process/cash/quality breakdown, (c) gate on evidence, and (d) surface honest missing-data. With less than
this, OpsIQ must return an honest missing-data request, never a fabricated decision.

## Maximum safe pilot dataset
All 20 categories, **anonymized**, for ONE business archetype (laundry/dry-cleaning/local service). No second
owner business, no live data, no third-party private data. Data must be minimized — supply only what a
category's module actually consumes (see the coverage matrix).

## Sourcing rules
- Data is **manually supplied** by the owner or **fixture-controlled** — never live-fetched.
- If a required category is missing, OpsIQ raises a **missing-data request** (route `CREATE_MISSING_DATA_TASK`,
  approvalLevel `NEEDS_DATA`). Do **not** fabricate the value.
- If a category is sensitive and cannot be safely redacted, **exclude** it (see `SHADOW_PILOT_DATA_REDACTION_GUIDE.md`).
