# OpsIQ Owner Pilot — DB + Browser Proof Completion Plan

Branch: `claude/opsiq-owner-pilot-readiness-isow0m`
Base HEAD: `39a2c40` (classification `PILOT_REHEARSAL_READY`)
Goal: complete the live-DB and Playwright/browser/mobile proofs for the owner-pilot surfaces so the only remaining gate to `OWNER_PILOT_READY` is closed.

This plan is written **before** any code change.

## Environment unlock (key change vs. prior phase)
The prior phase could not run DB/browser proofs because the remote Neon DB (:5432) is egress-blocked. This phase stands up a **local PostgreSQL 16** (installed in the image) on `127.0.0.1:5432` (in the proxy `noProxy` list), applies migrations, and runs the `[db]` vitest suites AND the Playwright dev server against it. Chromium is pre-installed at `/opt/pw-browsers`; `@playwright/test@1.60.0` is present. So DB + browser + mobile proofs can be **executed here**, not just staged.

Confirmed already this session: local PG up, `prisma migrate deploy` applied all migrations, existing `[db]` suites pass against it (owner-business-isolation 6, owner-whole-business-plan + real-db-ingestion + business-condition = 20 more).

## 1. Exact DB suites required
- New: `src/__tests__/owner-mode/pilot-readiness/owner-pilot-surfaces.db.test.ts` covering, against real persisted rows (seeded via the existing `seedOwnerDbCase` / `seedScenarioBusiness` helpers):
  1. `getOwnerOnboardingState` reads real scoped rows → supplied categories reflect persisted snapshots.
  2. `getOwnerInputGuidance` / `getOwnerReadiness` / `getOwnerActionAssignment` read DB-backed state (confidence, blockers, assignment) from the live runtime.
  3. **Manual input path** (`submitManualEntry`) persists a scoped `OwnerDataIntake` (owner-confirmed) and the confidence read path then counts it (confidence rises).
  4. **Structured import** (`submitStructuredImport`) persists valid records, rejects malformed.
  5. **Malformed** record rejected (never written).
  6. **Cross-business** record rejected/isolated.
  7. **Cross-workspace** record rejected.
  8. Missing-data/confidence updates from DB-backed inputs (before/after the confirmed intake).
  9. Whole-business plan reads the updated provider data.
  10. **Legacy/null-business rows do not produce false REAL_DB confidence** (a business with only `business_id IS NULL` rows reports its critical domains missing).
- Existing, re-run as no-regression: `owner-business-isolation.db.test.ts`, `owner-whole-business-plan.db.test.ts`, `real-db-ingestion.db.test.ts`, `business-condition.db.test.ts`.

## 2. Exact Playwright specs to add
- `tests/browser/15-owner-pilot-onboarding.spec.ts` — first-use onboarding renders (`owner-onboarding`, `onboarding-confidence`, `onboarding-missing`, `onboarding-first-action`); **business type affects requested inputs** (laundry vs B2B vs multi-location businesses show different required inputs); confidence not falsely high on weak data; no critical console errors.
- `tests/browser/16-owner-pilot-command-center.spec.ts` — `/owner` command center: priority strip present with **≤5 cards** (`owner-priority-strip` / `priority-card-*`), readiness score (`owner-readiness-score`, gate), input guidance (`owner-input-guidance`, next best input, must-wait), action/proof (`owner-action-plan`, responsible/proof/escalation), biggest constraint + next action + do-not-do (existing `wbp-*`), owner/delegate split; **before/after**: a richer-data business shows higher confidence than a weak-data business and **irrelevant-data business does not show inflated confidence**; **manual input path** posts via the new route and the readiness/guidance refresh; **no static fallback** (a business with no runtime data shows the honest empty state, not a card); no critical console errors.
- `tests/browser/17-owner-pilot-mobile.spec.ts` — mobile viewport 375×812: onboarding, missing-data guidance, dashboard top priorities, action/proof card, readiness score visible; no horizontal scroll of core content (`document.scrollingElement.scrollWidth <= clientWidth + slack`); tap targets ≥44px; no critical console errors.

