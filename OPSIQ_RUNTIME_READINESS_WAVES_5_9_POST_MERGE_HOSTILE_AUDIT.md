# OpsIQ Runtime Readiness — Waves 5–9 Post-Merge Tier-3 Hostile Audit

> Standard: `OPSIQ_HOSTILE_RUNTIME_AUDIT_STANDARD.md` v3.0, **Tier 3** (milestone-level, post-merge, read-only,
> adversarial). Scope: the five follow-up waves that were opened to close the remaining
> **MILESTONE_RUNTIME_PARTIAL** items. All five are merged into `main`; this audit re-verifies the merged result and
> decides the milestone classification. **CI was NOT triggered by this audit.** Base of record: `main @ 0b1e104b`.

## 0. Merged waves
| Wave | Item (MILESTONE_RUNTIME_PARTIAL) | PR | Squash | Classification |
|---|---|---|---|---|
| 5 | Non-finance ingestion materialization | #101 | `20a6fd74` | NON_FINANCE_MATERIALIZATION_DB_PROVEN |
| 6 | Escalation / Action schema + overdue-action fix | #102 | `de782756` | OVERDUE_ESCALATION_SCHEMA_RESOLVED_DB_PROVEN |
| 7 | M1/M4 governance honesty | #103 | `68e4e43b` | GOVERNANCE_HONESTY_M1_M4_DB_PROVEN |
| 8 | Internal route scoping / strict-auth (User/Lead/ClientAccount) | #104 | `920afc6a` | USER_ROUTE_SCOPING_DB_PROVEN |
| 9 | Scheduled reassessment infrastructure decision | #105 | `0b1e104b` | SCHEDULED_REASSESSMENT_TRIGGER_DECISION_RECORDED |

## 1. Post-merge re-verification (on merged `main`)
- **All five waves' proofs pass on merged main**: 32/32 across `non-finance-materialization.db`, `overdue-escalation.db`,
  `verified-session-real-facts.db`, `user-workspace-scoping.db`, `reassessment-scan` (unit),
  `due-reassessment.service.db`. No cross-wave regression.
- **Gates on merged main**: `tsc` 0; `lint:ratchet` PASS (2083 ≤ 2155 baseline); `governance:scan:strict` 32 frozen /
  **0 new**; `governance:scan:auth` comply. The ratchet dropped from 2155 (baseline) to 2083 — no gate was weakened;
  the only baseline change across the five waves was Wave 7's 4 line-number re-keys (same 32 findings).

## 2. What is genuinely fixed on the owner shadow-pilot runtime path (DB-proven)
| Path | Before | After (DB-proven) |
|---|---|---|
| CSV ingestion → owner surface | `sales/operations/sop/marketing` confirmed → **0 rows** materialized (dead-end) | materializes into the real `Owner{Domain}Snapshot` the per-domain owner dashboards read (Wave 5) |
| Overdue-action escalation (Phase-7 re-eval + escalation-checks) | threw `PrismaClientValidationError` on phantom `Action.priority/dueDate/workspaceId` | runs; "critical overdue" derived from the real `Recommendation.priority`; no phantom column (Wave 6) |
| Verified-session authz state | snapshot fabricated `workspace.isActive:true` / name / entitlements | reads real `workspace{name,isActive}` + membership; entitlements honestly unresolved; no fabricated timestamps (Wave 7 M1) |
| Governed escalations | log-only but returned as if actionable | honest `delivery:"log_only"` on alert + audit payload + route (Wave 7 M4) |
| User admin routes (`users/[userId]` PATCH/POST/GET, users collection) | threw on phantom `User.workspaceId`/`email_workspaceId` | membership-relation scoped; version-checked writes via `updateMany`+`OptimisticLockError` (Wave 8) |
| Time-based reassessment seam | 401-only tested | authorized 200 + governed-500 proven; scan behaviour DB-proven; fail-closed (Wave 9) |

## 3. Residual open items (documented decisions — hostile blocking assessment)
Each was recorded in a wave decision memo, is **honest at runtime** (throws/degrades truthfully, never masks), and is
assessed here for whether it blocks the **owner shadow-pilot runtime path** (owner-supervised, signal-gathering; NOT
autonomous, NOT live-outcome).

