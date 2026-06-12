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

## Run #2 — FAILED fast (guard working; deploy still stale)

`EXPECTED_COMMIT` guard fired correctly: failed at **step 0** with
`commit 31eaa6f != expected 39c5fca — deployment may be stale`. Confirmed
production had not advanced. Fix: merged the latest `main` (`757b709`) to
re-trigger the Vercel production deploy.

## Run #3 — FAILED at diagnosis (real bug found → fixed)

- Production correctly advanced to **`757b709`** (Vercel: Production / Current /
  Ready). Steps 0–4 **passed**: build-info `757b709`, signup, create business,
  **cashflow snapshot persisted** (`dataConfidence 85`), read snapshot — proving
  the deploy + cashflow API + tables work end-to-end.
- **FAIL at step 5 (`POST .../diagnoses`): HTTP 500**, body
  `{"errorName":"PrismaClientKnownRequestError","prismaCode":"P2028",...}`.
- **Root cause (real defect, first real-DB exercise of the cashflow transaction —
  the `[db]` test is gated, so CI never hit it):** the diagnosis persisted the
  cycle + findings + actions as **~20+ sequential `create` round-trips inside one
  interactive transaction**. The cashflow *crisis* snapshot emits ~11 findings +
  ~11 actions — far more than the finance test — so the transaction exceeded the
  **default 5s interactive-transaction limit** on the pooled Neon connection
  (Prisma **P2028**). The runtime proof correctly caught it (no false green).

### Fix applied (`src/services/owner-cashflow/diagnosis.service.ts`)

Build all rows (with stable pre-generated IDs) **outside** the transaction, then
write them with **`createMany`** (findings before actions, so the action→finding
FK holds) inside `db.$transaction(..., { maxWait: 10000, timeout: 20000 })`. The
governed write stays atomic but is now ~3 statements instead of ~20, well within
the limit. Local: build ✓, eslint ✓, cashflow tests 57 ✓, ratchet ✓, full suite ✓.

## Runs #5/#6 — FAILED on a brittle deploy check (root-caused + properly fixed)

Runs #5/#6 (dispatched from `main`@`b13ce58`) failed at step 0 with
`commit 362934e != expected b13ce58 — deployment may be stale`. **Root cause: the
`EXPECTED_COMMIT = github.sha` guard I added was the wrong mechanism** — it
requires the deployed commit to byte-match the workflow commit, which **races with
the Vercel deploy** (the run fired ~1 min before `b13ce58` finished building, so
production was momentarily still `362934e`) and fails for reasons unrelated to
whether the cashflow feature works. That was patch-work, not a proper check.

### Proper fix (no SHA coupling)

- **Removed `EXPECTED_COMMIT` wiring** from `module-5-cashflow-runtime-proof.yml`
  (kept only as an optional manual override in the script).
- **Added a deterministic capability probe (step 0b):** an unauthenticated
  `GET /api/owner/cashflow/dashboard` must return a **JSON `401/403`** (route
  deployed); a build lacking the route returns the Next.js **HTML app shell**,
  which fails fast with "cashflow routes are NOT deployed (stale deploy)". This
  proves the *feature* is live — the thing that actually matters — independent of
  deploy timing or exact SHA. `build-info` commit is now informational only.

This removes the repeated stale-deploy false-failures while keeping the proof
honest: it still refuses to run against a deploy that lacks the cashflow API.

## Re-run requirement

1. Production already carries the cashflow API + the P2028 fix (`b13ce58`). Merge
   this proof-check fix to `main`; no exact-SHA wait is needed anymore.
2. Re-dispatch **Module 5 Cashflow Runtime Proof** from `main`
   (`confirm = RUN_MODULE5_CASHFLOW_RUNTIME_PROOF`). Step 0b now confirms the
   cashflow API is deployed, then the full loop runs (the P2028 fix lets the
   diagnosis persist).

## Results (filled in after a PASSING run)

| Field | Value |
|---|---|
| Run URL | _pending (run #1 = FAIL: stale deploy 31eaa6f)_ |
| Deployed commit | _must be `362934e`+ (run #1 saw stale `31eaa6f`)_ |
| Findings / actions | _pending_ |
| Verification status | _pending_ |
| Command center domains wired | _pending (expect …,cashflow)_ |
| Security (unauth/foreign/payload/transition) | _pending_ |
