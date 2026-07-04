# Module 5 (Cashflow Intelligence) — Slice 6: UI + Command-Center Integration — Report

Status: **BUILT + LOCALLY VERIFIED.** Owner cashflow dashboard page
(`/owner/cashflow`) + wiring the cashflow `DomainScore` into the Business
Condition Profile so the command center is now **finance + recovery + cashflow**.
Module 1 + Module 2 untouched (recovery/finance reads are read-only). No
migration run. Public/SaaS frozen.

## 1. Why this is the correct next slice

Per execution.md §23 (… API → **UI** → TESTS → … → **DASHBOARD INTEGRATION**),
§19 (required screen `/owner/cashflow`), and §23.9 ("Every module must feed
/owner command center"), once the cashflow API exists the next step is the owner
UI plus feeding the command center. No gate is reached by UI/integration code.

## 2. Files created / changed

- `src/app/(authenticated)/owner/cashflow/page.tsx` (new) — owner cashflow page:
  business create/select, cashflow snapshot intake (the 13 liquidity fields,
  blank = missing), run diagnosis, findings + ranked actions, action status
  buttons (assign→start→complete/block), verify outcome (before/after), the
  single **recommended next cash action**, missing-data banner, cashflow state
  badge, and diagnosis history. Mirrors the proven finance page; uses the
  cashflow API only.
- `src/services/owner-condition/business-condition.service.ts` (changed) — new
  pure mappers `cashflowCycleToDomainScore` (danger→riskScore) +
  `cashflowActionRowToOwnerAction`, and a read-only fetch of the latest
  `OwnerCashflowCycle` contributing its `DomainScore` + actions to
  `buildBusinessConditionProfile`. Cashflow is a **survival domain**, so its risk
  weighs into `survivalRiskScore` and its actions compete for the single
  cross-domain "Do this next".
- `src/app/(authenticated)/owner/page.tsx` (changed) — added a `/owner/cashflow`
  link in the command-center header.
- `src/__tests__/owner-condition/business-condition.test.ts` (changed) — cashflow
  mapper tests + a cross-domain test proving a critical cashflow action can be the
  command center's next action over finance/recovery.

## 3. Honesty / governance

- No business logic in the page — it calls the canonical cashflow API and renders
  persisted results; missing data shown as missing.
- Command-center integration is read-only on every domain (no recovery/finance/
  cashflow write); the rollup stays deterministic via the proven spine helper.
- Cashflow `DomainScore` mirrors the engine's health/danger/opportunity/confidence
  exactly (danger maps to spine `riskScore`); clamped via `clampScore`.

## 4. Verification (local)

| Gate | Result |
|---|---|
| `npx vitest run src/__tests__/owner-condition/ src/__tests__/owner-cashflow/` | 73 passed, 8 skipped (`[db]` gated) |
| `npx eslint` (page + condition service + home + tests) | clean |
| `npm run build` | compiled; `/owner/cashflow` + 9 cashflow API routes registered |
| `git diff --check` | clean |
| `npm run lint:ratchet` | LINT_RATCHET_PASS (1500 — no increase) |
| `npx vitest run src/__tests__/founder-recovery/` | green (Module 1 unchanged) |
| `npm test` | full suite — see status (0 failed) |

## 5. Gate status — RUNTIME-PROOF GATE NEXT

UI + command-center integration is code/tests only — no gate. The Module 5
domain → persistence → API → UI → command-center loop is now complete locally.
The next slice is **Slice 7 — deployed runtime proof**, which **is a gate**: it
requires a smoke run against the deployed app (`https://o-ps-iq.vercel.app`) with
the cashflow migration applied. Per the execution rules, the runtime-proof
workflow + script + report are created and the agent **stops** for the manual run
(the sandbox cannot reach the deployed app and cannot trigger the dispatch).
