# Module 7 (SOP, Process & Execution Accountability) — Slice 6: UI + Command-Center Integration — Report

Status: **BUILT + LOCALLY VERIFIED + MERGED TO MAIN.** Owner execution dashboard
page (`/owner/execution`) over the Slice-5 API + the sop `DomainScore` wired into
the cross-domain Business Condition Profile. The command center now rolls up
finance + recovery + cashflow + sales + operations + **sop**. Migration already
applied (Module 7 SOP Migration #1, staging), so the `owner_sop_*` command-center
read is safe. Module 1 + all proven modules untouched. Public/SaaS frozen.

## 1. Why this is the correct next slice

Slice 5 (API + services) is proven and the migration is applied. Per the 8-slice
contract, Slice 6 is the UI + command-center integration — the owner-facing
execution loop plus the cross-domain rollup, which is where the `owner_sop_*`
command-center read is introduced (now safe because the tables exist).

## 2. Files created / changed

- `src/app/(authenticated)/owner/execution/page.tsx` — owner execution dashboard
  (business create/select, execution snapshot form with 11 optional fields —
  missing reported, never invented, run diagnosis, action status transitions via
  the shared Module 1 machine, before/after verification, diagnosis history;
  5-state ladder badge DISCIPLINED/ON_TRACK/SLIPPING/UNRELIABLE/BREAKDOWN). No
  business logic in the page — canonical `/api/owner/sop/*` only.
- `src/services/owner-condition/business-condition.service.ts` — pure
  `sopCycleToDomainScore` + `sopActionRowToOwnerAction` mappers + an
  `ownerSopCycle` read in the existing Promise.all. SOP is an execution domain, so
  its risk drives `executionRiskScore`, not `survivalRiskScore`.
- `src/app/(authenticated)/owner/page.tsx` — Execution header link + `sop →
  /owner/execution` in `DOMAIN_LINK`.
- `src/__tests__/owner-condition/business-condition.test.ts` — sop → spine mapper
  block (clamping, schema validity, execution-vs-survival routing proof).

## 3. Honesty / governance

- No business logic in the page; command-center read is read-only; no Module 1 /
  other-domain table or route modified.
- The sop `DomainScore` validates against the spine schema; the execution-domain
  rollup is proven (sop risk → executionRiskScore, not survival).

## 4. Verification (local)

| Gate | Result |
|---|---|
| `npx vitest run owner-condition + owner-sop` | 75 passed / 8 [db]-skipped |
| `npx eslint` (service + owner page + execution page + condition test) | clean |
| `npm run build` | REAL_EXIT=0; `/owner/execution` page + 9 sop API routes registered |
| `npm run lint:ratchet` | LINT_RATCHET_PASS (1500/1153 — no increase) |
| `npm test` (full suite) | 5804 passed / 189 skipped / 0 failed |

## 5. Gate status

**No gate reached by this slice** (UI + read integration). Merged to `main` (the
command-center read is safe because the migration is applied). Next is **Slice 7 —
deployed runtime proof** (HTTP smoke script + manual workflow → create and stop),
then Slice 8 (audit). Public/SaaS stays frozen.
