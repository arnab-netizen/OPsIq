# Process Intelligence UI Surface — REPORT

## A. Files created
- `src/components/owner/ProcessIntelligencePanel.tsx` — prop-driven owner panel.
- `src/app/(authenticated)/owner/process-intelligence/page.tsx` — owner page (fetch + render).
- `src/__tests__/components/process-intelligence-panel.test.tsx` — 5 component tests.
- `src/__tests__/app/owner-process-intelligence-page.test.tsx` — 2 page tests.
- `tests/browser/44-owner-process-intelligence.spec.ts` — 4 Playwright tests.
- `docs/remediation/process-intelligence-ui-surface-depth-pass/` — this pack (6 docs).

## B. Files changed
- `src/app/(authenticated)/owner/now/page.tsx` — "Where the process is breaking" link.
- `scripts/seed-e2e-proof-risk.ts` — add complaint/rework operational events (→ a real breakdown for the browser proof).
- `.github/workflows/owner-pilot-e2e.yml` — run the new browser spec in the existing lane.

## C. Schema changes
None.

## D. UI route / component
- **Route:** `/owner/process-intelligence` (client page). No new API route — reuses `/api/owner/now-view`
  which already carries the `processIntelligence` block.
- **Component:** `ProcessIntelligencePanel` (prop-driven; no business logic). Renders the 12 required
  elements: top breakdown title, affected stage, severity, confidence, evidence counts, representative
  refs, related profit leak, related constraint, related SLO, recommended correction, required approval
  level, missing data. Honest DATA_INSUFFICIENT + empty states.

## E. Owner Now View integration
A "Where the process is breaking" link in the Now View header → `/owner/process-intelligence`; the page
links back to `/owner/now`.

## F. Acceptance checklist
- [x] Owner-facing UI exists and is reachable from the Now View.
- [x] Top process breakdown renders (real REWORK_LOOP proven in-browser from seeded data).
- [x] Evidence (counts + refs) and the recommended correction render.
- [x] Required approval level renders.
- [x] DATA_INSUFFICIENT rendered honestly with the missing data.
- [x] No unsupported fraud/negligence labels; no hidden staff score.
- [x] Tests pass (5 component + 2 page + 4 Playwright); existing Process Intelligence tests still pass.
- [x] tsc 0 · governance 31 frozen/0 new · `next build` exit 0.

## G. Known limitations
- Shows the single top breakdown (matches the server contract) — not a full list surface.
- Read-only view (no action buttons yet — correction routing is Pass 2).

## H. Manual verification
See `TEST_EVIDENCE_LEDGER.md`.

## I. Classification
`PROCESS_INTELLIGENCE_UI_REAL_AND_OWNER_VISIBLE` — owner-facing UI, top breakdown + evidence +
recommendation + approval render, tests + build pass, no unsupported labels/scores, **and a real
Chromium route-render test passes (4/4)** against the real app.

## J. Browser E2E status
**Browser-proven** — `44-owner-process-intelligence.spec.ts` 4/4 local (real login, real breakdown,
back-navigation, Now-View link); wired into the `owner-pilot-e2e` CI lane (CI-confirmed on the PR).

## K. Automated tests added
5 component + 2 page (jsdom) + 4 Playwright.