## 3. Seed data needed
- `scripts/seed-e2e-owner.ts` (existing) — the loginable E2E owner + workspace + OWNER role.
- `scripts/seed-owner-scenarios.ts` (existing) — 10 constraint-distinct laundry businesses (drives `wbp-*` + my runtime-fed cards).
- New `scripts/seed-e2e-owner-pilot.ts` — seeds, in the E2E workspace, businesses that exercise the owner-pilot surfaces specifically:
  - one per profile **business type** (laundry / housekeeping / remote-owner / B2B / multi-location) so onboarding profile mapping + guidance differ by type;
  - a **weak-data** business (minimal rows → low confidence), a **rich-data** business (full rows → higher confidence), and an **irrelevant-only** business (non-critical rows → still low) for the before/after + no-inflation assertions;
  - reuses `seedScenarioBusiness` knobs + sets `businessType`/`operatingModel`.

## 4. Business profiles covered
Laundry/dry-cleaning, housekeeping/cleaning, remote-owner staff-managed service, B2B contract-heavy, multi-location — both in the DB suite (profile mapping) and in the browser onboarding spec.

## 5. Mobile flows covered
Onboarding, missing-data guidance, dashboard top priorities, action/proof card, readiness score (spec 17) — no horizontal scroll, ≥44px targets, no critical console errors.

## 6. Runtime/API paths asserted
`/api/owner/onboarding`, `/api/owner/input-guidance`, `/api/owner/readiness`, `/api/owner/action-plan`, `/api/owner/priorities` (existing, runtime-fed), plus a NEW POST `/api/owner/manual-entry` (the real manual input path endpoint the browser exercises). All OWNER_VIEW/OWNER_MANAGE, canonically enforced.

## 7. Proof/action lifecycle assertions
Action card shows responsible party, owner/delegate split, OpsIQ-prepared work, proof type + acceptance, escalation. Proof lifecycle correctness is unit-proven (`action-assignment.test.ts`); the browser asserts the rendered assignment + proof framing from the runtime; the DB suite asserts the `Proof`/`OwnerDataIntake` rows persist and that proof presence flips proof-readiness.

## 8. Readiness score assertions
DB suite: readiness uses DB-backed state, decreases with missing critical data, increases with confirmed inputs, blocks pilot-ready when low. Browser: `owner-readiness-score` renders with overall + gate badge + blockers; weak-data business is "Not pilot-ready"; rich-data business scores higher.

## 9. No-static-fallback assertions
The priority strip renders nothing for a no-runtime business (component returns null); the browser asserts a business with no runtime plan shows the honest empty state, and that the strip never exceeds 5 cards. Every asserted value is sourced from a seeded DB row (change the seed → change the rendered value), so a static card cannot satisfy the test.

## 10. CI commands required
- New `.github/workflows/owner-pilot-db.yml` — postgres:16 service; `prisma migrate deploy`; `TEST_WITH_DB=true npx vitest run src/__tests__/owner-mode/pilot-readiness src/__tests__/services/owner-mode/*.db.test.ts`.
- New `.github/workflows/owner-pilot-e2e.yml` — postgres:16 service; migrate; build; `npx playwright install --with-deps chromium`; seed (`seed-e2e-owner` + `seed-owner-scenarios` + `seed-e2e-owner-pilot`); `PORT=3001 npm run start`; `npx playwright test tests/browser/15-… 16-… 17-… --project=chromium`.
- Local equivalents run this session against the local PG.

## 11. Final OWNER_PILOT_READY gates
post-merge green · onboarding+guidance+readiness+action+priority strip render in browser · manual + import + DB/provider paths proven · live-DB suites pass · mobile Playwright passes · 5 profiles covered · max-reliability ratchet green · no unsafe/generic/overconfident output · no cross-business/workspace leakage · no static-fallback can pass · reports complete. Promote to `OWNER_PILOT_READY` only if ALL pass when actually executed; otherwise classify at the highest honestly-reached rung (`OWNER_PILOT_DB_READY` / `OWNER_PILOT_BROWSER_READY` / `OWNER_PILOT_MOBILE_READY`).

## Slices / commit boundaries
- **D0** — this plan + local-PG harness notes (no product code). _commit._
- **D1** — POST `/api/owner/manual-entry` route + owner-pilot DB suite; run with local PG. _commit._
- **D2** — `seed-e2e-owner-pilot.ts` + Playwright specs 15/16/17; run locally against built app + local PG. _commit._
- **D3** — CI workflows (db + e2e lanes). _commit._
- **D4** — update `OPSIQ_OWNER_PILOT_READINESS_REPORT.md` + `OPSIQ_OWNER_PILOT_DB_BROWSER_PROOF_REPORT.md`; final classification. _commit._

No slice weakens any gate; DB/browser proofs are executed, not just authored.
