# Process Intelligence UI Surface — PLAN

## Objective
Make Process Intelligence v1 usable from the owner UI — the smallest owner-facing surface that clearly
shows the top process breakdown, its evidence, one recommended correction, and the required approval
level. No large dashboard, no Now-View redesign, no process mining, no SOP/training engine.

## Approach (smallest owner-usable)
The Owner Now View GET route (`/api/owner/now-view`) already returns the full payload including the
server-computed `processIntelligence` block (from Pass 2). So:
1. **`ProcessIntelligencePanel`** (prop-driven component) — renders the top `ProcessFinding`: plain-
   language title, affected stage, severity + confidence, concise evidence counts + a few representative
   refs (proof / operational-event / escalation), related profit leak / constraint / SLO, why it's
   breaking, the one recommended correction, the required approval level, and missing data. Honest
   DATA_INSUFFICIENT + empty states. No fraud/negligence wording; no hidden staff score. A standing
   fairness note ("process signal, not an accusation").
2. **`/owner/process-intelligence` page** — fetches `/api/owner/now-view`, reads `processIntelligence`,
   renders the panel, links back to the Now View. Safe error handling (no raw internal error).
3. **Owner Now View link** — a "Where the process is breaking" link in the Now View header.

No new API route, no business logic in the UI (the finding is built server-side).

## Tests
- Component (jsdom): renders top breakdown (title/stage/correction/approval/evidence); related
  leak/constraint/SLO; DATA_INSUFFICIENT + missing data; empty state; no fraud label / hidden score.
- Page (jsdom): fetch → render top breakdown; back-link to Now View; safe error on failure.
- **Browser (Playwright)**: real owner login → `/owner/process-intelligence` renders a real breakdown
  (seeded complaint/rework → REWORK_LOOP) with its correction + approval level, no prohibited labels,
  back-navigation, and the Now View link. Wired into the existing `owner-pilot-e2e` CI lane.

## Data setup for the browser proof
Extend `scripts/seed-e2e-proof-risk.ts` to add complaint + rework operational events linked to the
accepted proofs in the E2E workspace → a deterministic QUALITY_FAILURE_LOOP / REWORK_LOOP so the page
renders a real finding (verified: topFinding = REWORK_LOOP, MANAGER approval, 2 supporting events).

## Safety
No unsupported fraud/negligence labels; no hidden staff score; concise evidence, not raw logs; honest
DATA_INSUFFICIENT.

## Out of scope
Large dashboard; Now-View redesign; process mining; SOP/training engine; correction routing (Pass 2).
