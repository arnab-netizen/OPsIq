# Current-Main Closure Register

**Purpose:** a single authoritative source of truth for finding status, reconciled against actual current `main`, superseding the stale registers under `docs/opsiq/status/` and `.claude/` (last updated ~2026-08-15, predating PR #337 onward). Those files are not deleted — they remain as historical record — but this document is the one to trust for current status.

**As of:** main `1ad99c408660e82a218cde5a60dbcfe371193688` (PR #351 merged), with PR #354 (`OverrideRecord` workspace anchor) open awaiting exact-SHA merge authorization.

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
| `OverrideRecord` | OWNER_BLOCKED (PARTIALLY_CLOSED pending merge) | PR #354, open, not yet merged — awaiting exact-SHA authorization. Migration `20260825000001_override_record_workspace_anchor` written and locally verified (not yet applied to production; correctly sequenced to apply, if authorized, only after merge since this is a P2 defense-in-depth fix with no live exploit, unlike `ApprovalRequest`'s migrate-first requirement). Deterministic backfill via the identical `operatorItemId → operator_items.workspace_id` chain. Sole production caller (`recordOperatorOverride()`) already service-layer-safe before this fix. |
| `DecisionSnapshot` | NOT_REQUIRED_FOR_PRIVATE_OWNER_MODE | Audited this session (dedicated agent, 30 tool calls). Zero production-reachable callers — its only write path (`getPrimaryDecisionWithSnapshot`) is orphaned, reachable only from a disabled test (`src/__ignored_tests__/`, excluded from `vitest.config.ts`). Reclassification documented in `TENANT_MODEL_CLASSIFICATION.md` (both copies) rather than building an unnecessary migration. If ever wired to a live route, the identical deterministic-backfill pattern applies (`engagementId → engagements.workspace_id`, same NOT-NULL FK guarantee). |

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

Per the owner's instruction, code that has materially changed since either of these evidence points requires **fresh** regression evidence before being treated as still covered by the historical soak/pilot — tracked as:

`FINAL_CANDIDATE_REGRESSION_PROOF=PENDING` for: the entire workspace-isolation program (schema + service-layer changes to `ApprovalRequest`/`OverrideRecord` since the soak), and the full domain-acceptance expansion (Sales/Marketing/Operations/Strategy/Cashflow/Recovery specs, all added after the original pilot window).

## Open items not yet triaged into a fix PR, ranked by severity

1. **Backup/recovery automation (P2)** — infra/CI-config change, crosses an explicit owner STOP boundary (production config/infrastructure change). Needs owner direction on cadence/target before any implementation.
2. **Startup outcome learning loop (P2, functional correctness)** — needs a design decision (what does "complete a StartupInitiative" mean — manual owner action? a timeout? an explicit outcome-report flow?) before implementation; not a mechanical root-cause fix like the workspace-anchor migrations.
3. **Growth-pricing owner UI (P3, feature-completeness gap)** — well-scoped UI-only work, backend already complete and tested.
4. **`decisionAccuracy` API strictness (P3, cosmetic)** — trivial Zod schema widen (`z.number().nullable().optional()`), no observed bug driving urgency.
5. **Orphaned `ContradictionDetector` (P3, dead code)** — delete-or-wire-up decision, no urgency either way.

None of these are P0/P1. Per the owner's standing rule, none of these five is being started without either (a) a genuine owner decision where one is required (items 1–2), or (b) being explicitly the next item pulled off this list.
