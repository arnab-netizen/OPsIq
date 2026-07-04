# UI / Browser E2E — Proof or Blocker

## Feasibility (verified)
- Playwright is configured (`@playwright/test`; owner E2E workflows exist e.g. `owner-e2e.yml`, `owner-pilot-e2e.yml`).
- **BLOCKED_EXTERNAL:** no running Next app server in this remediation harness, and `owner-e2e.yml` triggers only on a specific branch/manual dispatch (not PR-to-main). The env's outbound non-HTTPS egress is also restricted. So the owner browser journey was **NOT run** this session.

## Exact command to unblock
```
# provision DB (CI postgres or local), then:
DATABASE_URL=<pg> npx prisma migrate deploy
npm run build && npm start &            # app server on :3000
DATABASE_URL=<pg> npx playwright test   # owner journey specs
```
Required: a running app server URL, a seeded test owner + workspace, `SESSION` auth path, and the owner-journey specs. Add `owner-e2e.yml` to the PR-to-main trigger so the journey becomes a merge gate.

## Journey to prove (unproven this session)
owner login/onboarding → dashboard loads (UI-01 cookie fix) → evidence route/page → operator item update → owner override confirm (GAP-OVR-01 UI) → dashboard reflects state → outcome → reassessment. No raw errors visible.

**Classification: UI_E2E_UNPROVEN — UI readiness is NOT claimed from service tests alone. UI-01 (dashboard) and UI-02 (inbox redirect) are code/type verified; browser proof pending.**
