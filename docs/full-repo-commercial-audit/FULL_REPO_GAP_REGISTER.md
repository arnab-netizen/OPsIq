# OpsIQ / Rebilix — Full-Repo Commercial Reliability Hostile Audit — Gap Register

- Base: `main` @ `1ef21e2`
- Branch: `claude/full-repo-commercial-reliability-hostile-audit-6esgeo`
- Method: skeptical full-repo inspection + 4 parallel hostile deep-dives (security/tenancy, owner-mode wiring, proof integrity, stale docs/CI) + local DB-backed test suite (802 files / 13,978 tests green on base) + targeted runtime probes against a local Postgres 16.
- Evidence standard: every claim verified by code (file:line), a runtime probe, a test run, or a DB query. Claims that were NOT verified are marked as such.

Baselines confirmed at entry: 23 quarantined test files, 91 files under `__ignored_tests__`, 29 frozen "unwrapped handler" (response-envelope) violations, 32 frozen error-governance findings.

## Severity legend
CRITICAL = live exploitable / data-loss / core-flow-broken · HIGH = exploitable-with-conditions or shipped-but-broken/unreachable · MEDIUM = real risk, bounded · LOW = hygiene/hardening.

---

## ⏩ UPDATE — Owner-Mode Hardening slice (branch `claude/owner-mode-hardening-commercial-gap-closure`, base `98762ba`)
The follow-up hardening slice changed the status of several gaps below. See
`OWNER_MODE_HARDENING_GAP_REGISTER.md`, `COMMERCIALIZATION_GAP_REGISTER.md`,
`COMMERCIALIZATION_DECISION_REGISTER.md`, `TENANT_BACKSTOP_MODEL_CLASSIFICATION.md`,
`EVIDENCE_SYSTEM_DECISION_RECORD.md`.

| Gap | New status | Where |
|---|---|---|
| GAP-TEN-01 (dead DB backstop) | **CLOSED (curated: UsageEvent live) + remainder downgraded with per-model criteria** | commit `e763f8c` |
| GAP-TEN-03 (admin billing role) | **CLOSED — resolved workspace-scoped** | commit `7339332` |
| GAP-EVIDENCE-DRIFT-01 | **CLOSED (core evidence routes)**; bundle sub-feature → GAP-EVIDENCE-DRIFT-02 (owner decision) | commit `9fd3f00` |
| GAP-PROOF-02 (override client-trust) | **CLOSED → renamed GAP-OVR-01** (server gate + durable + audited) | commit `5dc4202` |
| GAP-AUDIT-01 (silent audit) | **PARTIALLY CLOSED** — override + blocked-decision transactional; addItems/updateItem remain (GAP-AUDIT-02) | commits `5dc4202`,`33ae3ab` |

---

## FIXED THIS AUDIT

### GAP-FIN-01 — HIGH — Client-spoofable high-impact financial approval bypass — **CLOSED_PROVEN**
- Category: H (finance/capital guardrails) / hostile #9, #44.
- Files: `src/app/api/run/route.ts:867` (was), `src/services/control/guardrails.ts`.
- Evidence: `/api/run` fed `approvalFlag: body.approvalFlag || false` straight into the `HIGH_IMPACT_APPROVAL` guardrail, which blocks `expectedImpact > 100000` unless `approvalFlag === true`. Any authenticated editor could bypass the >100k financial block by sending `approvalFlag:true`. Guardrail enforcement itself is real (blocks + persists a blocked decision), so the flag was the whole gate.
- Impact: an owner-level financial safety block on high-impact decisions could be silently overridden by a non-approver, with no record of who approved.
- Fix: derive the effective flag from `resolveApprovalGrant(role, body.approvalFlag)` (new, in `src/services/auth/access.ts`) — honored only when the server-verified role `canApprove` (admin). Emit `HIGH_IMPACT_APPROVAL_GRANTED` / `HIGH_IMPACT_APPROVAL_DENIED` audit events so no override is unrecorded.
- Tests: `src/services/auth/__tests__/approval-grant.test.ts` (5, pass) — operator/viewer cannot self-grant; admin can; fail-closed on spoofed values; operator+flag still hits the block.
- Closure: commit `2f551a2`. tsc clean; auth governance scan clean.

