# OpsIQ Owner Pilot — DB + Browser/Mobile Proof Report

Branch: `claude/opsiq-owner-pilot-readiness-isow0m`
Base HEAD (this phase): `39a2c40` (was `PILOT_REHEARSAL_READY`)
Final HEAD: see `git rev-parse HEAD` (D4 commit).

This phase closed the two blockers that kept the prior phase at `PILOT_REHEARSAL_READY`: the live-DB suites and the Playwright browser/mobile proofs were **executed**, not just staged.

## Environment unlock
A local **PostgreSQL 16** (pre-installed in the image) was started on `127.0.0.1:5432` (in the proxy `noProxy` set), migrations applied (`prisma migrate deploy` — all migrations OK), and the app built (`npm run build`) and served (`PORT=3001 npm run start`). Chromium (`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`) drove Playwright `1.60.0`. So both the `[db]` vitest suites and the Playwright dev-server flows ran here against real infrastructure.

## 1. DB proof status — PASS (executed)
Command (CI lane `owner-pilot-db.yml`): `TEST_WITH_DB=true npx vitest run <files> --maxWorkers 1`.
- `src/__tests__/owner-mode/pilot-readiness/owner-pilot-surfaces.db.test.ts` — **6/6**:
  - onboarding/guidance/readiness/action read real workspace+business-scoped rows;
  - the **manual input path** (`submitManualEntry`) persists an owner-confirmed `OwnerDataIntake` and the confidence read path then counts it (confidence rises);
  - a **malformed** record is rejected and never written;
  - **cross-business**, **cross-workspace**, and **business-not-found** records are rejected; no intake leaks into the other workspace;
  - **legacy null-business** rows never produce false REAL_DB confidence.
- `owner-business-isolation.db.test.ts` (6), `owner-whole-business-plan.db.test.ts`, `real-db-ingestion.db.test.ts` — re-run green. **Combined 4 files / 23 tests passed.**
- Broader local run (pilot-readiness + owner-mode services with `TEST_WITH_DB`): **137 passed**.

## 2. Playwright browser proof status — PASS (executed)
Built app + seeded local Postgres, real OWNER login.
- `tests/browser/15-owner-pilot-onboarding.spec.ts` — **7/7**: onboarding renders from the runtime; **business type changes the requested input** for all five profiles (laundry→equipment, B2B→contracts, multi-location→branch, remote-owner→proof, weak housekeeping→revenue/low-confidence); confidence never falsely high; no fatal console errors.
- `tests/browser/16-owner-pilot-command-center.spec.ts` — **5/5**: the priority strip renders **≤5 runtime-fed cards** (each answering the seven questions); readiness score + gate, input-guidance, and action/proof cards render; the strip content **changes per business** (no static fallback can satisfy this); the **manual input path through `POST /api/owner/manual-entry`** raises confidence and clears the revenue request on the weak business; no fatal console errors.
- Existing whole-business specs **13 + 14 remain green** (30 passed across 13–17, one pre-existing flake passed on retry) — the pilot seed backdates `createdAt` so the `/owner` default business stays a scenario business.

## 3. Mobile Playwright proof status — PASS (executed)
- `tests/browser/17-owner-pilot-mobile.spec.ts` — **3/3** at 375×812: onboarding + missing-data guidance usable; dashboard top priorities + action/proof + readiness usable; **no horizontal scroll** of core content (overflow ≤ 4px); no fatal console errors.

## 4. Pilot pack E2E proof
The five packs pass **through the production runtime** (`runOwnerAdvice`) in `pilot-rehearsal-packs.test.ts` (21 tests), and the five business **profiles render in the browser** (spec 15 covers laundry, B2B, multi-location, remote-owner, and a weak housekeeping business). Before→after confidence, missing-data guidance, proof/reassessment presence, and owner-workload reduction are asserted per pack at the runtime level; the command center renders these for the seeded businesses.

## 5. Command-center usability proof
Spec 16 asserts the top priority strip has no more than 5 cards, each card answers what/why/next/who/proof/reassess/confidence, and the content is runtime-fed (changes with the business). No static fallback survives.

## 6. Input path proof
- Manual: DB test (persist + confidence) + browser POST `/api/owner/manual-entry` (confidence rises, revenue request cleared).
- Structured import: DB-less unit (`input-paths.test.ts`) through the shared parser; the same parser/persistence seam powers the manual path.
- DB/provider: `real-db-ingestion.db.test.ts` proves REAL_DB-backed confidence and that runtime output changes when DB data changes.

## 7. Proof lifecycle proof
`action-assignment.test.ts` (11) proves the proof lifecycle (no completion without accepted proof; rejected stays incomplete; overdue escalates; reassessment only after accept). Spec 16 renders the action/proof framing (responsible party, proof type, acceptance, escalation) from the runtime.

## 8. Readiness score proof
Unit (`readiness-score.test.ts`, 10) + DB (reads DB-backed state) + browser (`owner-readiness-score`, overall + gate badge). Decreases with missing critical data, increases with confirmed inputs, blocks pilot-ready when low.

## 9. Max-reliability no-regression proof
`behavioral-validation/max-reliability/*` + `expert/ratchet` green; non-DB pilot-readiness + max-reliability run **231 passed / 6 [db] skipped**; lint ratchet PASS (0 changed-file errors); tsc 0; prisma valid. No scorer/ratchet/baseline/assurance edits.

## 10. Final classification
`OWNER_PILOT_READY` — every gate is met and **executed** against real Postgres + a real built app + real Chromium (desktop and mobile). CI lanes `owner-pilot-db.yml` and `owner-pilot-e2e.yml` mirror the exact commands run here.

### Exact CI commands
- DB: `TEST_WITH_DB=true npx vitest run src/__tests__/owner-mode/pilot-readiness/owner-pilot-surfaces.db.test.ts src/__tests__/services/owner-mode/owner-business-isolation.db.test.ts src/__tests__/services/owner-mode/owner-whole-business-plan.db.test.ts src/__tests__/behavioral-validation/whole-business/real-db-ingestion.db.test.ts --maxWorkers 1`
- E2E: seed `seed-owner-scenarios.ts` + `seed-e2e-owner-pilot.ts`, `PORT=3001 npm run start`, then `npx playwright test tests/browser/15-… 16-… 17-… --project=chromium`.
