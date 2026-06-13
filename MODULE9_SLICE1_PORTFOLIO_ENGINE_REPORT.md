# Module 9 (Multi-Business Portfolio Command Center) — Slice 1: Portfolio Engine — Report

Status: **BUILT + LOCALLY VERIFIED.** Pure deterministic portfolio engine that
aggregates each business's Owner Intelligence Spine `BusinessConditionProfile` into
a cross-business view: per-business roll-up, portfolio health, cross-business
ranking, today's top-3 priorities, risk alerts, and an investment recommendation.
No DB/API/UI. Module 1 + all proven modules untouched. Public/SaaS frozen.

## 1. Why this is the correct next slice + why no migration

Per execution.md §16 / §22 Phase 10, Module 9 lets an owner manage multiple
businesses from one command center. It is a **read-only aggregation** over data the
proven domains already persist (each business's condition profile) — it owns no new
entity, so there is **no persistence/migration gate** for this module. The slice
structure is therefore: (1) engine, (2) API + service, (3) UI + command-center
link, (4) deployed runtime proof, (5) audit. This slice is the deterministic
engine, the consultant-grade ranking core.

## 2. Files created

- `src/domain/owner-portfolio/types.ts` — `PortfolioBusinessInput`,
  `PortfolioBusinessSummary` (16.1 per-business scores incl. per-domain health),
  `PortfolioRanking` (16.2), `PortfolioPriority`, `PortfolioRiskAlert`,
  `PortfolioInvestmentRecommendation`, `PortfolioView` (16.3).
- `src/domain/owner-portfolio/thresholds.ts` — alert + safe-investment thresholds.
- `src/domain/owner-portfolio/engine.ts` — `buildPortfolioView`: per-business
  summary, portfolio health (avg of businesses with data), cross-business ranking
  (most urgent / highest profit opportunity / highest cash risk / worst execution /
  best growth candidate), top-3 priorities (spine-ranked next actions across
  businesses), risk alerts (survival/cash/execution above threshold), and an
  investment recommendation (best safe growth candidate above the opportunity bar).
- `src/domain/owner-portfolio/index.ts` — barrel.
- `src/__tests__/owner-portfolio/engine.test.ts` — 10 tests.

## 3. Honesty / governance

- Deterministic, no LLM. Same inputs → identical view (proven by test).
- No invention: a business without a profile is reported as `hasData: false` with
  zeroed scores, excluded from health/ranking; an investment recommendation is
  withheld when no safe candidate clears the opportunity bar.
- Reads the proven spine profile only; owns no table and mutates nothing.

## 4. Verification (local)

| Gate | Result |
|---|---|
| `npx vitest run src/__tests__/owner-portfolio/` | 10 passed |
| `npx eslint src/domain/owner-portfolio src/__tests__/owner-portfolio` | clean |
| `npm run lint:ratchet` | LINT_RATCHET_PASS (changed_file_lint_errors 0) |

## 5. Gate status

**No gate reached** (pure domain code + tests; no migration — read-only module).
Next: **Slice 2 — API + service** (`/api/owner/portfolio/dashboard|ranking|actions|
risks`, reading each business's condition via the proven `getBusinessCondition`
then `buildPortfolioView`). Then Slice 3 (UI + command-center link), Slice 4
(deployed runtime proof gate), Slice 5 (audit). Public/SaaS stays frozen.