### GAP-TEN-02 — HIGH — Cross-tenant reads/writes via trusted `x-workspace-id` header — **CLOSED_PROVEN**
- Category: C (tenancy) / hostile #5, #6.
- Files: `src/app/api/billing/plan/route.ts`, `src/app/api/deliverables/[deliverableId]/route.ts`, `src/app/api/engagements/[engagementId]/business-impact/route.ts`, `src/app/api/engagements/[engagementId]/decision-evidence/route.ts`, `src/app/api/webhooks/subscribe/route.ts`, `src/app/api/webhooks/[id]/test/route.ts`.
- Evidence: 30 routes read the client-supplied `x-workspace-id` header; classification showed most bind the actor via `assertEngagementAccess`/`verifiedWorkspaceId` (safe), but 6 passed the raw header straight to a workspace-scoped service with no membership check. `billing/plan` was the cleanest: **no capability + no actor binding** → any authenticated user could read any workspace's billing plan by setting the header. The canonical wrapper already derives `ctx.verifiedWorkspaceId` from the user's membership (`canonical-route-enforcement.ts:339-393`, "NEVER trusted from request headers").
- Impact: cross-tenant reads of billing, deliverables, business-impact, decision-evidence; cross-tenant webhook subscription (event exfiltration) / test.
- Fix: canonical routes now use `ctx.verifiedWorkspaceId` (+ `assertEngagementAccess` on the two engagement routes, + `requireWorkspace: true` and least-privilege capabilities); webhook routes verify membership via `enforceWorkspaceScoping(request, workspaceId)` before use.
- Tests: `src/__tests__/security/cross-tenant-workspace-header.test.ts` (8, pass); admin/billing + webhook + business-impact suites (72) still pass; auth governance scan clean.
- Closure: commit `3dd002f`.

### GAP-WIRE-01 — HIGH — Owner wealth loop / Startup Mode unreachable (UI-orphaned) — **CLOSED_PROVEN (UI reachability); residual re-eval gap tracked as GAP-WIRE-02**
- Category: I, K, F / hostile #2, #50.
- Files: `src/app/(authenticated)/owner/wealth/page.tsx` (new), `src/app/(authenticated)/owner/page.tsx` (nav).
- Evidence: `/api/owner/wealth-command-center`, `/api/owner/wealth-path`, `/api/owner/startup-validate` shipped with a complete engine→service→API chain but zero UI referenced them (`grep` across all `.tsx` empty). No owner could reach the "cheat-code" wealth-loop decision view.
- Fix: added a read-only owner Wealth page that fetches `/api/owner/wealth-command-center` (capability-gated OWNER_VIEW, workspace-scoped) and renders next best move, wealth path/BMQ, risk-adjusted score, financial-safety gate, prepared Work Package, proof requirement, and owner-workload transfer; added a nav entry from the owner command center. No business/permission logic in the page.
- Tests: `src/__tests__/owner-mode/wealth-command-center-wiring.test.ts` (3, pass). tsc + eslint clean.
- Closure: commit `1e27d96`.

---

## OPEN — CRITICAL / HIGH (locally fixable but too large for one safe slice, or requires an owner decision)

