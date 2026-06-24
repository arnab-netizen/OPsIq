# OWNER MODE TRIAL READINESS + EXTERNAL CONNECTION AUDIT

Date: 2026-06-23
Branch: `claude/opsiq-owner-mode-decision-os-3tgwkm` · Commit: `835d5c5`
Scope: **Owner Mode only.** Public SaaS / billing / Product Hunt / public onboarding = OUT OF SCOPE, not touched.
Type: hostile, skeptical, minimum-cost **audit** (no integrations built, no code changed except — if any — a tiny doc fix).

Companion: `OPSIQ_OWNER_MODE_DECISION_OS_STATE_AUDIT.md`, `OWNER_MODE_DECISION_OS_RELIABILITY_REPORT.md`, `OWNER_MODE_DECISION_OS_ARCHITECTURE.md`, `CURRENT_WORKFLOW_STATE.md`.

---

## 1. Executive verdict

An Owner Mode internal trial is **feasible at zero external cost using manual/CSV inputs** — but it is **NOT yet trial-ready** because two things are unproven/unresolved in this environment:

1. **DB-backed proof has not been run** (persistence, the §13 security negative matrix, live scored benchmark). This is an *environment* gap, not a known defect — and it is closable **for free** (the CI workflow already runs a `postgres:16` service container).
2. A **deterministic, un-quarantined test failure exists in the owner CSV-intake path** (`intake-adapter`), which both reds CI's blocking lane and reflects a real intake-grading behavior owners will hit.

The single hard external dependency for the whole trial is **PostgreSQL**. There is **no LLM/AI provider**, **no billing**, and **no third-party connector** required — Owner Mode is deterministic/rule-based and manual-input-first.

## 2. Current classification

`NOT_READY_FOR_OWNER_TRIAL` → becomes `OWNER_TRIAL_READY_WITH_MANUAL_INPUTS` once the two blockers in §14 clear. (Implementation itself is OWNER_INTERNAL_ALPHA per the reliability report.)

## 3. What is already sufficient for owner trial

- **Deterministic engine, no AI key:** the only LLM reference in code is a guard `/llm_output/i` in `owner-dashboard.ts` that *rejects* LLM text as evidence (§1.11). No `OPENAI_API_KEY`/`ANTHROPIC_API_KEY`/etc. is read anywhere. No AI provider to procure.
- **Auth needs no external provider:** DB-backed session cookie (`.env.example` §3); `AUTH_SECRET` optional. No NextAuth/JWT/OAuth provider required.
- **File uploads work locally:** `STORAGE_PROVIDER=local` (`./uploads`) default; owner intake upload routes exist (`/api/owner/intake/.../uploads`). S3 is optional.
- **Scheduler/cache local:** `SCHEDULER_PROVIDER=in-memory` default; Redis optional.
- **Manual/CSV intake path exists:** `domain/owner-intake/engine.ts` (`buildCsvIntake`) + `INTAKE_FIELD_SPECS` (finance/sales/operations/sop/marketing) + `assembleBusinessFactsContract`. No bank/POS/accounting connector needed.
- **Owner-mode logic is broadly green** at pure/service/handler/end-to-end-harness level (see reliability report; e.g. full-loop + SMB harness 716, learning 426+152).
- **Free DB-test path already wired:** `.github/workflows/ci.yml` runs `services: postgres:16`, `TEST_WITH_DB=true`, `prisma migrate deploy` → `vitest run` with a quarantine split.

## 4. What is not yet proven

- DB-backed persistence + cross-workspace/operator-denied negatives (`*.db.test.ts`, e.g. `private-mode/role-access.service.db.test.ts`, `business-condition-profile.service.db.test.ts`, `file-intake/persist-file-intake.service.db.test.ts`) — **not run here** (no reachable DB).
- A **live scored benchmark** (root-cause/first-action accuracy, dangerous/hallucinated/overclaim rates vs §34 thresholds) — harness is green, but no scored run.
- A **full-suite green run** — exceeds container wall-clock; CI runs it sharded by `--maxWorkers 1` with quarantine.
- **The intake-adapter failure is deterministic and NOT quarantined** (see §14).

