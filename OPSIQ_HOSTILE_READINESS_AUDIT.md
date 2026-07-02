# OpsIQ Hostile Readiness Audit

> A hostile, skeptical, evidence-based audit of whether OpsIQ can actually RUN, MANAGE, GROW, SCALE, and make a real
> business HIGHLY PROFITABLE. Every finding is grounded in a real `file:line` and verified against the code, not the
> reports. Read-only audit — no code changed. Branch base: `main @ bfa427a2`.

## Blunt verdict
**No — not for a real business today.** What is genuinely proven is a *decision-safety governor*: on synthetic corpus
data it reliably tells an owner what **not** to do. But two whole layers a real business depends on are unwired:
**(1) getting real data in**, and **(2) producing quantified profit/growth upside out.** The 1,465-scenario corpus
proved the *judgment layer* on *seeded* data; the *ingestion* and *value-creation* layers are the missing halves. Net
today: a real signup **cannot feed OpsIQ enough data to leave `need_more_data`**, and even if it could, OpsIQ **never
tells them a specific thing to do to make ₹X**.

## What genuinely works (a fair audit, not a hit piece)
- **Auth, signup, session, and workspace isolation are real and clean** — IDOR was specifically hunted and not found;
  every read/write/mutate scopes by `workspaceId` (`business.service.ts`, `owner-finance/snapshot.service.ts`,
  `finance/action.service.ts`, `canonical-route-enforcement.ts:302-343`).
- **The decision-safety classifier is genuinely corpus-proven** — it will stop a below-margin contract, spending in a
  cash crunch, unsafe/fraud/boundary moves. Downside protection is real and rigorous.
- **The owner app is ~85% wired** with honest empty-states; **no fabricated data is rendered as real**; the one
  "not wired" module (Budget) says so plainly (`owner/budget/page.tsx:48-53`).
- **No committed secrets; OpenAI is fail-closed** (`ai/openai-provider.ts:67-77`). The team is unusually honest in its
  own baseline notes.
- **Event-triggered budget reassessment genuinely closes** end-to-end (`owner-budget/budget.service.ts:145,572`).

## BLOCKER findings (stop the run → grow chain)

### B1 — Every real business is permanently stuck at `need_more_data`
The runtime requires all 9 `CRITICAL_INGESTION_DOMAINS` present (`owner-domain-ingestion.ts:23,109`). Two of them —
`equipment_capacity` (`ownerCapacitySnapshot`) and `owner_workload_memory` (`ownerWorkloadSnapshot`) — have **zero API
write routes** (verified: `route-import-count=0` for both writer services; only `scripts/seed-owner-*.ts` write them).
So `criticalDomainsAllReal` is structurally always `false` → `overallConfidence` forced `"low"`
(`owner-domain-ingestion.ts:118`) → status `need_more_data`, `canProceed:false`, "Enter the missing critical data
before acting" (`supervisor-summary.ts:154,189,308`) — **forever**, for data no screen can enter. Blocks **RUN**.

### B2 — Data intake is mostly unreachable or a dead-end
(a) The canonical 20-category `/api/owner/manual-entry` route (`input-catalog.ts:42`) has **no UI** (zero `.tsx`
references — only seeds/tests). (b) CSV intake `confirmDataIntake` (`owner-intake/intake.service.ts:104`) only flips
`ownerConfirmed=true`; it **never materializes values into the snapshot tables diagnosis reads** — yet the UI says
"OpsIQ is now ready to analyze your business" (`owner/intake/page.tsx:139`). (c) Net: **~10 of 25 intake categories
are actually enterable, ~6 only as a monthly aggregate, ~9 have no path at all** — and the 10 must be hand-keyed. Data
really enters this system through `scripts/seed-e2e-owner-pilot.ts`, not owners. Blocks **RUN/MANAGE**.

### B3 — No quantified profit/growth *upside* engine reaches the owner
The owner receives an action-status + **one of ten hardcoded remedy strings** (`arbitration.ts:65-76,144-149`) +
qualitative impact sentences whose fallback literally says *"Compute contribution margin before any pricing/contract
move"* (`whole-plan.ts:82`). The only real profit math exists but is unusable: `business-math.ts:118-154` computes
runway/break-even but its `trace` is **discarded before the owner sees it** (used only to gate); the real
CAC/LTV/break-even/pricing engines under `/api/growth/*` (`growth/unit-economics-engine.ts:288`) have **no UI consumer
and store state in in-memory Maps** (`unit-economics-engine.ts:17`, non-persistent); and `/api/run`'s "impact" is just
`revenueChange − costChange` on numbers the owner typed (`explanation/generate.ts:21`). OpsIQ manufactures **no
quantified upside**. Blocks **GROW/SCALE/PROFIT**.