### GAP-TEN-01 — HIGH (defense-in-depth) — Prisma workspace-isolation middleware is an inert no-op — **OPEN (documented in code; safe fix is a multi-step migration)**
- Category: C (tenancy) / hostile #5.
- Files: `src/lib/prisma-workspace-enforcement.ts` (wired at `src/lib/db.ts:52`).
- Evidence (proven): the middleware keys `WORKSPACE_OWNED_MODELS`/`GLOBAL_MODELS` on camelCase names (`"engagement"`), but Prisma v7 passes `model` as PascalCase (`"Engagement"`), so `.has()` never matches and the entire fail-closed backstop is skipped. Independently confirmed by the security deep-dive (empirical probe: `UNSCOPED_FINDMANY_BLOCKED=false`).
- Why not flipped this slice: enabling it (normalize casing) is **not safe in one step** — proven that core production paths legitimately write workspace-owned models without a direct workspaceId. Empirical blast-radius test after a casing fix: 5/18 sampled DB test files failed (15 tests), and critically `src/app/api/auth/signup/route.ts:51` does `db.user.create` with no workspaceId (the workspace is created *after* the user) → enforcement would **break signup in production**. `deleteMany AuditEvent` in cleanup and `create ClientAccount/User` also throw. The model classification is itself wrong (User is membership-scoped, not directly workspace-owned).
- Mitigation in place: the LIVE tenant protection is route-level — `withCanonicalEnforcement` (`ctx.verifiedWorkspaceId`) + `assertEngagementAccess` + capability gates — which the security deep-dive rated SOLID for the dominant route pattern, and which GAP-TEN-02 hardened for the deviating routes.
- Required fix (multi-step, register the rest): (1) re-classify models (User→global/membership; audit-cleanup path exempt or scoped); (2) add `findUnique`/`findUniqueOrThrow`/`upsert` to enforced ops; (3) scope every workspace-owned query; (4) update test fixtures; (5) flip casing; (6) full-suite green. This slice added a truthful code comment documenting the dead state so no one claims DB-level isolation is enforced.
- Status: OPEN. Not a live data leak on its own (route layer is the live control), but a dead backstop that must not be advertised as active.

### GAP-EVIDENCE-DRIFT-01 — HIGH — Legacy `Evidence` service is schema-drifted and throws at runtime — **OPEN**
- Category: D (data integrity), R (operability), S (stale) / hostile #42, #41, #33.
- Files: `src/services/evidence.ts` (createEvidence, updateEvidence, getEvidenceById, validateEvidence, listEvidence), reachable via `src/app/api/evidence/route.ts` and `src/app/api/evidence/[evidenceId]/validate/route.ts`.
- Evidence (proven at runtime): the `evidence` table (and generated Prisma type) has **no `workspaceId` column** (it is scoped via its `engagement`), yet the service queries `db.evidence.findUnique({ where: { id, workspaceId } })` and `db.evidence.create({ data: { workspaceId, severity, sourceReference, visibility, ... } })` — none of which exist on the model. Because `db` is an untyped `Proxy` (`src/lib/db.ts:112`), tsc cannot catch it. Runtime probe via the app's own `@/lib/db` against local Postgres: `PROBE_RESULT_ERROR: Invalid \`prisma.evidence.findUnique()\` invocation`.
- Impact: every legacy-Evidence route 500s at runtime; the SoD hole the proof deep-dive flagged (submitter can self-validate) is moot because the function never reaches its update. Undetected because the service is untyped AND has no runtime/DB test (all maintained `validateEvidence` tests exercise the *pure-domain* function in `src/domain/owner-mode/evidence-capture.ts`).
- Context: the proof deep-dive confirmed the **real** evidence path — the delegated-task Proof FSM (`src/domain/execution/proof.ts` + `src/services/execution/*`) — is genuinely strong (reuse/stale/duplicate/fake resisted, SoD enforced, transactional audit). The legacy `Evidence` entity appears superseded.
- Required fix (owner decision needed): either (a) repair the drift — remove `workspaceId` from `db.evidence.*` where-clauses, scope via `engagement` + `assertEngagementAccess`, drop non-existent `severity`/`sourceReference`/`visibility` create fields (map to `severityRating`/`source`), add the SoD guard (`submittedBy !== actor`) and a `version` optimistic guard, and add DB-backed tests; or (b) if legacy, remove the routes/service and delete dead code. Not attempted this slice because it is a subsystem-level repair/removal, not a minimum-code fix, and shipping a partial SoD guard into throwing code would be misleading.
- Status: OPEN.

---

## OPEN — MEDIUM

