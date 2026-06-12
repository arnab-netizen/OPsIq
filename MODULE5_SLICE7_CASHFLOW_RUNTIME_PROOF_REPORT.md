# Module 5 (Cashflow Intelligence) — Slice 7: Deployed Runtime Proof — Report

Status: **PREPARED — AWAITING MANUAL RUN (deployed runtime-proof gate).** The
smoke script + workflow are created and locally `DRY_RUN`-verified. The agent
**cannot** run it (the sandbox 403s the deployed app and cannot trigger a
`workflow_dispatch`); per the execution rules the runtime-proof workflow/script/
report are created and the agent **stops** for the manual run.

## 1. Why this is a gate

Per execution.md §23.8 (RUNTIME PROOF: create/read/update/verify/dashboard
reflects) and the No-False-Green rule (§1.1: "CI passes but runtime is
unverified" ⇒ not complete), the Module 5 loop is only proven once it runs
against the **deployed** app with the cashflow migration applied. This is a
manual gate.

## 2. Pre-conditions (met / required)

- Cashflow migration **applied** to the target DB — ✅ "Module 5 Cashflow
  Migration" #1 on `main`@`31eaa6f` (run 27437421587) and re-confirmed idempotent
  on the post-merge `main`@`362934e` ("Module 5 Cashflow Migration" #2 — Success,
  no-op deploy).
- Slices 5–7 (cashflow API + UI + command-center wiring + runtime-proof
  script/workflow) **merged to `main`** — ✅ merge `362934e`.
- Deployed app must include `main`@`362934e` (the cashflow routes + `/owner/cashflow`
  + command-center cashflow wiring). Vercel redeploys from `main`; **confirm the
  deploy is live via `/api/internal/build-info` (commit `362934e` or later) before
  running** — the script also fails closed if `EXPECTED_COMMIT` is set and stale.
- An owner can sign up (the script creates a synthetic owner per run).

All code/migration preconditions are now met; the only remaining step is the
Vercel redeploy of `main`@`362934e` and the manual workflow dispatch below.

## 3. Files created

- `scripts/smoke-owner-cashflow-runtime-proof.ts` — HTTP-only deployed proof
  (mirrors the proven finance smoke). Flow: build-info → signup → create business
  → cashflow snapshot → read → diagnosis → read → findings → actions → action
  `proposed→assigned→in_progress→completed` (with evidence) → verify →
  `/api/owner/cashflow/dashboard` reflects business+snapshot+cycle+findings+
  actions+verification → `/owner/cashflow` page renders → `/api/owner/command-center`
  **reflects the cashflow domain** + a prioritized next action → `/owner` renders.
  Security: unauth 401/403, foreign business ≥400, invalid payload 4xx, invalid
  transition (completed→in_progress) 4xx. Masked IDs only; never prints secrets;
  exits non-zero on the exact failing step/endpoint/status; `DRY_RUN`/`--help`.
- `.github/workflows/module-5-cashflow-runtime-proof.yml` — manual
  `workflow_dispatch` (confirm `RUN_MODULE5_CASHFLOW_RUNTIME_PROOF`, default
  `base_url=https://o-ps-iq.vercel.app`), runs the script via `tsx`, uploads a
  masked log artifact, no migrations, no secrets printed.

## 4. Local verification

| Gate | Result |
|---|---|
| `DRY_RUN=true npx tsx scripts/smoke-owner-cashflow-runtime-proof.ts` | exit 0 (plan rendered, no network) |
| `npx eslint scripts/smoke-owner-cashflow-runtime-proof.ts` | clean |
| `npx prisma validate` / `npm run build` | unaffected (script imports no server code) |

## 5. How to run (manual)

1. Ensure the deployed app (`https://o-ps-iq.vercel.app`) is built from `main`
   including Slices 5–6 (check `/api/internal/build-info` commit).
2. GitHub → Actions → **Module 5 Cashflow Runtime Proof** → Run workflow →
   `base_url = https://o-ps-iq.vercel.app`, `confirm = RUN_MODULE5_CASHFLOW_RUNTIME_PROOF`.
3. On success, record the run URL + deployed commit here and set Module 5 status
   to STAGING_PROVEN in `OWNER_MODE_STATUS_REPORT.md`.

## 6. Gate status — STOP

This is the **deployed runtime-proof gate**. The agent stops here. Module 5
remains `built + locally proven`; it is **not** claimed deployed-runtime-proven
until this workflow runs green (No False Green). Public/SaaS stays frozen;
real-business validation (M13) remains a separate release gate.

## Run #1 — FAILED (deployment stale, not a code defect)

- Result: **Failure** (57s), `main`@`362934e`, `base_url=https://o-ps-iq.vercel.app`.
- **Root cause (execution.md §4 class #11 — deployment/environment):** the run
  reported `deployed commit: 31eaa6f (env: production)` — production was still on
  the **Slices 1–4 merge (`31eaa6f`)**, which has the cashflow *tables* but **not**
  the cashflow *API routes* (those landed in `362934e`). Steps 0–2 (build-info /
  signup / create business) passed; **step 3 (`POST /api/owner/cashflow/.../snapshots`)
  returned `status 200` with an HTML body** (`<!DOCTYPE html>…`) — i.e. Next.js
  served the app shell because the route does not exist on that build. The script
  **correctly fail-closed** (expected `201` + JSON `id`).
- **Not a code bug:** the cashflow API is CI-green and locally proven; it simply
  was not deployed yet. No false green — the gate stays open.

### Fix applied (gate tooling hardening)

`module-5-cashflow-runtime-proof.yml` now passes `EXPECTED_COMMIT: ${{ github.sha }}`
so the proof **fails fast at step 0** with an explicit "deployment is stale"
message (deployed commit ≠ the commit under test) instead of a confusing mid-flow
HTML failure. No change to the proof's substance.

### Re-run requirement

1. Ensure **production is redeployed to `main`@`362934e` or later** — confirm
   `/api/internal/build-info` reports `362934e` (Vercel auto-deploys from `main`;
   the earlier run hit a deploy that had not advanced past `31eaa6f`).
2. Re-dispatch **Module 5 Cashflow Runtime Proof**
   (`confirm = RUN_MODULE5_CASHFLOW_RUNTIME_PROOF`).

## Results (filled in after a PASSING run)

| Field | Value |
|---|---|
| Run URL | _pending (run #1 = FAIL: stale deploy 31eaa6f)_ |
| Deployed commit | _must be `362934e`+ (run #1 saw stale `31eaa6f`)_ |
| Findings / actions | _pending_ |
| Verification status | _pending_ |
| Command center domains wired | _pending (expect …,cashflow)_ |
| Security (unauth/foreign/payload/transition) | _pending_ |
