# Owner Self-Use Release Notes — <YYYY-MM-DD>

> Fill one of these in per deploy so the owner self-use deployment is reproducible. Keep it in the owner's
> records, not necessarily in the repo. **Do not paste secret values here** — reference names/versions only.

## Release identity
- **Commit SHA:** `<git rev-parse HEAD>`
- **Branch / tag:** `<branch or tag>`
- **Deployed by:** `<name>`
- **Target origin (`NEXT_PUBLIC_APP_URL`):** `<https://...>`
- **NODE_ENV:** `production`

## Environment contract (names + set/unset only)
- Required present: `NODE_ENV` [SET], `DATABASE_URL` [SET], `NEXT_PUBLIC_APP_URL` [SET]
- Optional decided: Stripe `<on/off>`, Sentry `<on/off>`, `OPSIQ_DIAGNOSTIC_KEY` `<set/unset>`
- CI/test-only vars in prod: **none** (confirmed)

## Preflight results
- `npm run deployment:preflight`: `<READY / WARNING / BLOCKED>`
- `npm run validate:deployment`: `<READY / WARNING / BLOCKED>`
- `npx vitest run src/__tests__/deployment`: `<pass/fail>`

## Database
- `prisma migrate status` before: `<up-to-date / N pending>`
- `prisma migrate deploy`: `<applied migrations / none>`
- Backup/snapshot taken before migrate: `<yes/no + location>`

## Smoke test (per DEPLOYMENT_SMOKE_TEST_PLAN.md)
- S1 app up: `<pass/fail>`
- S3 owner login: `<pass/fail>`
- S4 cockpit renders: `<pass/fail>`
- S5/S6 manual entry loads + PII blocked: `<pass/fail>`
- S7 redacted save (if business exists): `<pass/skip>`
- S9 no secret leakage: `<pass/fail>`
- S11 diagnostic endpoints locked: `<pass/fail>`
- Overall: `<PASS / ROLLED BACK>`

## Changes in this release
- `<summary of what changed since last owner self-use deploy>`

## Issues / stop conditions hit
- `<none, or describe + action taken (see ROLLBACK_AND_STOP_CONDITIONS.md)>`

## Rollback plan for this release
- Previous known-good commit: `<sha>`
- DB restore point: `<snapshot id / none needed>`
