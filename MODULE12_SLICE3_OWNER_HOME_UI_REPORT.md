# Module 12 — Owner UI & Mobile Usability — Slice 3 (mobile-first owner-home UI)

Read-only slice. A mobile-first `/owner/home` screen renders the §19 owner-home
summary from `GET /api/owner/home`, linked from the command center. No business logic
in the UI; no migration (read-only module).

## A. Files created
- `src/app/(authenticated)/owner/home/page.tsx` — mobile-first §19 owner home.
- `src/__tests__/owner-home/home-page.test.ts` — page wiring proof.

## B. Files changed
- `src/app/(authenticated)/owner/page.tsx` — Home link in the command-center header.

## C. Schema changes
None (read-only module).

## D. Backend logic implemented
None (Slice 2).

## E. Frontend logic implemented
A risk-first / money-first mobile layout (`max-w-md` → `sm:max-w-2xl`) that surfaces
every §19 field: business health; cash / sales / operations / execution danger cards
(with honest "no data" for `unknown`); today's required actions (each with domain,
priority, impact, and its verification metric + a deep link to the owning domain);
top risks; top opportunities; and the last verified improvement (or an honest
"none yet"). Business selector reloads the summary. All data comes from
`/api/owner/home`; the component performs no calculations.

## F. Acceptance criteria checklist
- [x] Renders all §19 owner-home fields.
- [x] Mobile-first, low-overload (cards, one clear action list, risk/money first).
- [x] Every action shows its verification metric.
- [x] Honest empty/unknown states (no invented values).
- [x] Reachable from `/owner`; reads the read-only API only.

## G. Known limitations
- The proven `/owner` command-center page is unchanged (only a link added); `/owner/home`
  is the dedicated mobile-first §19 surface.

## H. Manual verification steps
1. `GET /owner/home` → select a business with a diagnosis → all §19 sections render.
2. Switch business → summary reloads.
3. A business with no diagnosis → honest empty state; unknown dangers show "no data".

## I. Trigger map
Read-only; emits no events, triggers no re-evaluation.

## J. Failure modes covered
- No businesses / no diagnosis → explicit empty states.
- Unknown danger (no domain data) → "no data" badge, never 0.
- No verified improvement → explicit "none yet" message.

## K. Events emitted
None (read-only).

## L. Automated tests added
- `home-page.test.ts` — 6 wiring assertions (client + primitives; reads only
  `/api/owner/home`, no mutations; renders all nine §19 fields; reads the summary
  payload fields; mobile-first + honest missing-data; linked from the command center).

## Verification run
- `npx vitest run src/__tests__/owner-home/` → 17 passed, 4 `[db]` skipped.
- eslint (changed files) → clean.
- `npm run build` → compiled + type-checked; `/owner/home` + `/api/owner/home` in the
  route manifest; BUILD_ID present.
- `npm run lint:ratchet` → PASS (baseline 1500/1153; 8 changed files, 0/0).
- Full suite (sharded 1–4/4) → 5,987 passed, 0 failed.
