# Module 4 (Operations & Productivity Intelligence) — Slice 7: Deployed Runtime Proof — Report

Status: **GATE — workflow created, awaiting manual run.** Per the runtime-proof
gate rule, this slice creates the HTTP smoke script + the manual workflow and
stops; the GitHub App is 403-blocked from `workflow_dispatch`, so the owner
(arnab-netizen) triggers the run after this is on `main`.

## 1. What this slice delivers

- `scripts/smoke-owner-operations-runtime-proof.ts` — HTTP-only deployed runtime
  proof. Real authenticated owner session (signup → cookie), then the full
  operations loop against the deployed app: snapshot → read → diagnosis →
  findings → actions → status machine (proposed→assigned→in_progress→completed)
  → before/after verification → dashboard reflection → `/owner/operations` page →
  `/api/owner/command-center` (asserts the `operations` domain is wired + a
  prioritized next action + execution-risk surfaced) → `/owner` page. Plus 4
  security checks: unauth blocked, foreign business blocked, invalid payload
  rejected, invalid transition rejected. Imports no server code, touches no DB,
  prints only masked IDs.
- `.github/workflows/module-4-operations-runtime-proof.yml` — manual,
  fail-closed (`workflow_dispatch`, confirm phrase
  `RUN_MODULE4_OPERATIONS_RUNTIME_PROOF`). `npm ci` + `prisma generate` (no DB),
  runs the script, uploads a masked log artifact.

## 2. Hardening carried from the proven sales/cashflow proofs

- **Step 0b capability probe**: an unauthenticated GET of
  `/api/owner/operations/dashboard` must return JSON 401/403 — if it returns the
  HTML app shell, the operations routes are not deployed (stale deploy) and the
  proof fails fast with a clear message.
- **No `EXPECTED_COMMIT` SHA coupling** by default (optional manual override
  only) — avoids the stale-deploy false-fails that the cashflow proof hit before
  this pattern was adopted.

## 3. Verification (local)

| Gate | Result |
|---|---|
| `DRY_RUN=true npx tsx scripts/smoke-owner-operations-runtime-proof.ts` | DRY-RUN OK (plan rendered, no requests) |
| `npx eslint scripts/smoke-owner-operations-runtime-proof.ts` | clean |
| workflow YAML parse | valid |

The deployed proof itself runs against `https://o-ps-iq.vercel.app` once the
owner triggers the workflow (the migration is already applied, so the
operations tables exist).

## 4. Gate status

**Runtime-proof gate reached — stop.** Next: owner merges to `main` (done in
this turn), redeploys, then runs **Module 4 Operations Runtime Proof** with
confirm `RUN_MODULE4_OPERATIONS_RUNTIME_PROOF`. On green, Slice 8 (audit) closes
Module 4 at STAGING_PROVEN + AUDITED. Public/SaaS stays frozen.
