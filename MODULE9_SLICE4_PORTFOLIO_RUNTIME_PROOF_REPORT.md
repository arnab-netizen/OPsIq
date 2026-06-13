# Module 9 (Multi-Business Portfolio Command Center) — Slice 4: Deployed Runtime Proof — Report

Status: **GATE — workflow created + merged to main, awaiting manual run.** Per the
runtime-proof gate rule, this slice creates the HTTP smoke script + the manual
workflow and stops; the GitHub App is 403-blocked from `workflow_dispatch`, so the
owner (arnab-netizen) triggers the run. Module 1 + all proven modules untouched.
Public/SaaS frozen.

## 1. What this slice delivers

- `scripts/smoke-owner-portfolio-runtime-proof.ts` — HTTP-only deployed runtime
  proof for the read-only portfolio module. Because the portfolio owns no entity,
  the proof first **seeds** a real condition profile for a business via the
  deployed FINANCE loop (snapshot → diagnosis), then asserts:
  `/api/owner/portfolio/dashboard` reflects the business (hasData, financialScore,
  portfolioHealthScore) → `/api/owner/portfolio/ranking` marks it most-urgent →
  `/api/owner/portfolio/actions` returns top-3 priorities + the business's
  recommended next action → `/api/owner/portfolio/risks` returns alerts →
  `/owner/portfolio` page renders → `/owner` renders. Security: all four portfolio
  reads return 401/403 when unauthenticated. Imports no server code, touches no DB,
  prints only masked IDs.
- `.github/workflows/module-9-portfolio-runtime-proof.yml` — manual, fail-closed
  (`workflow_dispatch`, confirm phrase `RUN_MODULE9_PORTFOLIO_RUNTIME_PROOF`).

## 2. Hardening carried from the proven prior proofs

- **Step 0b capability probe**: an unauthenticated GET of
  `/api/owner/portfolio/dashboard` must return JSON 401/403 — if it returns the
  HTML app shell, the portfolio routes are not deployed (stale deploy) and the
  proof fails fast.
- **No `EXPECTED_COMMIT` SHA coupling** by default (optional manual override only).

## 3. Verification (local)

| Gate | Result |
|---|---|
| `DRY_RUN=true npx tsx scripts/smoke-owner-portfolio-runtime-proof.ts` | DRY-RUN OK |
| `npx eslint scripts/smoke-owner-portfolio-runtime-proof.ts` | clean |
| workflow YAML parse | valid |

The deployed proof runs against `https://o-ps-iq.vercel.app` once the owner triggers
the workflow (Slices 1–3 are on `main`; no migration needed — read-only module).

## 4. Gate status

**Runtime-proof gate reached — stop.** Merged to `main` so the workflow is visible;
the owner runs **Module 9 Portfolio Runtime Proof** with confirm
`RUN_MODULE9_PORTFOLIO_RUNTIME_PROOF`. On green, Slice 5 (audit) closes Module 9 at
STAGING_PROVEN + AUDITED. Public/SaaS stays frozen.