### GAP-PROOF-02 — MEDIUM — `/api/override` trusts client `overrideAllowed`; never calls the safety gate; in-memory store
- Files: `src/app/api/override/route.ts:57,75`; `src/services/override/store.ts:3-7`.
- Evidence (proof deep-dive): the override route applies an override when the request body says `overrideAllowed: true`, never calling `assertOverrideAllowed` (`src/domain/owner-budget/owner-override.ts:73`), so hard-blocked unsafe/illegal overrides (unverified vendor bank change, statutory-reserve breach) can be forced by a client. Overrides are stored in a non-persistent in-memory array (no DB, no workspace isolation, lost on restart). Contrast: the owner-budget path (`governance.service.ts:44-90`) does this correctly (calls the gate, persists, audits, re-assesses).
- Required fix: derive `overrideAllowed` from `assertOverrideAllowed`; persist to `ownerBudgetOverride`; emit audit. Locally fixable; deferred behind the two HIGH items.
- Status: OPEN.

### GAP-AUDIT-01 — MEDIUM — Silent audit-emission failure after committed operator mutations
- Files: `src/services/operator/store.ts:107,230,301,463`; `src/app/api/override/route.ts` audit `.catch(console.error)`.
- Evidence (proof deep-dive): operator-item create/update/override/blocked-decision emit audit with a swallowed `.catch()` AFTER the DB write already committed — the mutation persists even if its audit event is lost, violating "all meaningful mutations must emit audit events." Contrast: the Proof FSM writes audit inside the `$transaction` (fail-closed); `createEvidence` awaits its emit uncaught.
- Required fix: emit audit inside the same transaction as the mutation (fail-closed), or enqueue a durable retry. Locally fixable but touches 4 hot mutation sites; deferred.
- Status: OPEN.

### GAP-AUTHZ-01 — MEDIUM — Owner-override role confusion (portfolio manager stands in as OWNER)
- Files: `src/policies/capability-check.ts:72`; `src/app/api/owner/tasks/complete/route.ts:37-43`.
- Evidence (proof deep-dive): `OWNER_MANAGE` is granted to `ADMIN_OR_PORTFOLIO_MANAGER`; the proof-gate complete route hard-codes `actor.role = TaskActorRole.OWNER` for anyone with that capability, so a portfolio manager can invoke the owner-only proof-gate bypass, logged as an OWNER override. It IS audited (detectable), so this is confusability, not a silent hole.
- Required fix: distinguish true business-owner from internal manager for owner-only overrides. Needs product intent; register.
- Status: OPEN.

### GAP-TEN-03 — MEDIUM — `/api/admin/billing/diagnostics` reads header workspace for a SYSTEM_ADMIN export — **OWNER DECISION REQUIRED**
- Files: `src/app/api/admin/billing/diagnostics/route.ts:23`; test `src/__tests__/api/admin/billing-route.test.ts` (locks the header pattern by code inspection).
- Evidence: SYSTEM_ADMIN is verified against the caller's own workspace, then the billing diagnostic/**export packet** is fetched for the header workspace. Whether this is a cross-tenant export bug or an intended platform-superadmin feature depends on whether the `system_admin` role is global or per-workspace (`capability-check.ts:9` grants it ALL capabilities; role assignments are workspace-owned). Not changed unilaterally because it would alter admin semantics and break a code-inspection test that asserts the header pattern.
- Required fix / decision: confirm whether `system_admin` is a global platform role. If per-workspace → switch to `ctx.verifiedWorkspaceId`; if global superadmin → keep, and fix the test to assert a real cross-workspace authorization instead of the header string.
- Status: OPEN (decision required).

### GAP-CI-01 — MEDIUM — Contradictory root "readiness" reports with no authority ordering
- Files: `PRODUCTION_READINESS_AUDIT_FINAL.md:4,10` ("PRODUCTION_READY / 100% test coverage", 2026-04-28) vs `AUDIT_MASTER_REPORT.md:11-30` ("Deployability: NO / Enterprise: NO / Monetization: NO", 2026-05-12); triplicate auth verdicts (`AUTH_FINAL_VERDICT.md`, `AUTH_TRUE_FINAL_VERDICT.md` "ZERO VULNERABILITIES", `AUTH_BYPASS_AUDIT.md`).
- Evidence (stale-docs deep-dive): ~595 root markdown files contain mutually contradictory verdicts; none reflect the still-active baselines (23 quarantined tests, 29 unwrapped handlers, 32 frozen governance findings). Biggest credibility problem for an enterprise reader.
- Fix applied this slice: superseded banners added to the two contradictory reports pointing to this audit (see commit). Full consolidation deferred.
- Status: IN_PROGRESS (banners added; full archive/reconciliation deferred).