### B4 — The governance system's own safety gates are ratcheted/quarantined into not-running
`.claude/lint-baseline.json` freezes **2,155 lint errors** as tolerated — including **30 violations of the repo's own
`auth-enforcement/strict-auth` rule**. The security route-scanner (which flags **14 routes lacking `withEnforcement`**)
runs in a **non-blocking** lane; **92 `__ignored_tests__` files** (incl. `workspace-isolation-enforcement`,
`service-auth`, `auth-guard`, `value-proof-roi`) + **45 DB-gated suites** + **52 quarantined tests**
(`.claude/test-quarantine.json`, `vitest.config.ts:18`) are excluded from the default green lane. For a "governed"
system, the guards are disproportionately what is turned off. Undermines **TRUST**.

### B5 — The proof loop is production-inert; the anti-gaming gate can never fire
The FSM (`proof.service.ts`, `task-completion.service.ts`) and routes exist and are unit-tested — but **zero
production code creates a `delegatedTask`, `proofRequirement`, `proof`, or `workOrder`** (verified: 0 creators for all
four). `proofRequirementId` is never set (`task-completion.service.ts:143`), so `proofRequired` is always `false` →
`completeTask` **approves every task with no evidence**, and `POST /api/proof/submit` returns "Task not found" for
every real user. Deeply ironic: the 120-scenario Staff-Proof-Anti-Gaming pack proved the *judgment* to block gamed
proof, but in the running app **no proof is ever demanded**. Blocks **MANAGE/SCALE**.

### B6 — The decision/operator learning store is write-only
Lessons are written (`operator/store.ts:245`, `execution/execution-service.ts:157`) but every read-back —
`getLearningRecords`, `getLearningRecordsFromDays` (`services/learning/store.ts:99,124`), `calculateSuccessMetrics`,
`getMetricsSnapshot` (`decision-metrics-service.ts:50,90`) — has **zero non-test callers** (verified). An action can
fail 10 times for the same problem type and the next recommendation is identical. Blocks **GROW/PROFIT**.

## MAJOR findings

### M1 — Verified-session snapshot fabricates authz state
`canonical-verified-session.ts:182-218` hardcodes `workspace.isActive:true` and empty entitlement `limits:{}` behind
9 `// TODO: Fetch...` — a disabled workspace or plan limit could be masked.

### M2 — Governed decision transition has a TOCTOU race
`decision/status-management.ts:137-160` reads-then-updates with no version/status guard → two concurrent approvals both
validate. Violates CLAUDE.md's concurrency-safe-update rule (only 11 files use locking).

### M3 — Hardcoded margin constants in the live plan path
`owner-mode/owner-context-derivation.ts:145-147` injects `consideredRate=18; fullyLoadedCost=22; paymentTermsDays=30`
whenever real margin is negative (live path via `owner-whole-business-plan.service.ts:136`). The *direction* is real
(margin genuinely < 0) but the margin *numbers* the owner is gated on come from planted constants — a CLAUDE.md
"no placeholders in live paths" violation.

### M4 — Escalations/alerts are log-only stubs
`execution/action-handlers.ts:101` and `alerts/alert-service.ts:246` only log; owners will believe an escalation email
was sent when nothing left the system. Observability (`infra/metrics.ts:361`, `infra/error-tracking.ts:178`) is
stubbed despite the Sentry dependency.

