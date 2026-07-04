# Module 3 (Sales & Customer Intelligence) — Slice 7: Deployed Runtime Proof — Report

Status: **PREPARED — AWAITING MANUAL RUN (deployed runtime-proof gate).** The
smoke script + workflow are created and `DRY_RUN`-verified. The agent cannot run
it (the sandbox 403s the deployed app and cannot trigger a `workflow_dispatch`);
per the rules the runtime-proof workflow/script/report are created and the agent
**stops** for the manual run.

## 1. Why this is a gate

Per execution.md §23.8 (RUNTIME PROOF: create/read/update/verify/dashboard
reflects) and §1.1 ("CI passes but runtime is unverified" ⇒ not complete), the
Module 3 sales loop is only proven once it runs against the **deployed** app with
the sales migration applied. This is a manual gate.

## 2. Pre-conditions (met / required)

- Sales migration **applied** — ✅ "Module 3 Sales Migration" #1 (target
  `staging` — the DB the deployed app uses), `main`@`b19649f`, success.
- Slices 1–6 on `main` (engine→detector→planner→schema→API→UI+command-center) —
  ✅ merges `b19649f` + `06dda97`. This Slice 7 (script + workflow) merges next.
- Deployed app must include `main` (with the sales API + UI + command-center
  wiring). Vercel redeploys from `main`; step 0b (capability probe) confirms the
  sales routes are live before the flow runs.

## 3. Files created

- `scripts/smoke-owner-sales-runtime-proof.ts` — HTTP-only deployed proof
  (mirrors the proven cashflow smoke, **with** the capability-probe deploy check
  and **no** EXPECTED_COMMIT SHA coupling). Flow: build-info → **0b sales-API
  capability probe (JSON 401, not HTML)** → signup → create business → sales
  snapshot → read → diagnosis → read → findings → actions → action
  `proposed→assigned→in_progress→completed` (with evidence) → verify →
  `/api/owner/sales/dashboard` reflects business+snapshot+cycle+findings+actions+
  verification → `/owner/sales` renders → `/api/owner/command-center` **reflects
  the sales domain** + a prioritized next action → `/owner` renders. Security:
  unauth 401/403, foreign ≥400, invalid payload 4xx, invalid transition 4xx.
  Masked IDs only; never prints secrets; `DRY_RUN`/`--help`.
- `.github/workflows/module-3-sales-runtime-proof.yml` — manual `workflow_dispatch`
  (confirm `RUN_MODULE3_SALES_RUNTIME_PROOF`, default
  `base_url=https://o-ps-iq.vercel.app`), runs the script via `tsx`, uploads a
  masked log artifact, no migrations, no secrets printed.

## 4. Local verification

| Gate | Result |
|---|---|
| `DRY_RUN=true npx tsx scripts/smoke-owner-sales-runtime-proof.ts` | exit 0 (plan incl. step 0b, no network) |
| `npx eslint scripts/smoke-owner-sales-runtime-proof.ts` | clean |
| workflow YAML parse | valid (no EXPECTED_COMMIT SHA coupling) |

## 5. How to run (manual)

1. Ensure the deployed app (`https://o-ps-iq.vercel.app`) is built from `main`
   including Slices 1–7 (Vercel auto-deploys on the merge of this slice).
2. GitHub → Actions → **Module 3 Sales Runtime Proof** → Run workflow →
   `base_url = https://o-ps-iq.vercel.app`, `confirm = RUN_MODULE3_SALES_RUNTIME_PROOF`.
3. On success, record the run URL + deployed commit here and set Module 3
   Slice 7 ✅ in `OWNER_MODE_STATUS_REPORT.md`; then proceed to the Module 3 audit
   (Slice 8).

## 6. Gate status — STOP

This is the **deployed runtime-proof gate**. The agent stops here. Module 3
remains `built + locally proven; migration applied`; it is **not** claimed
deployed-runtime-proven until this workflow runs green (No False Green).
Public/SaaS stays frozen.

## Results (filled in after a PASSING run)

| Field | Value |
|---|---|
| Run URL | _pending_ |
| Deployed commit | _pending_ |
| Findings / actions | _pending_ |
| Verification status | _pending_ |
| Command center domains wired | _pending (expect …,sales)_ |
| Security (unauth/foreign/payload/transition) | _pending_ |
