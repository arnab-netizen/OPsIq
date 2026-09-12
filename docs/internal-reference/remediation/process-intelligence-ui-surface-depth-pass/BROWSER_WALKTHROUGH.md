# Process Intelligence UI — BROWSER WALKTHROUGH

Proven by `tests/browser/44-owner-process-intelligence.spec.ts` in a real Chromium against the built app
+ real backend + seeded local Postgres. **4/4 passed.**

## Setup
- `seed-owner-scenarios.ts` — loginable owner (`test1@staging.local`) + workspace + businesses.
- `seed-e2e-proof-risk.ts` — accepted proofs + complaint/rework operational events → a real
  QUALITY/REWORK process breakdown in the E2E workspace.

## Steps (each an assertion)
1. **Open the surface.** The owner logs in and navigates to `/owner/process-intelligence`; the page
   loads `/api/owner/now-view` and shows the header "Where your process is breaking". *(test 1)*
2. **See the breakdown.** The panel renders the top finding — here `REWORK_LOOP` — with its plain
   explanation, evidence count + refs, the recommended correction, and the required approval level
   (MANAGER); no fraud/negligence label; no hidden score. *(test 2)*
3. **Back to the Now View.** The owner clicks "Owner Now View" → lands on `/owner/now`; no fatal
   console errors. *(test 3)*
4. **Discoverable.** The Owner Now View header links to `/owner/process-intelligence`. *(test 4)*

## What the owner gets
"OpsIQ now has a screen that names the one place my process is breaking today — 'work is being redone
repeatedly' — with the evidence behind it, one specific fix, and who needs to approve it. It's a process
signal, not an accusation, and it never shows a secret staff score. When there's not enough data, it says
so plainly."

## Honest scope
Proves the process-intelligence UI surface only (read-only view of the top breakdown). Correction routing
(actioning the fix) is Pass 2.
