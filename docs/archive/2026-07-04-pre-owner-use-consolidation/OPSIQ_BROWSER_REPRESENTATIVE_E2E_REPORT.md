# OpsIQ Browser-Representative E2E — Report (businessId migration; full 10 flows)

## Branch / HEADs
- Branch: `claude/opsiq-real-world-case-training`
- Base HEAD (start of this slice): `481bf58`
- Final HEAD: this slice's commit (businessId migration + 10 browser flows)

## businessId migration status
**APPLIED.** `OwnerCapacitySnapshot`, `OwnerWorkloadSnapshot`, `Proof`, `OwnerStandingInstruction` each
gained a nullable `business_id uuid` + `(workspace_id, business_id)` index (migration
`20260629020000_owner_entities_business_scope`, additive, reversible). Provider reads now scope these four
by `workspaceId + businessId`; writes set a workspace-validated `businessId`; seeds write business-scoped
rows. This **unblocks the previously-collapsing flows**: capacity / owner-workload / proof-fraud /
standing-instruction state no longer bleeds across businesses in one workspace.

## Result
**15/15 Playwright flows passed** on real Chromium against the built app + real seeded postgres:16:
**10 distinct desktop flows** (all 10 representative profiles, one workspace) + **5 mobile flows**.
0 failed, **0 skipped**, no fatal console errors.

| # | Flow | businessId (deterministic) | Expected constraint | Actual rendered | Desktop | Mobile |
|---|---|---|---|---|---|---|
| 1 | Cash crisis | `…704b62697a30` | `cash_survival` | `cash_survival` | ✓ | ✓ |
| 2 | Bad contract / opportunity | `…8bfa62697a30` | `below_margin` | `below_margin` | ✓ | ✓ |
| 3 | Marketing blocked (capacity/quality) | `…0a9262697a30` | `capacity_feasibility` | `capacity_feasibility` | ✓ | — |
| 4 | Owner workload overload | `…6ce762697a30` | `owner_workload` | `owner_workload` | ✓ | ✓ |
| 5 | Proof / fake completion risk | `…097762697a30` | `proof_fraud_block` | `proof_fraud_block` | ✓ | — |
| 6 | Vendor / supplier compliance | `…3a3562697a30` | `compliance_block` | `compliance_block` | ✓ | ✓ |
| 7 | Delivery / logistics capacity | `…cf1262697a30` | `capacity_feasibility` | `capacity_feasibility` | ✓ | — |
| 8 | Growth / scale (healthy) | `…662c62697a30` | `profitable_growth` | `profitable_growth` | ✓ | — |
| 9 | Shutdown / pivot / stop-loss | `…449362697a30` | `cash_survival` | `cash_survival` | ✓ | — |
| 10 | Multi-location / remote-owner | `…950e62697a30` | `owner_workload` | `owner_workload` | ✓ | ✓ |

All 10 businesses are co-seeded in **ONE** workspace (`E2E_WORKSPACE_ID`). 7 distinct constraints across
the 10 (the model has 7 blocking constraints; some flows faithfully share where the business genuinely
binds there). Mobile subset = 5 flows (cash_survival, below_margin, owner_workload ×2, compliance_block).

## Per-flow assertions (every flow)
The command-center "Whole-business plan (live runtime)" card renders from the runtime:
`wbp-dominant-constraint` = expected, plus top-priority, do-not-do/stop, next action,
owner-workload/offload, proof, reassessment, growth-gate, arbitration, **provider-backed data** +
confidence, and **stored-learning provenance** — with no `Cannot read / is not a function / Hydration
failed` console errors. The dropdown (`select[name="businessSelector"]`) selects each DB-backed scenario
business by its `businessId`; one login per `describe`.

## Cross-business / cross-workspace isolation proof
- **No cross-business leakage:** the 10 co-seeded businesses render **distinct** dominant constraints
  (proven both at the DB level — `getOwnerWholeBusinessPlan` per business — and in the browser). Pre-
  migration, 8/10 collapsed to `proof_fraud_block` from a single workspace-shared duplicate proof; post-
  migration each business resolves only its own state.
- `[db] owner-business-isolation.db.test.ts` (6 tests): three businesses in one workspace each resolve
  their own constraint; a business with only **legacy** `business_id IS NULL` capacity/workload/proof rows
  is **not** backed by them (capacity/workload null, 0 proofs, standingCount 0); a fourth workspace sees
  none of them; writes store `businessId`; a cross-workspace `businessId` is rejected (`BusinessScopeError`).
- `provider does not claim REAL_DB for a business backed only by legacy workspace-only data` — proven by
  the legacy-business case above (`criticalDomainsRealProviderBacked` is computed from business-scoped
  reads only).

## Login rate-limit handling
One authenticated context per `describe` (serial mode), reused across all flows → ≤2 logins per describe,
well under the 10/15-min/IP limiter. Production login security unchanged; rate limiting not disabled.

## Browser executable
Real Chromium at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome` via a CI-neutral
`PLAYWRIGHT_CHROMIUM_PATH` env override in `playwright.config.ts` (unset → bundled browser; CI behaviour
unchanged). No browser download.

## Final browser sub-gate result
**`BROWSER_REPRESENTATIVE_READY`** — all 10 representative browser flows pass + 5 mobile (≥3) + 0 skipped,
no cross-business/cross-workspace leakage, whole-business card renders runtime output, provider/confidence
visible, owner-workload/offload + proof/reassessment + do-not-do/stop visible, 0 critical console errors.
