# Current Status Update — Process Intelligence UI Surface

- **Base:** `origin/main` @ `466f72f7` (Process Intelligence v1, PR #128, merged).
- **Branch:** `claude/process-intelligence-ui-surface-depth-pass`.
- **Classification:** `PROCESS_INTELLIGENCE_UI_REAL_AND_OWNER_VISIBLE` (+ `OWNER_MODE_EXCELLENCE_DEEPENED`).

## What the owner can use now
A minimal owner surface at `/owner/process-intelligence` (linked from the Owner Now View) that shows the
single top process breakdown: plain title, affected stage, severity + confidence, concise evidence
(counts + a few refs), related profit leak / constraint / SLO, why it's breaking, the one recommended
correction, the required approval level, and any missing data. DATA_INSUFFICIENT renders honestly.

## Route / component
- Page `/owner/process-intelligence`; component `ProcessIntelligencePanel` (prop-driven, no business
  logic); reuses `/api/owner/now-view` (already carries `processIntelligence`). **No schema change.**
- Owner Now View header links to it; the page links back.

## Browser E2E status
**Browser-proven** — `44-owner-process-intelligence.spec.ts` 4/4 local (real login, a real REWORK_LOOP
breakdown, back-navigation, Now-View link); wired into the `owner-pilot-e2e` CI lane.

## Safety
No unsupported fraud/negligence labels; no hidden staff score; concise evidence (not raw logs); honest
DATA_INSUFFICIENT.

## What remains
Read-only surface (no action buttons) — routing corrections into trackable actions is the next pass.

## Verification
tsc 0 · prisma valid (no schema change) · governance 31-frozen/0-new · `next build` exit 0 · 5 component
+ 2 page + 4 Playwright + 15 domain-regression · changed-area regression 992.

## Next safest pass
Bottleneck → Correction Routing (turn the recommended correction into a trackable action with owner,
approval level, and a success metric).
