# Owner Self-Use Test Plan (PASS 44)

**Date:** 2026-07-07

## Automated coverage (green)
- **Browser (owner-pilot-e2e):** `50-owner-self-use-readiness.spec.ts` (this pass) + 46 cockpit · 47 no-overload ·
  48 shadow pilot · 49 public shadow. Journey: log in → reach cockpit via the sidebar link → one top action or
  clean state → safety gates visible → open a labelled action control (never window.prompt) → recovery/outside
  sections collapsed → no forbidden claims / PII → unauthenticated access fails closed (redirect to /login).
- **DB simulations (LANE_B):** process-execution + approval + evidence + reassessment + recovery + public-signal
  + PASS 42 shadow-pilot (14) + PASS 43 public shadow (12) — approval/evidence/reassessment/isolation/no-fabrication.
- **Component:** MinimumOwnerCockpit suites 55/55 (top action, no-overload, recovery, outside signals, clean).
- **Gates:** prisma validate · tsc · governance:scan:strict · lint:ratchet · Build+Type+Prisma Verify · next build.

## Manual owner acceptance checklist (owner performs once, records honestly)
1. Sign up / log in succeeds.
2. Create a business from the UI.
3. Enter operating data via /owner/intake (manual/paste) without developer help.
4. Open the cockpit from the sidebar (no internal route typed).
5. Read and understand the one top action.
6. Approve/start a task; owner-only actions require approval.
7. Submit evidence; completion is blocked without it.
8. Complete the task; a reassessment appears.
9. Recovery + Outside signals are collapsed and read-only.
10. No forbidden claim / PII / fake figure appears.
11. Clean/empty business fabricates nothing.
12. (Developer check) non-owner cannot perform owner actions; wrong-workspace fails closed.

## Known manual-only / restricted
- Structured field-by-field issue entry via a dedicated form (currently intake/CSV) — restriction R1.
- Deployment (developer-assisted; env vars required) — restriction R2.
- Responsive cockpit on small mobile — restriction R4.

## Pass criteria
All automated coverage green in CI; the manual checklist items 1–11 pass for the owner; no stop condition fires.
