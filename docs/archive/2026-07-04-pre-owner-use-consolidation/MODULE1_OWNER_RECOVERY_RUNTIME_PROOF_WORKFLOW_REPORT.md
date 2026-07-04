# Module 1 Owner Recovery — Runtime Proof Workflow Report

Date: 2026-06-11
Branch: `main`

## 1. Why runtime proof was blocked from the sandbox

The agent sandbox cannot execute the deployed runtime proof:
- The deployed app (`https://o-ps-iq.vercel.app`) returns **HTTP 403 to every
  request from this sandbox** (`/`, `/login`, `/api/internal/build-info`), so no
  HTTP flow can be driven from here.
- The migrated **Neon database is unreachable** from the sandbox (TCP 5432 egress
  blocked), so persistence cannot be inspected directly.
- The only outbound HTTP tool here (WebFetch) is **stateless and cannot
  authenticate**, so it cannot hold an owner session cookie across the multi-step
  flow.

## 2. Why GitHub Actions is the correct proof environment

The existing `smoke-production-*` workflows hit `https://o-ps-iq.vercel.app`
directly **with no auth bypass** and pass from GitHub Actions runners — proving the
app is reachable and the signup→session→API flow works from that environment. A
GitHub-hosted runner therefore can: resolve + reach the deployment, create a real
owner session via `/api/auth/signup`, carry the session cookie through the owner
recovery API calls, and read back persisted state — exactly what the proof needs,
without any direct DB access.

## 3. Workflow path

`.github/workflows/module-1-owner-recovery-runtime-proof.yml`
- `workflow_dispatch` only (manual). Runs on whatever ref is selected — run it on
  `main`.
- Inputs: `base_url` (default `https://o-ps-iq.vercel.app`), `confirm` (required).
- **Fail-closed:** the first step aborts unless `confirm == RUN_OWNER_RECOVERY_RUNTIME_PROOF`.
- Node 20, `npm ci` (full install — the script runs via the `tsx` devDependency),
  runs the smoke script with `BASE_URL`, uploads a **safe** log artifact
  (masked IDs only), and prints pass/fail.
- No migration step, no DB env, no secret echoing.

## 4. Script path

`scripts/smoke-owner-recovery-runtime-proof.ts`
- HTTP-only; imports no server code; needs no `DATABASE_URL` / Prisma client (so no
  `prisma generate` is required).
- Modes: live (default), `DRY_RUN=true` / `--dry-run` (plan only, no network),
  `--help`.
- Synthetic, unique-per-run owner email (`opsiq-owner-runtime+<ts>@example.com`) and
  synthetic business name (`Tumbledry Mukundapur Runtime Proof <ts>`), currency INR.

## 5. Runtime flow tested (deployed HTTP)

1. `GET /api/internal/build-info` — deployment present; logs truncated commit
   (optional `EXPECTED_COMMIT` gate to refuse a stale deploy).
2. `POST /api/auth/signup` — real owner session; captures the session cookie in
   memory (never printed).
3. `GET /owner/recovery` — route reachable (must not 5xx).
4. `POST /api/owner/recovery/businesses` — create INR business (asserts `currency==INR`).
5. `POST /api/owner/recovery/businesses/{id}/snapshots` — metric snapshot (INR).
6. `POST /api/owner/recovery/businesses/{id}/cycles` — run diagnosis.
7. Assert **findings persisted** and **recovery actions persisted** (non-empty).
8. `GET /api/owner/recovery/dashboard?businessId={id}` — dashboard reads (`hasData`).
9. `PATCH /api/owner/recovery/actions/{id}` — complete an action through the real
   state machine `proposed → assigned → in_progress → completed` (with completion
   evidence), using optimistic `version` each step.
10. `POST /api/owner/recovery/actions/{id}/verify` — record verification.
11. `GET dashboard` again — asserts the action shows `completed` and the
    verification is reflected.

## 6. Security checks tested

- **Unauthenticated blocked:** `GET dashboard` with no cookie must return 401/403.
- **Cross-business blocked:** `GET businesses/{foreign-uuid}` with a valid session
  must return ≥400 (not found / forbidden — workspace ownership enforced).
- **Invalid transition rejected:** `PATCH` a `completed` (terminal) action to
  `in_progress` must return ≥400.

Each check asserts the exact expected status; on mismatch the script prints the
endpoint + status + truncated body and exits non-zero (it does not silently adapt).

## 7. What is intentionally NOT tested

- No direct database assertions (HTTP-only by design; persistence is proven
  indirectly via read-back through the dashboard/cycle responses).
- No load/performance, no concurrency races.
- No email-verification / password-reset flows.
- No second linked recovery cycle (the service-layer smoke
  `scripts/smoke-owner-recovery-runtime.ts` covers cycle-linking against a local DB;
  this proof focuses on the deployed HTTP loop + persistence read-back + security).
- No public/SaaS/billing/marketing surfaces.

## 8. Commands run and results (local)

| Command | Result |
|---|---|
| YAML parse (`yaml.safe_load`) | YAML OK |
| `npx tsx scripts/...runtime-proof.ts --help` | exit 0 (plan rendered) |
| `DRY_RUN=true npx tsx scripts/...runtime-proof.ts` | exit 0 (no network calls) |
| `npx tsc --noEmit` | no errors referencing the new script |
| `git diff --check` | clean |
| `npm run lint:ratchet` | LINT_RATCHET_PASS (1500 errors — no increase) |
| `npx prisma validate` | valid 🚀 |
| `npm run build` | Compiled successfully |
| `npx vitest run src/__tests__/founder-recovery/` | 38 passed, 8 skipped |
| `npm test` | 193 files passed, 15 skipped, **0 failed**; 5473 tests passed |

The deployed smoke was **not** run locally — the sandbox cannot reach the app
(403). It must run from GitHub Actions. Local verification confirms the script
loads, typechecks, and dry-runs cleanly.

## 9. No secrets printed

Confirmed. The script logs only masked/truncated IDs (`maskId`) and never prints
cookies, tokens, DB URLs, or secret values. The workflow echoes no secrets; the
uploaded artifact contains only the masked smoke log.

## 10. No migration run

Confirmed. Neither the workflow nor the script runs `prisma migrate`/`db push`/any
migration. No DB direct access.

## 11. Module 2 remains blocked

Confirmed — no Module 2 work. Module 2 stays blocked until this runtime proof
passes (and `OWNER_MODE_STAGING_PROVEN` is earned).

## 12. Public/SaaS remains frozen

Confirmed — no public/SaaS/billing/marketing files touched.