---

## OPEN — LOW

- **GAP-REL-01 — LOW — pg pool has no explicit `max`/timeouts** (`src/lib/db.ts:42`). Relies on the documented Neon `-pooler` URL for serverless connection limits; no per-instance `max`/`idleTimeoutMillis`/`connectionTimeoutMillis`. Register; mitigated by documented pooler usage.
- **GAP-REL-02 — LOW — `/api/execute` binds workspace to default `"system"`** (`src/app/api/execute/route.ts:21-26` via `withAuth` default), which no real workspace matches → the route 401s for all users (dead, fails closed). Correctness cleanup.
- **GAP-SIG-01 — LOW — asymmetric signature never verified on the write path** (`src/services/operator/store.ts:70-78`; `src/services/integrity/asymmetric.ts:37` regenerates ephemeral keys per process). Signature column is decorative on write; only `/api/verify` verifies. Hardening.
- **GAP-AUDIT-02 — LOW — audit hash-chain non-atomic read-then-write** (`src/infra/audit.ts:41-66`) → concurrent emits can fork the chain undetected; fail-open on missing workspaceId (`:28-36`). Hardening.
- **GAP-CI-02 — LOW — dead/dispatch-only CI workflows inflate apparent coverage.** 5 workflows auto-trigger only on the deleted branch `claude/execution-audit-phase-a-ulmljq`; 8/11 db-verification + 12/12 runtime-proof workflows never auto-fire. **No coverage is lost** — `ci.yml` runs every targeted test on main/PR with DB (quarantine ∩ dead-workflow targets = ∅, verified by the stale-docs deep-dive). Cleanup only.
- **GAP-TEST-02 — LOW — `admin-operability-db.test.ts` is not idempotent across runs.** Its `beforeAll` fixtures accumulate `workspaceMembership` rows when re-run against a persistent DB, so `memberCount).toBe(2)` fails on a second run. Passes on a fresh DB (and in CI, which uses a fresh `postgres:16` container per run). Fix: scope the assertion to freshly-created members, or clean up in `afterAll`. Not a code regression — verified by resetting the schema and re-running (11/11 pass).
- **GAP-TEST-01 — LOW — quarantined `security/*` + `phase-i10-enforcement-scanner` suites hide no real hole** (verified: `diagnostic-key-validation` 17 pass, `ops-endpoints-auth` 20 pass in isolation; `route-scanner`/`enforcement-scanner` failures are false positives — bearer-token/diagnostic-key routes the scanners don't recognize). Residual risk: while quarantined, these scanners won't catch a *future* truly-unprotected route. Fix: teach scanners the token patterns, un-quarantine.

---

## Verified STRONG (no gap) — recorded so the audit is not just a defect list
- Route-level authorization is server-side and enforced before handlers (`canonical-route-enforcement.ts:461-568`); 229 routes consume `ctx.verifiedWorkspaceId`; dominant list/create pattern threads the verified workspace into service `where` clauses.
- Delegated-task Proof FSM: submission validated vs requirement; duplicate file-hash, staleness (maxAgeDays), and fake/no-artifact all resisted; SoD enforced (performer ≠ approver); status change + audit in one `$transaction`.
- Idempotency (`src/services/idempotency.ts`): unique key, payload/operation mismatch rejection, P2002 concurrent-insert re-read, in-flight duplicate rejection; proof-complete is a compare-and-swap `updateMany({where:{status:fromStatus}})`.
- Owner-budget override done right (`governance.service.ts:44-90`): calls `assertOverrideAllowed`, persists, audits, re-assesses. Real runway gate `checkCashRunwaySafe` (`constraint-enforcer.ts:161-186`).
- CI (`ci.yml`) is the true live gate: governance (auth+strict), tsc, prisma validate/migrate, build, wrapped-handler ratchet, full DB-backed vitest (quarantine excluded), lint ratchet, on push to main/claude/** and PRs to main.
