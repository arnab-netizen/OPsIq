# Module 2 Finance — Runtime Proof Workflow Report

Status: **Workflow + script committed; deployed runtime proof NOT yet run.** No UI,
no migration, no schema change. Module 1 unchanged. Public/SaaS frozen.

## 1. Why runtime proof is needed before UI

Slices 0–6 proved the finance engine, diagnosis, planner, schema, services, and API
wiring locally (5565 tests green) and via `[db]`-gated service tests. But "compiles +
unit-green" is not "works on the deployed app." Before building UI on top of these
APIs, we must prove — on the real deployment, through a real owner session over HTTP —
that the finance loop persists and reads back correctly and that security holds.
Building UI against unproven APIs risks shipping a dashboard over a broken/wrongly-
wired runtime. So: deployed runtime proof first, UI second.

## 2. Workflow path

`.github/workflows/module-2-finance-runtime-proof.yml` — "Module 2 Finance Runtime
Proof": manual `workflow_dispatch` only; inputs `base_url`
(default `https://o-ps-iq.vercel.app`) + `confirm` (must equal
`RUN_MODULE2_FINANCE_RUNTIME_PROOF`, fail-closed); Node 20; `npm ci`;
`npx prisma generate`; runs the smoke script with `BASE_URL`; uploads a safe
masked-ID log artifact. No migration, no app deploy, no secrets printed.

## 3. Script path

`scripts/smoke-owner-finance-runtime-proof.ts` — HTTP-only; imports no server code;
needs no DB. Modes: live (default), `DRY_RUN=true`/`--dry-run` (plan only, no
network), `--help`. Synthetic owner email + business per run. Masked IDs only; never
prints cookies/tokens/secrets. Exits non-zero with the exact failing
endpoint+status on any failed step (it does not silently adapt to a changed contract).

## 4. Full API flow tested (deployed HTTP)

1. `GET /api/internal/build-info` (deployment present; optional `EXPECTED_COMMIT` gate
   refuses a stale deploy).
2. `POST /api/auth/signup` — real owner session (cookie kept in memory only).
3. `POST /api/owner/recovery/businesses` — create the business (finance reuses
   `OwnerBusiness`; the create route is Module 1's, read-only reuse).
4. `POST /api/owner/finance/businesses/{id}/snapshots` — create finance snapshot.
5. `GET /api/owner/finance/snapshots/{snapshotId}` — read snapshot.
6. `POST /api/owner/finance/businesses/{id}/diagnoses` — generate diagnosis (asserts
   findings + actions persisted).
7. `GET /api/owner/finance/diagnoses/{cycleId}` — read diagnosis.
8. `GET /api/owner/finance/diagnoses/{cycleId}/findings` — findings.
9. `GET /api/owner/finance/diagnoses/{cycleId}/actions` — actions.
10. `PATCH /api/owner/finance/actions/{id}` — `proposed → assigned → in_progress →
    completed` (with completionNotes + completionEvidence).
11. `POST /api/owner/finance/actions/{id}/verify` — record verification.
12. `GET /api/owner/finance/dashboard?businessId={id}` — asserts the dashboard
    reflects business + latest snapshot + latest cycle + findings + actions +
    verification + `domainScore.domain === "finance"` + recommendedNextAction.

## 5. Security checks tested

- **Unauthenticated** finance dashboard → must be 401/403.
- **Foreign business/workspace** (`GET businesses/{foreign-uuid}/snapshots` with a
  valid session) → must be ≥400.
- **Invalid payload** (`POST snapshot` with `revenue: -1`) → must be 4xx.
- **Invalid action transition** (`PATCH` a `completed` action → `in_progress`) → must
  be 4xx.

## 6. What is intentionally NOT tested

- No direct DB assertions (HTTP-only; persistence proven via read-back).
- No UI/dashboard page (Slice 7) — not built.
- No connectors, no public/SaaS, no Module 3.
- No load/performance, no concurrency.
- No second linked finance cycle (covered by the `[db]` service tests).
- The action status-update endpoint is exercised via **PATCH** (the implemented
  method, mirroring Module 1's recovery actions route).

## 7. Verification commands and results (local)

| Command | Result |
|---|---|
| YAML parse (workflow) | OK |
| `npx tsx scripts/...finance-runtime-proof.ts --help` | exit 0 |
| `DRY_RUN=true npx tsx scripts/...finance-runtime-proof.ts` | exit 0 (no network) |
| `npx eslint` (script) | clean |
| `git diff --check` | clean |
| `npx prisma validate` | valid 🚀 |
| `npm run lint:ratchet` | LINT_RATCHET_PASS (1500 — no increase) |
| `npm run build` | Compiled successfully |
| owner-finance (metrics/diagnosis/actions) + spine + founder-recovery | 115 passed |
| `npm test` | 199 files passed, **0 failed**; 5565 passed |

The deployed smoke was **not** run locally — the sandbox cannot reach the app (403 on
`/api/internal/build-info`). It must run from GitHub Actions. The deployed-commit
freshness check happens inside the script/workflow on a network-enabled runner.

## 8. Confirmation: no migration/schema/UI/public work

Confirmed — only a workflow + script + this report were added. `prisma/schema.prisma`
unchanged (valid), no migration created/run, no UI/pages, no public/SaaS/billing/
marketing, no Module 3.

## 9. Confirmation: Module 1 remains green

Confirmed — `founder-recovery` 38 passed; no recovery files touched.

## 10. Confirmation: public/SaaS remains frozen

Confirmed — frozen.

## 11. Next action after the workflow succeeds

Once "Module 2 Finance Runtime Proof" passes from the GitHub UI: record the run as the
finance runtime evidence (a MODULE2_FINANCE_RUNTIME_PROVEN report) and then **Slice 7
(finance dashboard UI)** may start. Until the workflow passes, finance APIs are **not**
runtime-proven and UI must not start.
