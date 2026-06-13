# Module 6 (Marketing & Growth Intelligence) — Slice 6: UI + Command-Center Integration — Report

Status: **BUILT + LOCALLY VERIFIED + MERGED TO MAIN.** Owner marketing dashboard
page (`/owner/marketing`) over the Slice-5 API + the marketing `DomainScore` wired
into the cross-domain Business Condition Profile. The command center now rolls up
finance + recovery + cashflow + sales + operations + sop + **marketing**. Migration
already applied (Module 6 Marketing Migration #1, staging), so the
`owner_marketing_*` command-center read is safe. Module 1 + all proven modules
untouched. Public/SaaS frozen.

## 1. Why this is the correct next slice

Slice 5 (API + services) is proven and the migration is applied. Per the 8-slice
contract, Slice 6 is the UI + command-center integration — the owner-facing
marketing loop plus the cross-domain rollup, which is where the `owner_marketing_*`
command-center read is introduced (now safe because the tables exist).

## 2. Files created / changed

- `src/app/(authenticated)/owner/marketing/page.tsx` — owner marketing dashboard
  (business create/select, marketing snapshot form with 14 optional fields —
  missing reported, never invented, run diagnosis, action status transitions via
  the shared Module 1 machine, before/after verification, diagnosis history;
  5-state ladder badge COMPOUNDING/GROWING/FLAT/LEAKING/WASTING). No business logic
  in the page — canonical `/api/owner/marketing/*` only.
- `src/services/owner-condition/business-condition.service.ts` — pure
  `marketingCycleToDomainScore` + `marketingActionRowToOwnerAction` mappers + an
  `ownerMarketingCycle` read in the existing Promise.all. Marketing is a growth
  domain — its risk does not raise `survivalRiskScore`; its opportunity feeds
  `growthOpportunityScore`.
- `src/app/(authenticated)/owner/page.tsx` — Marketing header link + `marketing →
  /owner/marketing` in `DOMAIN_LINK`.
- `src/__tests__/owner-condition/business-condition.test.ts` — marketing → spine
  mapper block (clamping, schema validity, growth-domain rollup proof).

## 3. Honesty / governance

- No business logic in the page; command-center read is read-only; no Module 1 /
  other-domain table or route modified.
- The marketing `DomainScore` validates against the spine schema; the growth-domain
  rollup is proven (marketing risk does not raise survival).

## 4. Verification (local)

| Gate | Result |
|---|---|
| `npx vitest run owner-condition + owner-marketing` | 80 passed / 8 [db]-skipped |
| `npx eslint` (service + owner page + marketing page + condition test) | clean |
| `npm run build` | REAL_EXIT=0; `/owner/marketing` page + 9 marketing API routes registered |
| `npm run lint:ratchet` | LINT_RATCHET_PASS (1500/1153 — no increase) |
| `npm test` (full suite) | 5859 passed / 194 skipped / 0 failed |

## 5. Gate status

**No gate reached by this slice** (UI + read integration). Merged to `main` (the
command-center read is safe because the migration is applied). Next is **Slice 7 —
deployed runtime proof** (HTTP smoke script + manual workflow → create and stop),
then Slice 8 (audit). Public/SaaS stays frozen.
