# Module 10 (Connectors & Data Intake) — Slice 5: Deployed Runtime Proof — Report

Status: **GATE — workflow created + merged to main, awaiting manual run.** Per the
runtime-proof gate rule, this slice creates the HTTP smoke script + the manual
workflow and stops; the GitHub App is 403-blocked from `workflow_dispatch`, so the
owner (arnab-netizen) triggers the run. Module 1 + all proven modules untouched.
Public/SaaS frozen.

## 1. What this slice delivers

- `scripts/smoke-owner-intake-runtime-proof.ts` — HTTP-only deployed runtime proof.
  Real authenticated owner session, then: upload a **valid** CSV →
  normalized candidate (`validationStatus: valid`, `ownerConfirmed: false`) → read
  → owner **confirm** (→ confirmed); upload an **invalid** CSV → candidate
  (`validationStatus: invalid`) → confirm must **fail closed** (4xx, §17); dashboard
  history reflects both; `/owner/intake` renders; `/owner` renders. Security: unauth
  401/403, foreign business ≥400, invalid payload (unsupported target domain) 4xx.
  Imports no server code, touches no DB, prints only masked IDs.
- `.github/workflows/module-10-data-intake-runtime-proof.yml` — manual, fail-closed
  (`workflow_dispatch`, confirm phrase `RUN_MODULE10_DATA_INTAKE_RUNTIME_PROOF`).

## 2. Hardening carried from the proven prior proofs

- **Step 0b capability probe**: an unauthenticated GET of
  `/api/owner/intake/dashboard` must return JSON 401/403, not the HTML app shell.
- **No `EXPECTED_COMMIT` SHA coupling** by default (optional manual override only).
- **Negative proof of the §17 guardrail**: the proof explicitly asserts an invalid
  candidate cannot be confirmed — a false-green here is impossible.

## 3. Verification (local)

| Gate | Result |
|---|---|
| `DRY_RUN=true npx tsx scripts/smoke-owner-intake-runtime-proof.ts` | DRY-RUN OK |
| `npx eslint scripts/smoke-owner-intake-runtime-proof.ts` | clean |
| workflow YAML parse | valid |

The deployed proof runs against `https://o-ps-iq.vercel.app` once the owner triggers
the workflow (the migration is applied; Slices 1–4 are on `main`).

## 4. Gate status

**Runtime-proof gate reached — stop.** Merged to `main` so the workflow is visible;
the owner runs **Module 10 Data Intake Runtime Proof** with confirm
`RUN_MODULE10_DATA_INTAKE_RUNTIME_PROOF`. On green, Slice 6 (audit) closes Module 10
at STAGING_PROVEN + AUDITED. Public/SaaS stays frozen.
