# Module 7 (SOP, Process & Execution Accountability) — Slice 7: Deployed Runtime Proof — Report

Status: **GATE — workflow created + merged to main, awaiting manual run.** Per the
runtime-proof gate rule, this slice creates the HTTP smoke script + the manual
workflow and stops; the GitHub App is 403-blocked from `workflow_dispatch`, so the
owner (arnab-netizen) triggers the run. Module 1 + all proven modules untouched.
Public/SaaS frozen.

## 1. What this slice delivers

- `scripts/smoke-owner-sop-runtime-proof.ts` — HTTP-only deployed runtime proof.
  Real authenticated owner session (signup → cookie), then the full execution
  loop against the deployed app: snapshot → read → diagnosis → findings → actions
  → status machine (proposed→assigned→in_progress→completed) → before/after
  verification → dashboard reflection → `/owner/execution` page →
  `/api/owner/command-center` (asserts the `sop` domain is wired + a prioritized
  next action + execution risk surfaced) → `/owner` page. Plus 4 security checks:
  unauth blocked, foreign business blocked, invalid payload rejected, invalid
  transition rejected. Imports no server code, touches no DB, prints only masked
  IDs.
- `.github/workflows/module-7-sop-runtime-proof.yml` — manual, fail-closed
  (`workflow_dispatch`, confirm phrase `RUN_MODULE7_SOP_RUNTIME_PROOF`). `npm ci`
  + `prisma generate` (no DB), runs the script, uploads a masked log artifact.

## 2. Hardening carried from the proven sales/cashflow/operations proofs

- **Step 0b capability probe**: an unauthenticated GET of
  `/api/owner/sop/dashboard` must return JSON 401/403 — if it returns the HTML app
  shell, the sop routes are not deployed (stale deploy) and the proof fails fast.
- **No `EXPECTED_COMMIT` SHA coupling** by default (optional manual override only)
  — avoids stale-deploy false-fails.

## 3. Verification (local)

| Gate | Result |
|---|---|
| `DRY_RUN=true npx tsx scripts/smoke-owner-sop-runtime-proof.ts` | DRY-RUN OK (plan rendered, no requests) |
| `npx eslint scripts/smoke-owner-sop-runtime-proof.ts` | clean |
| workflow YAML parse | valid |

The deployed proof itself runs against `https://o-ps-iq.vercel.app` once the owner
triggers the workflow (the migration is already applied, so the sop tables exist;
Slices 5–6 are on `main`).

## 4. Gate status

**Runtime-proof gate reached — stop.** Merged to `main` so the workflow is visible;
the owner runs **Module 7 SOP Runtime Proof** with confirm
`RUN_MODULE7_SOP_RUNTIME_PROOF`. On green, Slice 8 (audit) closes Module 7 at
STAGING_PROVEN + AUDITED. Public/SaaS stays frozen.
