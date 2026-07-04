# Module 11 — Trust, Audit & Explainability — Slice 3 (UI + command-center link)

Read-only slice. A `/owner/trust` page renders the §18 credibility fields for any
diagnosis cycle (selectable by business + domain) plus the governed audit trail, and
a Trust link is added to the owner command center. No business logic in the UI — it
reads only the trust read-routes.

## A. Files created
- `src/app/(authenticated)/owner/trust/page.tsx` — Trust & Explainability page.
- `src/app/api/owner/trust/cycles/route.ts` — GET, OWNER_VIEW: latest cycle per trust
  domain for a business (+ business list), so the owner picks a real cycle without
  typing UUIDs.
- `src/__tests__/owner-trust/trust-page.test.ts` — page wiring proof.

## B. Files changed
- `src/services/owner-trust/trust.service.ts` — added `getBusinessTrustOverview`
  (read-only latest-cycle-per-domain resolver via per-domain Prisma delegates) +
  `TrustCycleRef`/`BusinessTrustOverview` types.
- `src/app/(authenticated)/owner/page.tsx` — Trust link in the header.
- `src/__tests__/owner-trust/routes.test.ts` — `cycles/route.ts` added to enforcement set.

## C. Schema changes
None. Read-only; resolver reads existing per-domain cycle tables.

## D. Backend logic implemented
- `getBusinessTrustOverview(workspaceId, businessId?)`: resolves the selected business
  (ownership-guarded via `getBusiness`), then for each `TRUST_DOMAINS` entry reads the
  latest cycle (`orderBy sequenceNumber desc`) from that domain's Prisma delegate,
  returning `{businesses, selectedBusinessId, cycles[]}`. Owns nothing, mutates nothing.

## E. Frontend logic implemented
- Business + domain selectors driven by the cycles overview.
- Per-finding explanation cards rendering all eight §18 fields (what detected, why it
  matters, source data used + evidence, calculation used, confidence, risk if ignored,
  expected impact, verification method) plus the honesty surface (no invented values,
  data gaps).
- "View audit trail" loads the cycle's governed events.
- All data via `/api/owner/trust/{cycles,explanations,audit-trail}` — no business logic
  in the component.

## F. Acceptance criteria checklist
- [x] Owner can see, per recommendation, the eight §18 credibility fields.
- [x] Owner can inspect the audit trail (who changed what, when) for a cycle.
- [x] Cycle selection uses real persisted cycles (no UUID typing).
- [x] Trust reachable from the command center.
- [x] Read-only: page calls no mutation endpoints; `cycles` route is GET/OWNER_VIEW.
- [x] No invented values surfaced (engine invariant carried to the UI).

## G. Known limitations
- The page shows one domain's cycle at a time (selectable); a cross-domain "explain
  everything" rollup is intentionally out of scope for this slice.

## H. Manual verification steps
1. `GET /owner/trust` → select a business with a diagnosis → §18 cards render.
2. Switch the domain selector → cards reload for that domain's latest cycle.
3. "View audit trail" → governed events for the cycle appear.
4. Trust button on `/owner` navigates here.

## I. Trigger map
Read-only; emits no events, triggers no re-evaluation.

## J. Failure modes covered
- No businesses / no cycles → explicit empty states.
- Cross-workspace business/cycle → NotFound from the guarded reads.
- Missing source value → shown as "missing" + listed as a data gap, never fabricated.

## K. Events emitted
None (read-only).

## L. Automated tests added
- `trust-page.test.ts` — 5 wiring assertions (client + primitives; reads only the three
  trust read-routes, no mutations; renders the eight §18 fields; honesty + audit trail;
  linked from the command center).
- `routes.test.ts` — extended to enforce the `cycles` route (canonical/workspace/
  OWNER_VIEW, read-only, reads through trust.service).

## Verification run
- `npx vitest run src/__tests__/owner-trust/` → 19 passed, 3 `[db]` skipped.
- eslint (changed files) → clean.
- `npm run build` → compiled + type-checked; `/owner/trust` + `/api/owner/trust/cycles`
  present in the route manifest; BUILD_ID present.
- `npm run lint:ratchet` → PASS (baseline 1500/1153; changed files 0/0).
- Full suite (sharded 1–4/4) → 5,970 passed, 0 failed.
