# Module 4 (Operations & Productivity Intelligence) — Slice 6: UI + Command-Center Integration — Report

Status: **BUILT + LOCALLY VERIFIED.** Owner Operations dashboard page (snapshot →
diagnosis → action status machine → verification → history) plus wiring of the
operations `DomainScore` into the cross-domain Business Condition Profile. The
command center now rolls up **finance + recovery + cashflow + sales + operations**.
Module 1 and all proven modules untouched. Public/SaaS frozen.

## 1. Why this is the correct next slice

Slices 1–5 (engine → detector → planner → persistence+migration → API+services)
are done and the Module 4 migration is applied (Operations Migration #1, target
`staging`) — the `owner_operations_*` tables exist. Per the 8-slice contract the
next step is the **UI + command-center integration**: the owner-facing page over
the Slice-5 API, and the operations domain plugged into the Business Condition
Profile. This is now safe (it introduces a runtime read of `owner_operations_*`)
because the tables are live.

## 2. Files created / changed

- **Created** `src/app/(authenticated)/owner/operations/page.tsx` — owner
  operations workspace mirroring the proven sales page: business create/select,
  operations snapshot form (13 throughput/quality/capacity/delivery/SOP fields,
  all optional — missing reported, never invented), run diagnosis, action status
  transitions (proposed→assigned→in_progress→completed/blocked) via the shared
  Module 1 machine, before/after verification, and diagnosis history. State badge
  uses the operations 5-state ladder (SMOOTH/STEADY/STRAINED/BOTTLENECKED/OVERLOADED).
- **Changed** `src/services/owner-condition/business-condition.service.ts` — added
  pure `operationsCycleToDomainScore` + `operationsActionRowToOwnerAction` mappers
  and an `ownerOperationsCycle` read in the existing `Promise.all`; pushes the
  operations `DomainScore` + actions into the rollup. Operations ∈ `EXECUTION_DOMAINS`,
  so its risk drives `executionRiskScore` (not `survivalRiskScore`).
- **Changed** `src/app/(authenticated)/owner/page.tsx` — added the Operations
  header link and completed `DOMAIN_LINK` (finance/cashflow/sales/operations/
  recovery) so every wired domain has an "open" deep-link from the command center.
- **Changed** `src/__tests__/owner-condition/business-condition.test.ts` — added an
  operations→spine mapper block (clamping, schema validity, and the execution-vs-
  survival routing proof).

## 3. Honesty / governance

- No business logic in the page; it only calls the canonical Slice-5 API.
- The command-center read is read-only over persisted operations data; no
  operations or other-domain mutation. No Module 1 / finance / cashflow / sales
  table or route modified.
- Deterministic rollup via the proven spine helper `buildBusinessConditionProfile`;
  missing data carried through, never invented.

## 4. Verification (local)

| Gate | Result |
|---|---|
| `npx vitest run src/__tests__/owner-condition/ src/__tests__/owner-operations/` | 73 passed, 8 skipped (`[db]` gated) |
| `npx eslint` (service + 2 pages + condition test) | clean |
| `npm run build` | compiled successfully — `/owner/operations` page + 9 `/api/owner/operations/*` routes registered |
| `npm run lint:ratchet` | LINT_RATCHET_PASS (1500 / 1153 — no increase) |
| `npm test` | 5750 passed / 184 skipped / **1 pre-existing flaky** (`mock-load-tester` latency median-vs-mean on random data — passed 34/34 in 3 isolated re-runs; not touched by this slice) |

## 5. Gate status

**No gate reached by this slice** (code + non-DB tests only; the migration it
depends on is already applied). Next is **Slice 7 — deployed runtime proof**
(HTTP smoke script + `module-4-operations-runtime-proof.yml`, step-0b capability
probe, no SHA coupling; merge to main and stop for manual run). Then Slice 8
(audit). Public/SaaS stays frozen.
