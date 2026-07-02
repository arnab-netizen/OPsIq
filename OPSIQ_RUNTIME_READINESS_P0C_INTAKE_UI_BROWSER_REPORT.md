# OpsIQ Runtime-Readiness — P0-C Intake UI + Browser Report

> Third and final P0 ingestion slice — the owner-facing UI + browser/mobile proof that closes out ingestion. Makes the
> two critical domains unblocked in P0-A actually enterable by a real owner through the app, and proves the flow in a
> real browser. Minimum-code, one slice per PR. No gate weakened; no fabricated data; no duplicate engine; no
> public-SaaS/billing/integration work.

## Branch & base
- Branch: `claude/runtime-readiness-p0c-intake-ui-browser`
- Base HEAD: `ab33a331` (main; after P0-A #78 + P0-B #79 merged).

## What was implemented
- **UI** (`src/app/(authenticated)/owner/operations/page.tsx`): a "Critical operations data" section with two
  collapsible forms — **Capacity snapshot** (→ `POST .../capacity-snapshots`, the `equipment_capacity` domain) and
  **Owner workload snapshot** (→ `POST .../workload-snapshots`, the `owner_workload_memory` / human-execution-reality
  domain). Each posts through the enforced P0-A route → service → DB and renders the computed result back to the owner
  (bottleneck utilization / growth headroom; daily-load band). Reuses the page's existing `api()` helper, business
  selector, and busy/error state. `data-testid`s added for the browser proof.
- **Browser + mobile spec** (`tests/browser/21-owner-critical-intake.spec.ts`): a real logged-in OWNER creates a
  business through the UI, then submits a capacity snapshot and an owner-workload snapshot; each must return a computed
  result rendered back. Mobile variant (375×812) additionally asserts no horizontal overflow. No client fakery; server
  enforcement (OWNER_MANAGE, workspace/business scope) stays active.
- **CI** (`.github/workflows/owner-pilot-e2e.yml`): added spec 21 to the existing owner-pilot browser lane (which
  already builds the app, seeds the E2E owner, boots the server, and runs the owner browser specs desktop + mobile).

## Files changed
- CHANGED `src/app/(authenticated)/owner/operations/page.tsx` (capacity + workload forms + handlers)
- NEW `tests/browser/21-owner-critical-intake.spec.ts`
- CHANGED `.github/workflows/owner-pilot-e2e.yml` (run spec 21)
- NEW `OPSIQ_RUNTIME_READINESS_P0C_INTAKE_UI_BROWSER_REPORT.md`

## DB / migration changes
**None.** Reuses the P0-A routes/services and existing tables.

## API changes
**None new** — the UI calls the P0-A routes merged in #78.

## UI changes
Two owner-facing forms on `/owner/operations` for the two critical domains, with computed-result feedback.

## Tests / checks run (local)
- `tsc --noEmit` ✓ · eslint(page + spec) 0/0 ✓ · lint:ratchet PASS (2155=2155) · workflow YAML valid.
- The **browser + mobile spec** and the app **build** run in the `owner-pilot-e2e` CI lane — not runnable locally (the
  harness terminates a sustained server). Consistent with every prior browser-proof slice.
- The underlying routes/services were already DB-proven and merged (P0-A #78: 6 DB tests; P0-B #79: 4 DB tests).

## Honest scope note (not overclaimed)
- Adds owner UI for the two previously-unreachable critical domains (capacity, workload). The other seven critical
  domains already had owner write paths; CSV `finance` materialization landed in P0-B.
- The browser/mobile proof is **CI-gated**; this report does not claim it observed-green until the PR's
  `owner-pilot-e2e` lane runs.

## Classification
**`P0_REAL_BUSINESS_INGESTION_UNBLOCKED`** (pending PR CI observation of the `owner-pilot-e2e` browser lane, per the
DB-proven→READY convention used by the prior packs):
- all critical domains now have real owner/staff intake paths (7 pre-existing + capacity/workload via #78 + this UI);
- `equipment_capacity` and `owner_workload_memory` are writable by a real owner through the app — no seed scripts;
- CSV confirm materializes into the read models (#79);
- the running app can leave `need_more_data` when all critical domains are present (DB-proven #78), and missing data
  still blocks correctly;
- DB proof passed (#78/#79); browser/mobile proof is CI-gated in this PR.

## Merge recommendation
Open PR; **do not merge** until CI is green — specifically observe the `owner-pilot-e2e` lane (spec 21 desktop +
mobile) green — and a final hostile re-read. Then P0 ingestion is fully closed and the next slice is **P1-A (B5 proof
loop)**. Public SaaS / billing / launch / integrations remain blocked.