| Residual | Wave | Nature | Owner-path blocking? |
|---|---|---|---|
| Manual-entry materialization into typed snapshots | 5 | product-mapping decision (freeform fields, no period) | **No** — manual entry still reaches onboarding confidence; CSV path materializes. Owner has a working ingestion path. |
| Non-finance CSV flipping the command-center critical domains (e.g. operations→`equipment_capacity`) | 5 | product decision (`operations→OwnerCapacitySnapshot` mapping) | **No (with caveat)** — non-finance CSV reaches the per-domain dashboards; the command-center capacity/working-capital/compliance gates are fed by their dedicated forms/snapshots + finance CSV. Owner value is available; the operations→capacity bridge is a later product choice. |
| Auto-escalate priority on overdue (`detectOverdueActions`) | 6 | product decision (shared-Recommendation over-escalation) | **No** — function has no production caller; the wired path (`detectHighPriorityOverdueActions`) is fixed. |
| Entitlements resolved in the auth hot path | 7 | security/infra decision (`resolveEntitlements` fails closed) | **No** — snapshot entitlements were unconsumed; real limit checks run on-demand fail-closed via `entitlement.service`. |
| Adjacent alert honesty debt: phantom `db.alert` model; `notification-service` `Math.random()` "sent"; `handleEmailAction` `success:true` | 7 | schema/product decisions | **No** — off the owner escalation-detector path; non-functional already (phantom model). Flagged for owner follow-up. |
| Lead (`LeadRecord`) + ClientAccount/ClientContact workspace scoping | 8 | schema decisions (`workspace_id` column + migration; ClientAccount `id`-IS-workspace dual-model) | **No** — internal/consultant-side routes; the owner shadow-pilot path does not traverse them. Still throw honestly until decided. |
| External cadence trigger for reassessment | 9 | owner deployment decision (Vercel Cron / GitHub Actions) | **No** — event-driven reassessment fully wired; the seam is ready + fully tested; degrades silently, never falsely. |

## 4. Hostile self-audit (§34)
- **Overclaim?** No. Every "fixed" claim is DB-proven on merged main (§1). Every deferral is a documented decision
  with an explicit owner-path blocking verdict (§3), not a silent "deferred".
- **Masked failure / fake / empty-array masking?** No. The residual broken internal services (Lead/ClientContact)
  still throw honestly; no try/catch fallback, no fabricated scope, no 500→200 conversion.
- **Seeded proof for real-owner capability?** No — Wave 5–9 proofs drive the real un-mocked service/route paths
  against a real DB (Wave 9's route test mocks the scanner only to isolate a global-scan side effect; the scan
  behaviour itself is DB-proven separately).
- **Gate weakened / threshold lowered / test deleted?** No. Ratchet baseline unchanged in value (2155), current 2083;
  governance 32 frozen / 0 new (only 4 line re-keys); auth scanner comply; no test removed.
- **Fake scheduler / autonomy / duplicate engine / parallel AI brain?** No. Wave 9 built no scheduler; no new engine;
  no AI autonomy anywhere in 5–9.
- **Any claim of live outcome / profit / public-SaaS readiness?** No — explicitly disclaimed (§6).

## 5. Classification decision
**`SHADOW_PILOT_RUNTIME_READY_MERGED`.**
Rationale: the owner shadow-pilot runtime path — CSV ingestion → owner-visible read models, the governed adaptive
re-evaluation/escalation loop, verified auth state, and the user-admin surfaces — is now free of the phantom-column
runtime throws and fabricated state that produced MILESTONE_RUNTIME_PARTIAL, and every fix is DB-proven on merged
main with all gates green. The residual items are documented product/schema/infra decisions, each assessed
**non-blocking** for the owner-supervised shadow pilot and honest at runtime (§3). The five MILESTONE_RUNTIME_PARTIAL
items are therefore closed (fixed) or converted into explicit, non-blocking, owner-visible decisions.

## 6. Explicit NON-claims (unchanged, still forbidden without further work + evidence)
This audit does **NOT** assert, and OpsIQ has **NOT** reached: `SHADOW_PILOT_RUNTIME_READY` in the fully-wired sense
beyond "merged + runtime-ready path", `LIVE_PILOT_READY`, `LIVE_OUTCOME_PROVEN`, `PUBLIC_SAAS_READY`, Startup-Mode
readiness, or any live outcome / profit / growth proof. Public SaaS / billing / launch / marketing / external
integrations remain out of scope and untouched.

## 7. Next gate (requires explicit owner go-ahead)
Per the follow-up directive, `SHADOW_PILOT_RUNTIME_READY_MERGED` is the gate that *unlocks* `STARTUP_MODE_BUILD`.
Startup Mode is a new build phase (not a remediation wave); this audit **stops here** and does not begin it. Awaiting
the owner's explicit go-ahead before any Startup-Mode work. The residual decisions in §3 are the recommended inputs
the owner should resolve (manual-entry/command-center mapping; Lead/ClientAccount schema; the reassessment cron
trigger; the adjacent alert-honesty debt) either before or alongside Startup Mode.