### M5 — The "human execution reality" dimension is structurally empty
Owner-workload (`ownerWorkloadSnapshot`) and standing-instructions models have no write routes — one of OpsIQ's four
mandated dimensions can never be populated by a real owner. (Overlaps B1's workload half.)

### M6 — Multi-workspace owners are silently pinned
`canonical-route-enforcement.ts:304-312` picks the "first" active membership with **no `orderBy`** and there is no
workspace switcher — nondeterministic, unusable for a multi-business owner. (Isolation itself is clean — no IDOR.)

### M7 — Learning feedback is split across two stores (one dead)
The **owner whole-business plan** genuinely reads a workspace-private `PrismaLearningStore`
(`owner-whole-business-plan.service.ts:137`) and sets `learningApplied` — that path closes. But it is a **different,
second learning subsystem** from the write-only decision/operator store in B6. OpsIQ has **two learning stores, one
read-back and one dead** — a duplicate-engine smell; the decision-quality half never learns.

### M8 — Scheduled reassessment is dead code
`src/scheduler.ts` is **0 bytes**; `infra/scheduler.ts`'s `getScheduler`/`processDue` have **zero callers** (verified);
the default provider is an in-memory `Map` (lost per serverless invocation); there is no cron config. A plan sets
`reviewInDays=30`; days 30/60/90 pass and **nothing re-runs**. Event-triggered budget reassessment closes; time-based
cadence — a mandated dimension — does not. Blocks **MANAGE**.

### M9 — The outcome loop records but does not steer
Expected-vs-actual is genuinely computed and persisted for budget actions
(`owner-budget/action-link.service.ts:199-222`, `disposition: repeat/modify/escalate/block`) and decisions
(`decisions/decision-lifecycle.service.ts:360`) — the best-built loop in the repo. But the plan composer **never reads
it** (`domain/owner-budget/updated-plan.ts:38-49` has no outcome-history input). A `block`ed initiative gets
re-recommended unchanged on the next plan.

## MINOR findings (verified, lower blast radius)
- `businessId` nullable on compliance/equipment writers but **required** on the read side (`owner-db-providers.ts:80`)
  → items saved without a business are invisible to the plan.
- External ingestion (`external-systems/google-sheets-oauth.service.ts:134,149,271,290`,
  `external-systems/browser-import.service.ts:370`) throws `not implemented` — any real import path hard-crashes.
- `decision/execution-stub.ts` flips a governed decision to `executed` with no lock (currently no callers — a loaded
  footgun).
- 232 `as any` / 548 `: any` in non-test code, including audit-event-name casts
  (`decisions/decision-lifecycle.service.ts:106,395`).
- 13 `internal/*` routes on a shared `OPSIQ_DIAGNOSTIC_KEY`; `internal/login-diagnostic/route.ts:7` hardcodes
  `demo-password-123`.

## Loop scorecard (running app, not tests)
| Loop | Closes end-to-end? |
|---|---|
| Outcome (expected-vs-actual) | **PARTIAL** — recorded & persisted, never re-enters plan generation |
| Learning feedback | **SPLIT** — owner-plan store reads back; decision/operator store is write-only (dead read) |
| Proof capture | **NO** — inert; no proof row ever created; gate never fires |
| Reassessment | **SPLIT** — event-triggered budget works; scheduled cadence is dead code |

Only **event-triggered budget reassessment** closes fully in production. The system today records and displays; it
does not yet *learn* or *enforce proof* in the running app.

## Honest-accounting correction
The corpus accounting (1,465 counted-for-readiness / 1,480 proven / 50 sims / 427 events / 240 sources / 0 PII /
0 unsafe / 0 live) is accurate and reproduces from code. That accounting measures the **judgment layer on seeded
data**. It does NOT measure runtime-operational readiness. This audit adds the missing half: the judgment is proven;
the ingestion, proof-enforcement, learning-feedback, reassessment-cadence, and value-output layers are **not fully
wired in the running app**. Both statements are true simultaneously.

## Corpus-proven judgment vs runtime-operational readiness
- **Corpus-proven judgment (TRUE):** given data, OpsIQ resolves the right governed decision (proceed / cautious /
  need_more_data / owner_decision / blocked) with the right proof demand and escalation, across 1,465 scenarios + 50
  simulations, 0 unsafe proceeds.
- **Runtime-operational readiness (NOT YET):** a real owner cannot get enough real data in to leave `need_more_data`
  (B1/B2), no proof is ever demanded (B5), learning does not feed the decision path (B6/M7), cadence does not fire
  (M8), and no quantified profit upside is produced (B3). The brain is proven; the hands, eyes, and memory are unwired.

## Explicit non-claims (unchanged and reaffirmed)
- OpsIQ is **NOT** `LIVE_OUTCOME_PROVEN` — no real before/after business metrics exist.
- OpsIQ is **NOT** `PUBLIC_SAAS_READY` — public SaaS remains blocked/out of scope.
- OpsIQ does **NOT** solve unknown-unknowns — it *manages* them via confidence reduction / escalation / block /
  reassessment, and this audit does not claim otherwise.
- OpsIQ is **NOT yet a full real-business operating / profit engine** — it is a proven decision-safety judgment layer
  whose ingestion, proof, learning, cadence, and value-output layers are not fully wired in the running app.

## Consolidated blocker count
Six BLOCKER-class gaps between "corpus-proven" and "runs/grows/scales a real profitable business": B1 (ingestion of 2
critical domains), B2 (intake unreachable / CSV dead-end), B3 (no quantified upside), B4 (safety gates not running),
B5 (proof inert), B6 (learning write-only) — plus nine majors (M1–M9). The gap is large, concrete, and lives almost
entirely in ingestion + value-creation + turned-off gates, not in the proven judgment layer.
