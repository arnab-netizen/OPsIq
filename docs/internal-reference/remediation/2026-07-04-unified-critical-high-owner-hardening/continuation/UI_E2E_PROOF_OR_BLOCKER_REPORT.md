# UI / Browser E2E — Proof or Blocker (continuation)

Playwright is configured; owner E2E specs/workflows exist (owner-e2e.yml, owner-pilot-e2e.yml) but trigger
on specific branches / manual dispatch, NOT PR-to-main. **No app server runs in this remediation harness**
and outbound non-HTTPS egress is restricted, so the browser journey was NOT run.

## Exact command to unblock
```
DATABASE_URL=<pg> npx prisma migrate deploy
npm run build && npm start &                 # app on :3000
DATABASE_URL=<pg> BASE_URL=http://localhost:3000 npx playwright test tests/e2e/owner*   # or owner-e2e specs
```
Required: running app URL, seeded owner+workspace, SESSION auth path. Add owner-e2e.yml to the PR-to-main
trigger to make the journey a merge gate.

## Journey to prove (unproven)
owner login → dashboard loads (UI-01 cookie fix) → diagnosis → operator completion → evidence/proof →
owner override confirm (GAP-OVR-01 UI) → dashboard reflects state → outcome → reassessment. No raw errors.

**Classification: UI_E2E_UNPROVEN.** UI readiness is NOT claimed. UI-01/UI-02 are code/type verified only.
