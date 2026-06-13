# Module 3 (Sales & Customer Intelligence) — Slice 6: UI + Command-Center Integration — Report

Status: **BUILT + LOCALLY VERIFIED.** Owner sales dashboard page
(`/owner/sales`) + wiring the sales `DomainScore` into the Business Condition
Profile so the command center is now **finance + recovery + cashflow + sales**.
Module 1 + Module 2 + Module 5 untouched (recovery/finance/cashflow reads are
read-only). No migration run. Public/SaaS frozen.

## 1. Why this is the correct next slice

Per execution.md §23 (… API → **UI** → … → **DASHBOARD INTEGRATION**), §19
(required screen `/owner/sales`), and §23.9 ("Every module must feed /owner
command center"), once the sales API exists the next step is the owner UI plus
feeding the command center. This raises consultant-level decision support: the
single cross-domain "do this next" now considers the sales domain too. No gate is
reached by UI/integration code.

## 2. Files created / changed

- `src/app/(authenticated)/owner/sales/page.tsx` (new) — owner sales page:
  business create/select, sales snapshot intake (the 16 funnel/customer/B2B/
  leakage fields, blank = missing), run diagnosis, findings + ranked actions,
  action status buttons (assign→start→complete/block), verify outcome
  (before/after, default direction "up"), the single **recommended next sales
  action**, missing-data banner, sales-state badge, and diagnosis history. Mirrors
  the proven finance/cashflow page; uses the sales API only.
- `src/services/owner-condition/business-condition.service.ts` (changed) — new
  pure mappers `salesCycleToDomainScore` + `salesActionRowToOwnerAction`, and a
  read-only fetch of the latest `OwnerSalesCycle` contributing its `DomainScore` +
  actions to `buildBusinessConditionProfile`. Sales is a **growth** domain (not in
  `SURVIVAL_DOMAINS`), so its risk feeds the growth/execution rollup — it does
  **not** inflate `survivalRiskScore` — while its actions still compete for the
  single cross-domain "do this next".
- `src/app/(authenticated)/owner/page.tsx` (changed) — added a `/owner/sales`
  link in the command-center header.
- `src/__tests__/owner-condition/business-condition.test.ts` (changed) — sales
  mapper tests + a cross-domain test proving sales risk does **not** raise
  survival risk yet a high-priority sales action can be the next action.

## 3. Honesty / governance

- No business logic in the page — it calls the canonical sales API and renders
  persisted results; missing data shown as missing.
- Command-center integration is read-only on every domain (no recovery/finance/
  cashflow/sales write in the rollup); the rollup stays deterministic via the
  proven spine helper.
- Sales `DomainScore` mirrors the engine's health/risk/opportunity/confidence
  exactly; clamped via `clampScore`.

## 4. Verification (local)

| Gate | Result |
|---|---|
| `npx vitest run src/__tests__/owner-condition/ src/__tests__/owner-sales/` | 70 passed, 8 skipped (`[db]` gated) |
| `npx eslint` (page + condition service + home + tests) | clean |
| `npm run build` | compiled; `/owner/sales` + 9 sales API routes registered |
| `git diff --check` | clean |
| `npm run lint:ratchet` | LINT_RATCHET_PASS (1500 — no increase) |
| `npx vitest run src/__tests__/founder-recovery/` | green (Module 1 unchanged) |
| `npm test` | full suite — see status (0 failed) |

## 5. Gate status — RUNTIME-PROOF GATE NEXT (after migration)

UI + command-center integration is code/tests only — no gate. The Module 3 domain
→ persistence → API → UI → command-center loop is now complete locally. The
remaining gates: the **Slice 4 sales migration must be applied** (merge to `main`
→ run **Module 3 Sales Migration**), then **Slice 7 — deployed runtime proof**
(smoke script + workflow, then a manual run), then **Slice 8 — audit**.
Public/SaaS stays frozen.