## 5. Required external connections before owner trial

| Connection | Required now? | Free/manual path | Notes |
|---|---|---|---|
| **PostgreSQL (DATABASE_URL)** | **YES — the only hard one** | Local Postgres server, OR GitHub Actions `postgres:16` service (already in ci.yml), OR free-tier Neon | A Neon pooled URL is already present in this runtime env but was **unreachable** from this container (psql timed out 2m). For the trial the owner needs ONE reachable Postgres. |

That is the entire "required external connection" list. Everything else is optional or manual.

## 6. Optional external connections for later

| Connection | Use | Status |
|---|---|---|
| S3 / object storage (`STORAGE_S3_*`, `AWS_*`) | durable upload storage at scale | OPTIONAL — local storage suffices for trial |
| Redis (`REDIS_URL`) | scheduler/cache | OPTIONAL — in-memory default |
| Sentry / Datadog / New Relic | error tracking / APM | OPTIONAL_FOR_OWNER_TRIAL (recommended for visibility, not required) |
| Email/SMS/WhatsApp | notifications | NOT_USED for trial; no provider wired |
| Bank / POS / accounting / CRM connectors | auto data import | NOT REQUIRED — manual CSV/entry replaces them (§1.9 manual-input-first) |
| Google Sheets/Drive, browser automation, scraping | data import | NOT REQUIRED / OUT OF SCOPE |

## 7. Public SaaS-only connections to ignore (OUT OF SCOPE)

