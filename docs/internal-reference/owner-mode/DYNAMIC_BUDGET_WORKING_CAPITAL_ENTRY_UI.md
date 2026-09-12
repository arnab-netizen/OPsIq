# Dynamic Budget — Working-Capital Route/UI + Manual Entry Surface

Makes the working-capital ageing backend (PR #45, DB-proven) **owner-usable**: routes to
record/list receivable & payable items and a `/owner/budget` UI section that shows ageing
buckets, collection-first / vendor-pressure warnings, and honest manual/import-ready
labelling. Headless/component-testable; **Browser/E2E remains deferred**.

Owner Mode only. Reuses the existing working-capital service + pure ageing engine — no new
persistence/engine, no schema change. Gate 10 / `execution.md` / billing / stripe untouched.
**Not OWNER_MODE_READY.**

## What was implemented
- **Routes** `GET/POST /api/owner/budget/working-capital` — `withCanonicalEnforcement`
  (GET OWNER_VIEW, POST OWNER_MANAGE), workspace derived server-side, Zod-validated via the
  existing `workingCapitalItemCreateSchema` (dueDate/amount/kind/counterparty/status/sourceType).
  Reuse the existing `recordWorkingCapitalItem` / `listWorkingCapitalItems`.
- **UI** (`/owner/budget` page): a "Working capital — receivables & payables ageing" section
  that fetches the owner-entered items and computes buckets client-side via the **same pure
  `assessWorkingCapitalAgeing` engine** the backend uses. Shows:
  - receivables + payables ageing buckets (not due / 0–30 / 31–60 / 61–90 / 90+);
  - collection-first warning (90+ receivable), vendor-pressure warning (overdue payable),
    growth-blocked-by-working-capital warning;
  - highest-risk counterparties to collect;
  - data-confidence (manual/import — never auto-verified);
  - a manual entry form (kind / counterparty / amount / due date);
  - explicit "manual / import-ready, NOT a live feed" label and a clear distinction between
    the governed budget recommendation and owner-entered data.

## Honesty / no overclaim
The section is labelled owner-entered manual/import-ready data, explicitly "NOT a live
bank/accounting feed and not verified", separate from the governed recommendation. No
live-feed claim anywhere.

## Tests
- **Component** (`working-capital-entry.test.tsx`, jsdom): renders receivable/payable ageing
  buckets from owner-entered items; collection-first warning (90+); vendor-pressure warning;
  manual/import-ready label (not live-verified).
- **Route runtime RBAC** (`working-capital-route.rbac.test.ts`, real wrapper, mocked auth):
  unauthenticated denied (read+write); no-OWNER_MANAGE write denied (no row); OWNER_MANAGE
  create + OWNER_VIEW read allowed; malformed amount/dueDate rejected; foreign-workspace
  read/write blocked.
- Regression: owner-budget + services + existing budget-plan component **199/199**. `tsc` 0;
  `lint:ratchet` PASS. No schema → `prisma validate` N/A.

## What remains
- Browser/E2E proof deferred (no browser-capable environment). The section is component- and
  route-proven, not browser-proven.
- Item status transitions (mark paid/disputed) beyond create/list are a follow-up; the
  ageing engine already excludes collected/paid items.
- Live feeds remain deferred.

## Classification
`DYNAMIC_BUDGET_WORKING_CAPITAL_ENTRY_UI_OWNER_VISIBLE` — owner-visible + route/runtime and
component proven; **not** browser-proven. **Not OWNER_MODE_READY.**
