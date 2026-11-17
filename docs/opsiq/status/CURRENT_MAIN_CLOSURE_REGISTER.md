# Current-Main Closure Register

**Purpose:** a single authoritative source of truth for finding status, reconciled against actual current `main`, superseding the stale registers under `docs/opsiq/status/` and `.claude/` (last updated ~2026-08-15, predating PR #337 onward). Those files are not deleted — they remain as historical record — but this document is the one to trust for current status.

**As of:** main `2d49876f1b56cdf26e34443b9d6a73208f7c40d8` (PR #358 merged — `migrate-production.yml` MAIN-mode exact-one-pending-migration gate; includes PR #354 `OverrideRecord` workspace anchor, PR #356 exact-host gate extended to MAIN mode, PR #357 `OverrideRecord` read-only production forensics).

**Scope note:** this register directly reconciles findings this session has first-hand evidence for (the workspace-isolation program, the domain-acceptance expansion, owner-UI survey, and the reliability/tech-debt survey run this session). It does **not** claim to have individually re-verified every PR from #319 through #336 — that range predates this session's direct working context. Where a finding's status rests on session-compacted summary rather than fresh verification, it is marked accordingly rather than asserted as freshly proven.

## Status vocabulary

| Status | Meaning |
|---|---|
| CLOSED | Fixed, merged, deployed to production. |
| PRODUCTION_PROVEN | Closed and independently verified against live production data/logs (not just CI). |
| RECURRENCE_GATE_ENFORCED | Closed with an automated test/gate that would fail CI if the defect reappeared. |
| PARTIALLY_CLOSED | Some but not all of the finding's scope is fixed. |
| OPEN | Confirmed still present, not yet fixed. |
| REGRESSED | Was previously closed, found broken again. |
| SUPERSEDED | The original finding no longer applies because of an unrelated later change. |
| NOT_REQUIRED_FOR_PRIVATE_OWNER_MODE | Real, but out of scope for the single-owner-per-workspace deployment model this app targets. |
| OWNER_BLOCKED | Engineering-ready but requires an owner decision/authorization to proceed. |

## Workspace-isolation program (SCHEMA-01)

| Model | Status | Evidence |
|---|---|---|
| `ApprovalRequest` | CLOSED, PRODUCTION_PROVEN, RECURRENCE_GATE_ENFORCED | PR #351, merged `1ad99c40`. Migration `20260824000001_approval_request_workspace_anchor` applied to production via `PINNED_PREDEPLOY` (run `32730772782`, 2026-08-24T13:08:05Z) ahead of merge, per owner authorization. Post-migration structural proof independently re-verified via the read-only `production-db-status.yml` workflow extension (PR #353): index present, FK identity/target/actions correct (`RESTRICT`/`CASCADE`), 0 null-workspace rows, 0 unmappable rows. 7 hostile cross-workspace DB tests (`approval-workflow-workspace-isolation.db.test.ts`). |
| `OverrideRecord` | CLOSED, PRODUCTION_PROVEN, RECURRENCE_GATE_ENFORCED | **Application code:** PR #354, merged `cea1df29902668678c1bd8f05e3e730454427590` — `OverrideRecord` registered in `WORKSPACE_OWNED_MODELS`, `recordOperatorOverride()` sets `workspaceId` on create, DB backstop hostile test proves a bare `overrideRecord.create()` with no `workspaceId` is rejected (`operator-override.db.test.ts`, 7/7 pass). **Migration:** `20260825000001_override_record_workspace_anchor`. **Production migration:** `migrate-production.yml` MAIN mode, current main at dispatch = `2d49876f1b56cdf26e34443b9d6a73208f7c40d8`. **Successful migration evidence** (direct workflow-run job-log extraction): "Applying migration `20260825000001_override_record_workspace_anchor`", "All migrations have been successfully applied.", `DEPLOY_STARTED=true`, `DEPLOY_SUCCEEDED=true`, `PREFLIGHT_PASSED=true`. **Independent read-only production proof** (`production-db-status.yml`, `RUN_ID=32881213237`, `CHECKED_OUT_SHA=2d49876f1b56cdf26e34443b9d6a73208f7c40d8`, `DB_HOST=ep-empty-sky-ay1e6c27.c-5.us-east-2.aws.neon.tech`): `PRODUCTION_OVERRIDE_RECORD_ROWS=0`, `PRODUCTION_OVERRIDE_UNMAPPABLE_ROWS=0`, `WORKSPACE_ID_EXISTS=YES`, `WORKSPACE_ID_TYPE=uuid`, `WORKSPACE_ID_NULLABLE=NO`, `NULL_WORKSPACE_ROWS=0`, `MIGRATION_ROW_PRESENT=YES`, `MIGRATION_FINISHED=YES`, `MIGRATION_ROLLED_BACK=NO`, `INDEX_PRESENT=YES` (`override_records_workspace_id_idx`), `FK_PRESENT=YES` (`FK_SOURCE=override_records.workspace_id`, `FK_TARGET=workspaces.id`, `FK_UPDATE_ACTION=CASCADE`, `FK_DELETE_ACTION=RESTRICT`), `CURRENT_PENDING_MIGRATIONS=0`, `FAILED_MIGRATIONS=0`. Every field above was independently pulled from the run's raw job logs, not accepted from a self-reported template. See "Workflow-safety closure" below for the PR #356/#357/#358 gate hardening and the real production-dispatch incident that validated it. `F-OVERRIDERECORD-SCHEMA-DRIFT` is no longer an open item (see "Open items" section below). |
| `DecisionSnapshot` | NOT_REQUIRED_FOR_PRIVATE_OWNER_MODE | Audited this session (dedicated agent, 30 tool calls). Zero production-reachable callers — its only write path (`getPrimaryDecisionWithSnapshot`) is orphaned, reachable only from a disabled test (`src/__ignored_tests__/`, excluded from `vitest.config.ts`). Reclassification documented in `TENANT_MODEL_CLASSIFICATION.md` (both copies) rather than building an unnecessary migration. If ever wired to a live route, the identical deterministic-backfill pattern applies (`engagementId → engagements.workspace_id`, same NOT-NULL FK guarantee). |

## Workflow-safety closure (`migrate-production.yml` hardening — PR #356, #357, #358)

Closed this session in the course of reconciling `OverrideRecord`'s production migration path:

- **PR #356** — extended the exact-host gate (previously PINNED_PREDEPLOY-only) to run unconditionally in MAIN mode too: `expected_database_host` is now `required: true` for both dispatch modes, and the "Verify exact production database host matches owner-pinned expectation" step is no longer gated behind `if: inputs.mode == 'PINNED_PREDEPLOY'`. Closes the "syntactically-valid-but-wrong-project Neon URL" gap for MAIN-mode dispatches, which previously had no equivalent check.
- **PR #357** — added read-only pre/post-migration forensics for `override_records` to `production-db-status.yml`, mirroring the extension pattern already used for `ApprovalRequest` (PR #353). This is the workflow that produced the independent production proof cited in the `OverrideRecord` row above.
- **PR #358** — added the MAIN-mode exact-one-pending-migration gate: `migration_name` is now `required: true` for both modes; a new "Validate MAIN inputs" step format-validates it; a new "Verify migration exists on current main" step asserts the named migration's directory and `migration.sql` actually exist in the checked-out main tree; and the shared `scripts/classify-migrate-status.mjs` classifier (previously invoked only for PINNED_PREDEPLOY) now runs unconditionally for both modes immediately before "Deploy migrations", requiring exactly `PENDING_EXPECTED` classification (the sole authorized migration pending, no negative markers) before deploy is permitted to proceed.

**Real-world validation of the PR #358 gate — not merely a unit-test claim:** the first MAIN-mode dispatch attempting the `OverrideRecord` migration contained a manual `migration_name` input typo (`...workspace_ancho` instead of `...workspace_anchor`). The new "Verify migration exists on current main" step rejected the dispatch before any database access occurred; the same run's "Deploy migrations" step shows `skipped` in its job log (it never ran) — structural proof, not inference, that the failed dispatch produced zero production mutation. The corrected dispatch (exact migration name) then passed the full gate sequence and migrated production successfully, per the evidence in the `OverrideRecord` row above. This is real operational evidence that the recurrence/safety gate added in PR #358 works as designed — produced by an actual human data-entry error in live use, not a synthetic test scenario.

## Domain live-acceptance expansion (this session, PRs #337–#341, #349)

| Domain | Status | Evidence |
|---|---|---|
| Sales | CLOSED, PRODUCTION_PROVEN | PR #337, merged `6096ee6f`. |
| Operations / Strategy / Cashflow (batch) | CLOSED, PRODUCTION_PROVEN | PR #340, merged `134225e9`. |
| Recovery | CLOSED, PRODUCTION_PROVEN | PR #338, merged `514ca48f` (gate fix). |
| Marketing | CLOSED, PRODUCTION_PROVEN | PR #339, merged `f674183e` (reassessment fix). |
| Cashflow reassessment | CLOSED, PRODUCTION_PROVEN | PR #341, merged (owner-authorized). |
| Cashflow acceptance (24-07/24-08/24-09) | CLOSED | PR #349, merged `cc05de3b` — asserts reassessment now that #341 landed. |
| Cross-domain cash-safety-gate contamination | CLOSED | Fixed same session (URGENT item), production-acceptance suite isolated per-domain business fixtures corrected. |

## Owner-facing UI surfaces (this session's survey, reverified against origin/main)

| Item | Status | Evidence |
|---|---|---|
| Approval/Governance owner UI | CLOSED | PR #346, merged `24131df5`. `src/app/(authenticated)/owner/approvals/page.tsx`, nav-linked both surfaces. |
| Learning governance owner UI | CLOSED | PR #347, merged `7298dfe9`. `src/app/(authenticated)/owner/learning/page.tsx` (339 lines), full API surface, nav-linked. |
| Delegation owner UI | CLOSED | `src/app/(authenticated)/owner/tasks/page.tsx`, nav-linked as "Delegation." |
| Budget/SOP owner UI | CLOSED | Confirmed pre-existing and complete (PR #348 investigation) — `owner/budget`, `owner/execution`. |
| Automation owner UI | CLOSED | PR #348, merged `be5a418c`. "Automation Health" page nav-linked. |
| **Growth-pricing owner UI** | **OPEN** | Backend fully implemented (`src/services/growth/pricing-engine.ts`, `src/app/api/growth/pricing-tiers/*` including approve/supersede/analysis) but **zero owner-facing page exists anywhere** — API/service-only, never surfaced or nav-linked. Not yet triaged into a fix PR. |
| Startup Mode handoff + browser proof | CLOSED, RECURRENCE_GATE_ENFORCED | PR #325/#326. `tests/browser/56-startup-mode-journey.spec.ts` (1022 lines) + `tests/production/10-startup-mode-acceptance.spec.ts` (322 lines, live-production). |
| **Startup outcome learning loop** | **OPEN** | Handoff correctly creates a `FundedInitiativeOutcome` row (`PENDING`, `safeForLearning: true`) and the budget learning loop (`budget.service.ts`, `updated-plan.ts`) correctly reads `safeForLearning` outcomes — the wiring exists. But **nothing ever transitions a startup-originated outcome out of `PENDING`**: the only code that closes outcomes (`classifyBudgetOutcome` in `action-link.service.ts`) triggers off `OwnerBudgetAction` completion, not `StartupInitiative` completion. Real startup outcomes are silently orphaned and never feed the learning loop. Not yet triaged into a fix PR — needs a design decision on what "completing" a `StartupInitiative` means before implementation. |

## Reliability / tech-debt survey (this session)

| Item | Status | Severity | Evidence |
|---|---|---|---|
| Orphaned automation detectors | PARTIALLY_CLOSED | P3 | `ContradictionDetector` (`src/services/contradiction-detector/detector.ts`) has zero importers outside its own file/tests — dead code. PR #317's canonical scheduler registry itself has no orphans (3 handlers, 3 producers, 1:1). Not urgent; candidate for a future cleanup PR (delete or wire up). |
| Quarantined workspace/auth tests | CLOSED (false alarm) | NONE | Scanned all 51 workspace/auth-named test files. Only pattern found is legitimate `describeIf(SHOULD_RUN_DB_TESTS)` CI-lane gating, not quarantine. No `it.skip`/`xit`/`xdescribe` anywhere. |
| `decisionAccuracy` schema/API strictness gap | OPEN | P3 | `prisma.decisionAccuracy` is nullable and the domain type is `number \| null`, but the public input schema at `record-outcome/route.ts` is `z.number().optional()` (rejects explicit `null`). No observed functional bug — clients simply omit the field. Cosmetic strictness gap only. |
| DB lazy-Proxy pattern (P0-15 precedent) | CLOSED, RECURRENCE_GATE_ENFORCED | NONE | Fix (`src/lib/db.ts:625-673`) confirmed still in place; `git grep "new Proxy("` finds only the one intentional site — no reintroduction anywhere in `src/lib` or `src/services`. |
| Backup/recovery automation | **OPEN** | **P2** | Two distinct meanings exist in this codebase — the business-domain "Recovery" module (owner-recovery, unrelated) vs. actual DB backup. Real backup tooling exists (`scripts/backup-database.sh`, `restore-database.sh`, `cleanup-old-backups.sh` — pg_dump/gzip/checksum) but is **not wired into any CI cron/schedule** — no automated cadence, no Neon-branch-based strategy. Production has manual-only backup capability today. Not yet triaged into a fix (this is an infrastructure/ops decision — a scheduled workflow — not a code root-cause fix, and touches CI/infra config, which is one of the owner's explicit STOP boundaries). |

## Historical evidence explicitly credited (per owner instruction — not re-litigated as open work)

- `HISTORICAL_PRODUCTION_SOAK_48H=PASS`
- `REAL_EXISTING_BUSINESS_PILOT=PASS` — Trinity Services, July 2026, real business data (read-only; never mutated by any acceptance run, per this session's own repeated constraint).

Per the owner's instruction, code that has materially changed since either of these evidence points requires **fresh** regression evidence before being treated as still covered by the historical soak/pilot. Two distinct proof fields are tracked at two distinct scopes — closing the narrower one does not imply the broader one:

`WORKSPACE_ISOLATION_FINAL_REGRESSION_PROOF=PASS` — scoped specifically to the workspace-isolation program (schema + service-layer changes to `ApprovalRequest`/`OverrideRecord` since the soak). Reasoning: `ApprovalRequest` production proof PASS (PR #351/#353); `OverrideRecord` production proof PASS (PR #354/#356/#357/#358, evidence in the table above); `DecisionSnapshot` correctly `NOT_REQUIRED_FOR_PRIVATE_OWNER_MODE` (no production-reachable write path); Main Integration remained green across the entire workspace-isolation and workflow-hardening merge sequence (#351, #353, #354, #356, #357, #358); live production schema now matches deployed code for both governed models in this program.

`FINAL_CANDIDATE_REGRESSION_PROOF=PENDING` — the broader, product-wide release-candidate scope: the full domain-acceptance expansion (Sales/Marketing/Operations/Strategy/Cashflow/Recovery specs, all added after the original pilot window), plus a final current-main regression/acceptance pass executed against the eventual unrestricted-owner release candidate once remaining open items (below) are formally dispositioned. **Do not confuse successful closure of the workspace-isolation program (SCHEMA-01) with final product-wide release-candidate proof** — the two are at different scopes, and this broader field stays PENDING independent of the narrower one turning PASS.

## Open items not yet triaged into a fix PR, ranked by severity

`F-OVERRIDERECORD-SCHEMA-DRIFT` is no longer on this list — it closed CLOSED/PRODUCTION_PROVEN/RECURRENCE_GATE_ENFORCED (see the `OverrideRecord` row above). There is no open P0 or P1 item remaining anywhere in this register as of the main SHA at the top of this document. Every remaining item below was re-checked against its previously recorded severity; none has changed.

1. **Backup/recovery automation (P2)** — infra/CI-config change, crosses an explicit owner STOP boundary (production config/infrastructure change). Needs owner direction on cadence/target before any implementation.
2. **Startup outcome learning loop (P2, functional correctness)** — needs a design decision (what does "complete a StartupInitiative" mean — manual owner action? a timeout? an explicit outcome-report flow?) before implementation; not a mechanical root-cause fix like the workspace-anchor migrations.
3. **Growth-pricing owner UI (P3, feature-completeness gap)** — well-scoped UI-only work, backend already complete and tested.
4. **`decisionAccuracy` API strictness (P3, cosmetic)** — trivial Zod schema widen (`z.number().nullable().optional()`), no observed bug driving urgency.
5. **Orphaned `ContradictionDetector` (P3, dead code)** — delete-or-wire-up decision, no urgency either way.

Items 1–5 are P2/P3, with no P0/P1 item open. Per the owner's standing rule, none of items 1–5 is being started without either (a) a genuine owner decision where one is required (items 1–2), or (b) being explicitly the next item pulled off this list.

## 2026-11-17 session addition — Product Hunt launch-readiness verification

**Scope note:** this session verified via live API/CLI calls and read-only browser testing, not re-derived from this register. Main has advanced well past the `2d49876f1b56cdf26e34443b9d6a73208f7c40d8` SHA this register was last anchored to (current production deployment: `74cb1ff59d4de6672314343961d6ae148953312a`) — the items below are independently sourced, not a re-verification of everything in between.

| Item | Status | Evidence |
|---|---|---|
| Production DB identity | PRODUCTION_PROVEN (reconfirmed) | `ep-empty-sky-ay1e6c27.c-5.us-east-2.aws.neon.tech`, project `patient-lake-61323111` ("OPSIQ NEW"), branch `br-purple-boat-ayjn6zl6`. Matches this register's own `DB_HOST` forensics citation above, plus live Neon API (only project with a `ready`-state production endpoint), `src/infra/production-db-identity.ts`'s own `PRODUCTION_DB_ENDPOINT_IDS`/`PRODUCTION_NEON_BRANCH_IDS` constants, and 3 `docs/opsiq/evidence/stage-7/` artifacts. Six convergent sources total. Final owner go-ahead to dispatch DISCOVER still OWNER_BLOCKED as of this writing. |
| Acceptance fixture role | OWNER_BLOCKED (status check needed) | `acceptance_fixture_operator` was successfully GRANTed 2026-10-26 (gh run 40328744731, workspace `d0609f28-dbbd-4a29-a5d2-fd74a7bb4ce5`) — but current status as of this session is unconfirmed; a fresh DISCOVER (read-only) would settle it, pending the owner go-ahead above. |
| Backup/recovery automation (P2, this register's existing OPEN item) | OPEN, materially worse than previously recorded | Not just "not wired to a schedule" — **zero recoverable backup of any kind currently exists.** Old `scheduled-backup.yml` disabled_manually (correctly — `scripts/backup-qbo-gate.sh` from PR #661 fail-closes `pg_dump` once QBO data is present); its 14-day-retention GH Actions artifacts have all since expired. Replacement `scheduled-backup-r2.yml` has zero dispatches ever. Last confirmed-good restore rehearsal: Oct 1; Nov 1 rehearsal failed in 2s (log expired). OWNER_BLOCKED pending authorization to dispatch a test R2 backup run. |
| TLS cert-verification overrides (`rejectUnauthorized: false`) | PARTIALLY_CLOSED | PR #673 opened: removes the override from all 7 remaining call sites found via repo-wide grep (3 the owner named + 4 more: `scripts/check-dashboard-demo-data.ts`, `scripts/check-staging-login-prerequisites.ts`, `scripts/verify-staging-seed.ts`, `scripts/db/opsiq-role-cutover.ts`) plus `vitest-global-setup.ts`'s keepalive client. `db-connection-config.test.ts` passes, `tsc --noEmit` clean. **CI `build-and-test (20.x)` currently failing** — not from the TLS change itself, but from this repo's lint-ratchet policy (`scripts/lint-ratchet.mjs`, "require changed files to be clean") flagging pre-existing `@ts-nocheck` in `scripts/check-dashboard-demo-data.ts` and `src/infra/seed.ts`, unrelated to this fix. OWNER_BLOCKED on a scope decision: remove those pre-existing suppressions (risk: may surface real type errors the comments say are intentional data/schema mismatches) vs. leave the PR open unmerged. |
| Dependabot alerts (65: 6 critical, 11 high, 36 moderate, 12 low) | OPEN, triaged not fixed | Real production exposure concentrates in `next` 16.3.5 (3 criticals + 2 highs, all closed by one 16.4.1 minor bump) and `zod` 4.3.6 (1 high, fix within existing `^4.3.6` range). Most `undici`/`vite`/`hono` moderate+low alerts are `development`-scope per Dependabot's own graph — no production exposure if that classification holds. No upgrade applied; needs regression testing first. |
| Vercel Web Analytics API retrieval | OPEN | Dashboard ingestion owner-confirmed working; `GET /v1/query/web-analytics/visits/count` still 404s as of this session (reconfirmed), root cause unproven. Dashboard remains the interim reporting source. |
| UTM attribution persistence | OPEN, newly found | Loading the public site with `?utm_source/medium/campaign` params leaves zero trace in `document.cookie`/`localStorage`/`sessionStorage`, and the signup link doesn't carry them forward — a visitor who browses before signing up loses attribution client-side. Server-side capture not checked (out of scope for a browser test). |
| Dedicated agency landing/diagnostic page | OPEN, newly found | No distinct agency landing page or diagnostic page exists — only a themed resource article. May be a gap vs. the original marketing plan's assumption that one exists. |
| Public funnel (homepage, calculator, resources, beta page, signup form validation, mobile layout, consent banner) | PRODUCTION_PROVEN (public-only scope) | Live-tested via isolated browser session, read-only, no account created. All PASS except the two items above. |
| Cloud launch-day monitoring | CLOSED (mechanism), PENDING (actual fire) | Routine `trig_01Js9ocvebsuiL2cZQJfKo3d`, environment `env_01KC5yyW8FmqbjV4oUunD36P` (chosen for its existing successful run history — the 09:00/10:17 IST acquisition routines both run there), one-time `run_once_at=2026-11-20T09:15:00Z`, Metricool+Vercel connectors attached. Config independently re-verified via `RemoteTrigger.get`. Not yet proven to fire correctly — happens 2026-11-20. |
| Google Search Console | OWNER_BLOCKED | No connector or API credential exists yet. Needs a new Google OAuth/service-account authorization from the owner before any integration work (code scaffolding is independently preparable without live credentials). |
