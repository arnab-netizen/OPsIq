# Module 12 — Owner UI & Mobile Usability — Slice 2 (API + service)

Read-only slice. A workspace-scoped, OWNER_VIEW `GET /api/owner/home` returns the §19
owner-home summary, built by the Slice 1 engine over the proven per-domain spine data.
Owns no table; no migration (read-only module).

## A. Files created
- `src/services/owner-home/home.service.ts` — `getOwnerHome(workspaceId, businessId?)`.
- `src/app/api/owner/home/route.ts` — GET, OWNER_VIEW, workspace-required.
- `src/__tests__/owner-home/routes.test.ts` — route enforcement wiring proof.
- `src/__tests__/owner-home/services.db.test.ts` — `[db]`-gated service proof.

## B. Files changed
None.

## C. Schema changes
None (read-only module).

## D. Backend logic implemented
`getOwnerHome` resolves the selected business (ownership-guarded via `getBusiness`),
then in one `Promise.all` reads each domain's latest cycle (finance, recovery,
cashflow, sales, operations, sop, marketing, strategy) including findings and
actions-with-verifications. It maps rows to spine types **reusing the proven Business
Condition domain-score/action mappers** (no scoring logic duplicated), maps findings
to spine `OwnerFinding`, and flattens action verifications, then calls
`buildOwnerHomeSummary`. Honest: recovery scores count but recovery findings (no spine
findingType/impact) are excluded from the risk/opportunity lists; a business with no
diagnosis returns `hasData:false`, `summary:null` (nothing invented).

## E. Frontend logic implemented
None (Slice 3).

## F. Acceptance criteria checklist
- [x] `GET /api/owner/home` returns the full §19 summary for the selected business.
- [x] OWNER_VIEW, workspace-required, canonical; read-only (GET only).
- [x] Built only from persisted spine data (no invention; empty → null summary).
- [x] Verified improvements surfaced from real recorded verifications.
- [x] No new table / no migration.

## G. Known limitations
- Recovery findings are not in the risk/opportunity lists (they lack the spine
  findingType/impact shape); recovery still contributes to health + dangers via scores.

## H. Manual verification steps
1. `GET /api/owner/home` (authed) → summary for the most-recent business.
2. `GET /api/owner/home?businessId=<id>` → summary for that business.
3. Unauthenticated → canonical JSON 401/403 (not the HTML shell).

## I. Trigger map
Read-only; emits no events, triggers no re-evaluation.

## J. Failure modes covered
- Cross-workspace business id → falls back to the caller's own (none) → `hasData:false`
  (never returns foreign data) — proven in the `[db]` test.
- Empty business → null summary.
- Missing/closed actions → excluded from required actions by the engine.

## K. Events emitted
None (read-only).

## L. Automated tests added
- `routes.test.ts` — 3 wiring assertions (canonical/workspace/OWNER_VIEW; GET-only;
  reads through home.service).
- `services.db.test.ts` — 4 `[db]` tests: §19 summary from a real finance cycle;
  last-verified-improvement after a verified action; empty business → null summary;
  workspace isolation.

## Verification run
- `npx vitest run src/__tests__/owner-home/` → 11 passed, 4 `[db]` skipped.
- eslint (changed files) → clean.
- `npm run build` → compiled + type-checked; `/api/owner/home` in the route manifest;
  BUILD_ID present.
- `npm run lint:ratchet` → PASS (baseline 1500/1153; 4 changed files, 0 errors/warnings).
- Full suite (sharded 1–4/4) → 5,981 passed, 0 failed.
