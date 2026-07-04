# Module 12 (Owner UI & Mobile Usability) — Slice 4: Deployed Runtime Proof — Report

Status: **GATE — workflow created + merged to main, awaiting manual run.** Per the
runtime-proof gate rule, this slice creates the HTTP smoke script + the manual workflow
and stops; the GitHub App is 403-blocked from `workflow_dispatch`, so the owner
(arnab-netizen) triggers the run. Module 1 + all proven modules untouched. Public/SaaS
frozen.

## 1. What this slice delivers

- `scripts/smoke-owner-home-runtime-proof.ts` — HTTP-only deployed runtime proof for
  the read-only owner-home module. Owner Home owns no entity, so the proof first
  **seeds** a real diagnosis cycle for a business via the deployed FINANCE loop
  (snapshot → diagnosis), then asserts the §19 summary at `/api/owner/home`:
  business health is a real number; cash/sales/operations dangers are honest
  `unknown` (no such diagnosis) — not 0; finance produced ≥1 top risk and ≥1 required
  action, each carrying its verification metric; `/owner/home` renders. It then
  advances one finance action (assigned → in_progress), records a **verified
  improvement**, and asserts the home's "last verified improvement" surfaces it.
  Security: the owner-home read returns 401/403 unauthenticated. Imports no server
  code, touches no DB, prints only masked IDs.
- `.github/workflows/module-12-owner-home-runtime-proof.yml` — manual, fail-closed
  (`workflow_dispatch`, confirm phrase `RUN_MODULE12_OWNER_HOME_RUNTIME_PROOF`).

## 2. Hardening carried from the proven prior proofs

- **Step 0b capability probe**: an unauthenticated GET of `/api/owner/home` must
  return JSON 401/403 — if it returns the HTML app shell, the route is not deployed
  (stale deploy) and the proof fails fast.
- **No `EXPECTED_COMMIT` SHA coupling** by default (optional manual override only).
- **Verification-loop proof**: the home is proven to reflect a real recorded
  before/after improvement, not just static reads — closing the §19 "last verified
  improvement" requirement on the deployment.

## 3. Verification

| Gate | Result |
|---|---|
| `DRY_RUN=true npx tsx scripts/smoke-owner-home-runtime-proof.ts` | DRY-RUN OK |
| `npx eslint scripts/smoke-owner-home-runtime-proof.ts` | clean |
| `npm run lint:ratchet` | PASS (1500/1153; no regression) |

The deployed proof runs against `https://o-ps-iq.vercel.app` once the owner triggers
the workflow (Slices 1–3 are on `main`; no migration needed — read-only module).

## 4. Gate status

**Runtime-proof gate reached — stop.** Merged to `main` so the workflow is visible;
the owner runs **Module 12 Owner Home Runtime Proof** with confirm
`RUN_MODULE12_OWNER_HOME_RUNTIME_PROOF`. On green, Slice 5 (audit) closes Module 12 at
STAGING_PROVEN + AUDITED. Public/SaaS stays frozen.