Stripe (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`), billing, Product Hunt, public pricing/onboarding/marketing, public analytics. `.env.example` confirms Stripe is lazily initialised and **not required to boot** (missing ⇒ billing disabled warning). **Not coupled to Owner Mode** — no decoupling work needed. Do not configure.

## 8. Required environment variables / secrets

**Hard-required (from `scripts/validate-deployment.ts` + `.env.example`):**
- `DATABASE_URL` (pooled runtime URL)
- `NODE_ENV` (`development` for local trial)
- `NEXT_PUBLIC_APP_URL` (e.g. `http://localhost:3000`)

**Required only for migrations (CI/deploy):** `MIGRATION_DATABASE_URL` (direct/non-pooler) — falls back to `DATABASE_URL` locally.
**Test-only:** `TEST_WITH_DB=true` + `DATABASE_URL`/`DATABASE_URL_TEST` pointing at a throwaway test DB.
**Optional:** `AUTH_SECRET`, `SENTRY_DSN`, `OPSIQ_DIAGNOSTIC_KEY`, `LOG_LEVEL`, storage/redis vars, all Stripe vars (skip).

## 9. Required DB / test setup (no-cost first)

Owner Mode is `TEST_WITH_DB`-gated; without it the harness logs "skipping DB initialization". To clear the DB blocker, in cost order:

**Path 1 — GitHub Actions (FREE, already configured):** push to the branch; `ci.yml` spins `postgres:16`, runs `prisma migrate deploy` + `prisma generate` + the full `vitest` suite (blocking lane minus quarantine) + the quarantine lane (visibility). This is the recommended way to obtain DB-backed + full-suite proof at zero cost.

**Path 2 — Local Postgres (FREE):**
```
# start a local postgres 16 (server not present in this container)
createdb opsiq_test
export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/opsiq_test
export DATABASE_URL_TEST=$DATABASE_URL TEST_WITH_DB=true
npx prisma migrate deploy && npx prisma generate
npx prisma validate
TEST_WITH_DB=true npx vitest run --testNamePattern='\[db\]'
npx vitest run src/__tests__/services/private-mode/role-access.service.db.test.ts \
  src/__tests__/services/business-condition/business-condition-profile.service.db.test.ts
npm run test:owner-real-world-smb
```

**Path 3 — Free-tier Neon (only if no local/CI option):** a Neon URL is already in this env but was unreachable here; pointing tests at a **throwaway** Neon DB works, but never run mutating migrate/tests against an unknown/shared Neon instance without owner approval.

**Known failing/quarantined tests:** `.claude/test-quarantine.json` lists **22 files / 51 pre-existing failures** (runtime-proof HTTP/server-harness, event-emitter stale API, error-sanitization expectations) — proven on main `7634ccf8`, excluded from the blocking lane. These are TRIAL_RISK at most (harness/env), not owner-loop defects.

## 10. Required owner business data inputs

Accepted via CSV (`INTAKE_FIELD_SPECS`) or manual entry. Confidence is capped when inputs are missing (Phase-2 gate + per-domain `data-confidence`).

| Input | Classification | Format / fallback | Unlocks / cap if missing |
|---|---|---|---|
| Business profile (name, currency, model) | REQUIRED_MINIMUM | manual form | identifies workspace; archetype selection |
| Business archetype (laundry / housekeeping / local-service / restaurant / saas) | REQUIRED_MINIMUM | pick from `KPI_PROFILES` | archetype KPIs/failure modes; unknown ⇒ generic limited diagnosis |
| Finance: periodStart/End, currency, revenue, costOfGoodsOrServices, fixedCosts, variableCosts, cashOnHand, receivables | REQUIRED_MINIMUM | finance CSV / manual | survival + unit-econ + financial diagnosis; missing ⇒ `INSUFFICIENT_FINANCIAL_DATA`, no high-confidence growth |
| Debt / EMI / payables | STRONGLY_RECOMMENDED | manual | survival risk (debt pressure) |
| Price list + variable cost per unit | STRONGLY_RECOMMENDED | manual/CSV | unit economics, discount/pricing checks |
| Staff list + capacity/attendance | STRONGLY_RECOMMENDED (REQUIRED for housekeeping) | manual/CSV | staff/capacity diagnosis; housekeeping bottleneck |
| Customer/order data + repeat rate | STRONGLY_RECOMMENDED | CSV (sales domain) | retention/churn, laundry/housekeeping retention KPIs |
| Marketing spend + campaign history | OPTIONAL | manual/CSV | marketing ROI/payback; missing ⇒ disclosure, no spend recommendation |
| Complaints / delays / reviews | OPTIONAL | manual | quality/rework failure modes |
| B2B leads/contracts | OPTIONAL (if applicable) | manual | B2B pricing/capacity checks |
| Owner goals + constraints (cash, time, staff, compliance) | STRONGLY_RECOMMENDED | manual | feasibility gating; infeasible-action downgrade |

> Intake caveat (see §14): a finance CSV **without** the optional `gstBasis` column is currently graded `partial`, not `valid` — advisory by design but it lowers intake status. Owners should include a `gstBasis` column (`inclusive`/`exclusive`) to get `valid` intake, OR this should be fixed (next slice).

## 11. Required manual trial process (minimum safe loop)

1. Provision one Postgres DB; set the 3 required env vars; `prisma migrate deploy`; create the owner account (DB-session signup) and one business workspace.
2. Enter business profile + select archetype. Enter/upload **incomplete** data first — confirm the system refuses high-confidence diagnosis and lists missing inputs (Phase-2 gate).
3. Add finance (+ price list, staff, customers) via CSV/manual. Re-run; confirm data-quality, survival, unit-economics compute.
4. Review diagnosis (evidence + counter-evidence), the decision queue, and scenario comparison.
5. Owner approves / rejects / requests-evidence / converts-to-experiment (owner-only).
6. Assign execution task to operator; operator updates progress and submits **proof** (no proof ⇒ cannot complete).
7. Wait the measurement window; record actual outcome; review confounders; let attribution confidence compute.
8. Confirm learning candidate is created **only** if outcome verified + attribution sufficient.
9. Review dashboard reflects true state (no fabricated confidence/score).
10. Weekly: re-audit, check stop conditions (cash-critical defensive priority, dangerous-action = stop).
   - **No connector? Do it manually:** type/CSV the financials, staff, orders; collect proof as photos/files via the upload route or owner notes.

## 12. Security / access readiness

| Check | Status | Evidence |
|---|---|---|
| Workspace isolation | PARTIAL-PROVEN | `business-condition-workspace-isolation.test.ts` passes **without DB** (15); `prisma-workspace-enforcement` + middleware in code |
| Owner-only approvals | PROVEN (logic) | `owner-decision` DEC-RULEs; `capability-check` |
| Operator restrictions / cannot access learning | NOT DB-PROVEN | `private-mode/role-access.service.db.test.ts` is **DB-gated** |
| Private learning not public | PROVEN (handler) | learning route auth tests (152) |
| Audit trail active | PROVEN | `AuditEvent` hash chain + tests (Phase 11) |
| Cross-workspace leakage = 0 | NOT DB-PROVEN | needs `*.db.test.ts` run with DB |
| No public-SaaS exposure | PROVEN | this work touched only owner-mode + docs |

**Required before trial:** run the DB-gated security set (role-access, workspace-isolation persistence, file-intake persistence) on a DB-enabled env and confirm all negatives (401/403/cross-workspace/operator-denied).

## 13. Observability / logging readiness

- Structured logging present (`LOG_LEVEL`, `LOG_FORMAT=json`), audit logging flag on, metrics endpoint flag on (`ENABLE_METRICS_ENDPOINT`).
- Sentry/Datadog/New Relic optional — **recommended** to set `SENTRY_DSN` for an unattended trial, but not required.
- `OPSIQ_DIAGNOSTIC_KEY` gates internal ops endpoints (fail-closed if unset) — fine to leave unset for a local trial.

## 14. Exact trial blocker list

- **TRIAL_BLOCKER 1 — No DB-backed proof run.** Persistence + §13 security negatives + full-suite are unproven. *Closable free* via CI `postgres:16` (Path 1) or local Postgres (Path 2). Until done, owner data integrity + isolation are asserted, not measured.
- **TRIAL_BLOCKER 2 — RESOLVED (2026-06-23).** `domain/owner-intake/engine.ts` no longer sets `anyOptionalInvalid=true` when the optional `gstBasis` column is **absent** — an absent optional field is not "present-but-invalid", so it must not degrade the intake to `partial` (matches the engine's own `validationStatus` contract and `owner-intake/engine.test.ts:123`). The advisory `gst_basis_unknown` warning is still emitted (non-blocking). Effect: owner finance CSVs without a `gstBasis` column are correctly graded `valid` (with an advisory to optionally add GST basis). Tests: `intake-adapter` + `owner-intake/engine` 19/19; business-facts + owner-intake + owner-mode regression 51 files / 2161 passed (previously 1 failed) / 1 DB-skipped; `tsc` 0 errors. A **present-but-invalid** gstBasis value still correctly yields `partial`.

## 15. Exact trial risk list

- **TRIAL_RISK** — full suite never completed in-container; rely on CI for the green run.
- **TRIAL_RISK** — 22 quarantined pre-existing failures (runtime-HTTP/event-emitter/error-sanitization). Environment/harness, not owner-loop; track under `FULL_SUITE_TEST_DEBT_RECOVERY`.
- **TRIAL_RISK** — no `Experiment` DB model (pure in-memory lifecycle); convert-to-experiment results are not persisted/queryable. Owner should not rely on experiment history surviving a restart during trial.
- **TRIAL_RISK** — Phase-2 diagnosis-permission classifier not surfaced on a live route (per-domain numeric gate enforces quality instead).
- **NICE_TO_HAVE** — `SENTRY_DSN` for trial error visibility.
- **PUBLIC_SAAS_ONLY (ignore)** — Stripe/billing/Product Hunt.

## 16. No-cost setup path (recommended)

1. **Local trial runtime:** local Postgres 16 (`createdb opsiq_test`), `DATABASE_URL`/`NODE_ENV=development`/`NEXT_PUBLIC_APP_URL=http://localhost:3000`; `prisma migrate deploy`; `npm run build`; `npm start` (or `npm run dev`).
2. **DB proof:** push branch → GitHub Actions `ci.yml` (free `postgres:16`) for DB-backed + full-suite + quarantine lanes. Capture the run as evidence.
3. **Owner data:** manual entry + CSV (finance/sales/staff). Local file storage for proof uploads. No paid service.
4. **Observability:** optional free Sentry tier (`SENTRY_DSN`) if desired.

Total external cost: **₹0** (local Postgres + GitHub Actions free tier).

## 17. Paid / hosted setup path (only if truly necessary)

Only if the owner cannot run a local Postgres and wants an always-on hosted trial: a **free-tier Neon** Postgres (already half-wired — a Neon URL exists in env) + an existing host for Next.js. No other paid service is justified — no LLM, no S3, no Redis, no billing. Stay on free tiers.

## 18. Go / No-Go checklist

- [x] One reachable Postgres provisioned; `prisma validate` + `migrate deploy` clean. — **DONE in CI** (`postgres:16` service, run 28066614542).
- [x] CI run executes `TEST_WITH_DB=true` suite green (blocking lane) — DB persistence proven. — **DONE** (maintained DB-backed suite GREEN 2026-06-24).
- [x] §13 security DB negatives pass (role-access, workspace isolation, file-intake) — isolation + operator/learning denial proven. — **DONE** (ran within the green maintained suite).
- [x] `intake-adapter` blocker resolved (engine fix: absent optional gstBasis stays `valid`) — CI blocking lane no longer red on this file.
- [ ] `test:owner-real-world-smb` (+ optional simulation) run as a scored check.
- [ ] Owner account + one business workspace created; archetype selected.
- [ ] Minimum owner data loaded (finance REQUIRED_MINIMUM at least); incomplete-data refusal verified.
- [ ] Dashboard shows true state; no fabricated confidence.
- [ ] (Optional) `SENTRY_DSN` set for trial visibility.
- [ ] Confirm: no public-SaaS/billing config enabled.

When all checked → `OWNER_TRIAL_READY_WITH_MANUAL_INPUTS`.

## 19. Recommended next Claude execution prompt

> "OWNER MODE DB-PROOF + INTAKE-BLOCKER SLICE. On the same branch, minimum-code: (1) Resolve the `intake-adapter` blocker — decide whether absent optional `gstBasis` should keep `validationStatus=valid` (engine fix in `domain/owner-intake/engine.ts`, keep the advisory warning) or the test is stale (update test + add `gstBasis` to the canonical CSV template); implement the chosen option with tests; do not change required-field semantics. (2) Provision/point to a Postgres test DB (free CI `postgres:16` or local) and run `TEST_WITH_DB=true` DB-backed tests + the §13 security DB negatives (`role-access.service.db`, workspace isolation, file-intake persistence); record real results. (3) Run `test:owner-real-world-smb` as a scored check and capture numbers. Update `OWNER_MODE_TRIAL_READINESS_AUDIT.md` go/no-go + `OWNER_MODE_DECISION_OS_RELIABILITY_REPORT.md` classification with measured evidence. No public SaaS, no connectors, no new tables."

---

### Hostile audit notes
- I did **not** run mutating migrations/DB tests against the Neon URL present in env — it was unreachable here and could be a shared/real instance; doing so without owner approval would be unsafe. Documented, not faked.
- No dependency claimed required without repo evidence; no paid service recommended where a free/manual path exists.
- Public-SaaS items explicitly fenced as OUT OF SCOPE, not decoupling work (they are already not coupled to Owner Mode boot).
