# Deployment Smoke Test Plan — Owner Self-Use

**Date:** 2026-07-07. Run immediately after the app is serving on the target host. Each step has an explicit
pass condition. Machine-readable version: `../../audits/2026-07-07-deploy-manifest-runtime-env-readiness/SMOKE_TEST_MATRIX.json`.

Scripted helpers already in the repo: `npm run deployment:smoke` (`scripts/production-smoke.mjs`) and
`npm run smoke:prod` (`scripts/smoke-tests.ts`). The manual steps below are the authoritative acceptance
gate and cover the owner-critical paths.

| # | Step | How | Pass condition |
|---|---|---|---|
| S1 | App is up | `GET /login` on the production origin | HTTP response (any non-`000`); login page renders. |
| S2 | Static/build integrity | Load the app root in a browser | No hydration failure, no `Cannot read…`/`is not a function` fatal console error. |
| S3 | Owner can authenticate | Log in as the owner account | Session cookie set (`Secure` in production); redirected to an authenticated surface. |
| S4 | Cockpit renders | Open `/owner/cockpit` | Cockpit loads with the governed top action / missing-data / evidence surfaces; no server error. |
| S5 | Manual entry reachable | Open `/owner/manual-entry` (sidebar "Log business data") | Page loads; mandatory privacy warning + placeholders visible. |
| S6 | PII is blocked | In a section note, enter a name/phone/email and Save | Rejected with redaction guidance (client + server `422 pii_blocked`); nothing saved. |
| S7 | Redacted save works | Enter a redacted operational note (e.g. `CUSTOMER_001`) and Save | Persists through the governed backend; success confirmation shown. |
| S8 | No external action | Observe the app during S1–S7 | No outbound contact to any customer/staff/vendor/third party; OpsIQ takes no external action. |
| S9 | No secret leakage | Inspect responses/HTML/logs during smoke | No `DATABASE_URL`, no `sk_live`/`sk_test`, no `whsec_`, no diagnostic key in any response or client bundle. |
| S10 | DB writes are governed + audited | After S7, confirm the intake exists | An owner-confirmed `OwnerDataIntake` row + audit event; no raw PII stored. |
| S11 | Diagnostic endpoints locked | `GET` an `/api/internal/*` or `/api/ops/*` endpoint without a key | Fail-closed (denied) when `OPSIQ_DIAGNOSTIC_KEY` is unset. |

**Overall pass:** S1–S6, S8, S9, S11 must pass. S7/S10 pass when a business exists for the owner (skip only
in an empty environment, and record the skip). Any failure of S6, S8, S9, or S11 is a **stop condition** —
see `ROLLBACK_AND_STOP_CONDITIONS.md`.
