# OpsIQ — Full-Repo Hostile & Skeptical Investigation

**Date:** 2026-07-04
**Branch:** `claude/opsiq-hostile-audit-jye6h4`
**HEAD:** `98762ba53214c4f772e9ace3d5012757b524418b`
**Working tree at start:** clean
**Method:** Read-first, evidence-first. Seven parallel hostile investigators (auth/isolation, approval/audit, evidence/anti-gaming/reassessment, AI/advisory, tests/CI, DB/billing/webhooks, UI) plus independent inline verification of **every CRITICAL and HIGH finding** by the lead auditor. No production logic was modified. Prior "complete/green/verified" claims were treated as false until proven from code.

Companion artifact: `EVIDENCE_LEDGER.json` (machine-readable, 42 findings).

---

## 1. Executive verdict

OpsIQ is **not hollow** — there is a large, genuinely-built system underneath: a strong canonical auth wrapper used by 253/317 routes, a real DB-backed capability/entitlement gate, a correct atomically-audited delegated-task path, real Stripe signature verification, a real evidence FSM with separation-of-duty, a substantial deterministic consulting engine, and a required CI gate that actually runs against a real Postgres.

But under hostile inspection the system **cannot yet be trusted as an owner-mode command-and-control platform**, for four structural reasons:

1. **Authorization is defeated at the root.** `resolveServerRole()` returns `"admin"` for *every* authenticated user. Two recent "fix(security)" commits that depend on server-verified roles are therefore inert, and a cross-tenant governed-write path exists.
2. **Tenant isolation has no backstop.** The DB-level enforcement extension is provably inert (casing bug), and a placeholder `workspaceId = session.user.id` is still wired into governed paths. Isolation depends on 317 routes each individually remembering to scope — with nothing behind them.
3. **The proof/outcome/idempotency spine is partly theater.** Outcome "success" is model-vs-model fabrication, the "re-evaluate on bad outcome" promise is unwired, the idempotency wrapper on core mutations is a no-op, and the fine-grained abstention/safety gate runs only in benchmarks.
4. **The green checkmark oversells.** The team's own inventory documents **614 fake tests** still inline in active files; governance-named suites assert constants; and the codebase's own route-protection scanner (flagging 14 unwrapped routes) is quarantined non-blocking.

**Owner private use:** OWNER_MODE_PARTIAL (usable by a single trusting owner in a single workspace; unsafe the moment a second tenant or an adversarial staff member exists).
**Controlled pilot:** OWNER_MODE_NOT_READY.
**Product Hunt / public demo:** PUBLIC_DEMO_NOT_READY (primary dashboard renders blank; fake decision inbox).
**Paid SaaS:** COMMERCIALIZATION_NOT_READY.
**Public/enterprise SaaS:** PUBLIC_SAAS_BLOCKED (cross-tenant write path + no isolation backstop + tier bypass).

---

## 2. Scope inspected

- **Code:** 2,500 TS/TSX source files, 317 API route handlers, 168 Prisma models, 99 migrations, 905 test files, 81 CI workflows, 595 root-level markdown reports.
- **Domains traced end-to-end:** auth/session, authorization/capabilities, workspace/tenant isolation, approval gates, audit/event logging, idempotency, concurrency, decision lifecycle, evidence/proof + anti-gaming, outcome tracking, reassessment loop, recommendation/diagnosis/abstention, billing entitlement, Stripe webhooks, schema/data integrity, UI/owner-journey reachability, test suite, CI/CD.

## 3. Commands run

| Command | Result |
|---|---|
| `git rev-parse --abbrev-ref HEAD` / `HEAD` | branch + HEAD recorded (§ top) |
| `npx prisma validate` | **PASS** — schema valid |
| `npx prisma generate` | **PASS** |
| `npx tsc --noEmit` | **PASS — 0 errors** |
| `node scripts/audit-wrapped-handlers.js audit` | 29 canonical-response violations |
| `npm test` (default vitest) | Attempted; long-running, stopped in favor of authoritative CI-config analysis (default run also self-excludes the entire DB proof tier — see TEST-03) |
| Targeted `vitest run` on quarantined scanner | Blocked by default config exclusion (phase-*/security excluded without TEST_WITH_DB) — evidence taken from quarantine ledger + scanner source instead |

**Blocked / unproven:** live migration-vs-schema diff (`prisma migrate diff`) — no database provisioned in this environment; GitHub branch-protection required-check config — API permission denied, so whether `ci.yml` is actually a *required* status check on `main` is UNVERIFIED and must be confirmed in repo settings.

---

## 4. Findings by area (42 total: 6 CRITICAL, 25 HIGH, 10 MEDIUM, 1 LOW)

### 4.1 Security / authorization / tenant isolation

- **[CRITICAL · SEC-01] Always-admin role.** `src/services/auth/server-role.ts` returns `"admin"` for any logged-in user. Defeats commit `2f551a2` (approval-flag gate) and every `resolveServerRole` consumer. *Verified inline.*
- **[CRITICAL · SEC-02] Cross-tenant governed write via `POST /api/operator`.** Always-admin + placeholder workspace + workspace-unscoped `updateItem({where:{id}})` + inert DB backstop ⇒ any authenticated user can mutate another workspace's `OperatorItem` given its UUID; audit misattributes it to the victim. IDOR-gated (needs the UUID), but the isolation control is absent. *Chain components verified inline.*
- **[HIGH · SEC-03] Placeholder tenancy.** `src/services/workspace/context.ts:24` `workspaceId = session.user.id`, still used by governed read/write paths. *Verified inline.*
- **[HIGH · SEC-04] GAP-TEN-01 inert DB backstop.** `prisma-workspace-enforcement.ts` keys models camelCase; Prisma v7 passes PascalCase ⇒ every check short-circuits. Registered live (`db.ts:52`) ⇒ false sense of DB isolation. *Verified inline; self-documented in code.*
- **[MEDIUM · SEC-05] Partial `x-workspace-id` de-trust.** ~30 handlers still read the client header; sampled ones are redeemed by a membership check so not exploitable, but several ignore the already-verified `ctx.verifiedWorkspaceId`. Fragile.
- **[MEDIUM · SEC-06] Three incompatible role models;** broken hierarchy lookup fails closed today but is one mapping change from escalation.

Solid & verified: `withCanonicalEnforcement` derives workspace strictly from DB membership (never headers); `getPolicyContext`/capability layer; login/session lifecycle; `assertEngagementAccess`/`enforceWorkspaceScoping`.

### 4.2 Approval gates, audit, idempotency, concurrency

- **[CRITICAL · IDEM-01] No-op idempotency.** `src/infra/idempotency.ts` `withIdempotency` always returns `{isNew:true}`; used across core mutation services (action, evidence, recommendation, engagement, findings, kpi…). Some routes *require* the key then ignore it. A real DB-backed `services/idempotency.ts` exists but isn't used by these paths. *Verified inline.*
- **[CRITICAL · AUDIT-01] Fail-open audit.** Only the delegated-task path writes audit inside the mutation transaction; core decision paths write post-commit and **swallow** audit failures (≥17 exact swallow sites verified), and `emitAuditEvent` silently no-ops on missing workspaceId. A mutation can persist with no audit record.
- **[HIGH · AUDIT-02] Five parallel audit mechanisms** (two of them dead/stub). Not centralized. *Read path is genuinely real, workspace-scoped, hash-chain verifiable — a real positive.*
- **[HIGH · APPR-01] Approval threshold enforced on ONE route.** Finance/budget/decision routes bypass the >100k workflow; `resolveOwnerApproval` only advises, gates nothing server-side.
- **[HIGH · APPR-02] Guardrail-override record → in-memory black hole** (`override/store.ts` module-global array, never read, lost on restart, cross-tenant). *Verified inline.*
- **[HIGH · CONC-01] Last-write-wins** on `acceptDecision`/`rejectDecision`/`approveOutcomeVerification`/`applyOverride`/operator `updateItem` (TOCTOU). *Verified inline for acceptDecision.*
- **[HIGH · DEC-01] Re-accept hole:** validator allows `in_progress`, accept sets `in_progress`, unguarded update ⇒ an accepted decision can be re-accepted repeatedly. *Verified inline.*

### 4.3 Evidence, anti-gaming, outcome, reassessment

- **[CRITICAL · OUT-01] Outcome success is model-vs-model fabrication** (`accuracyScore = 100 - |confidenceΔ - 10|`; value from impact-level formula). A business with flat/declining KPIs can show high accuracy + large "value recovered."
- **[CRITICAL · OUT-02] Outcome→re-evaluation not wired.** `recordOutcome` computes regression and does nothing; the variance→replan/rollback/halt FeedbackLoop has no production caller. The flagship "re-evaluate when outcomes don't improve" promise is absent.
- **[HIGH · REEVAL-01] 3 of 9 mandatory adaptive triggers missing** (kpi_deterioration only alerts; failed_implementation and owner_non_compliance defined but never called); phase-blocker list is always empty ⇒ `canAdvance` always true. *Engine itself is real.*
- **[HIGH · SHOCK-01] ShockEvent never persisted** (create path doesn't write; update is a throwing stub) ⇒ created shocks never appear.
- **[HIGH · EVID-01] Anti-gaming precheck is dead code;** tamper/EXIF/relevance signals are never computed; reuse caught only by exact byte-hash; "freshness" measured from submission recency, not artifact age. *Staff proof FSM + human review + SoD + exact-hash dedup ARE real.*
- **[HIGH · GAME-01] Owner can null `maxProofAgeDays`** (client-supplied) to disable the freshness gate; no server floor.
- **[MEDIUM · EVID-02] decision-evidence `verified` is a passthrough flag,** not a computed check.

### 4.4 AI / advisory safety — overall **PARTIALLY_CONTROLLED**

- **[HIGH · AI-01] Live canned generic-advice engine on `/api/diagnosis`** (6 hardcoded business-fluff strings; fabricates advice from zero data). A second, real evidence-grounded consulting engine also exists ⇒ **duplicate/conflicting engines.**
- **[HIGH · AI-02] Abstention/safety gate is benchmark-only dead code** on the owner write path, with several gate inputs hardcoded to "safe."
- **[MEDIUM · AI-03] Per-recommendation proof linkage dropped at persistence.**

Safe from unbounded/autonomous behavior: no live LLM in the recommendation path (default provider fails closed); engines are deterministic.

### 4.5 Billing, webhooks, schema

- **[HIGH · BILL-01] Tier bypass via client `x-tier` header** (never set server-side); rate-limit store is in-memory. *Verified inline.* Entitlement `assertCapability` DB gate itself is real & fail-closed.
- **[HIGH · WEBHOOK-01] Fire-and-forget webhook + fail-open subscription sync** can drop paid-subscription activation events. Signature verification & dedup are real.
- **[MEDIUM · WEBHOOK-02] Replay-timestamp check is a no-op** (hardcoded `Date.now()`).
- **[MEDIUM · BILL-02] No `currentPeriodEnd` expiry enforcement.**
- **[HIGH · SCHEMA-01] Governed models lack direct `workspaceId`** (Action, Evidence, Finding, ApprovalRequest…), scoped only via engagement join. *Verified inline (Action).*
- **[HIGH · SCHEMA-02] 82 `onDelete: Cascade`,** incl. hard-deleting governed Owner* records with no audit; missing User FKs on approver/assignee columns. *Verified inline.*
- **[HIGH · SCHEMA-03] Entity collapse:** columns named `workspaceId` whose FK targets `ClientAccount`, not `Workspace`. *Verified inline.*
- **[HIGH · SCHEMA-04] Free-form String statuses + nullable approver/validator columns** ⇒ illegal states representable (approved with null approver).

### 4.6 UI / owner-journey reality

- **[HIGH · UI-01] Primary `/dashboard` renders blank** — server component self-fetches its own API without forwarding the auth cookie ⇒ 401 ⇒ `return []`. *Verified inline.*
- **[HIGH · UI-02] `/decisions` inbox is cosmetic** — `setDecisions([])` hardcoded; the real inbox at `/dashboard/inbox` is unlinked. *Verified inline.*
- **[HIGH · UI-03] Owner command center orphaned from nav** — ~30 operational owner pages unreachable from the sidebar; the owner journey pieces work but the assembly does not.
- **[MEDIUM · STUB-01/02] Owner-reachable stubs:** experiment-approve "Mock store for now"; `api/public/*` mock arrays. *Verified inline.*
- **[LOW · DEAD-01] Four unrouted mock-data UI shells** (latent misleading risk).

### 4.7 Tests / CI honesty

- **[HIGH · TEST-01] 97 `__ignored_tests__` files run in NO lane** (incl. all 14 integration tests, real RBAC & visibility suites; several broken by a mechanical file-move that stripped their imports).
- **[HIGH · TEST-02] Security scanners quarantined non-blocking** — route-scanner + enforcement-scanner (flagging **14 unwrapped routes**) and an owner-capability contract test can go red while `ci.yml` is green.
- **[HIGH · TEST-04] 614 documented fake tests still inline in active files** (`api/decisions.test.ts`: 50 `expect(true)` + 37 empty quarantined bodies; workspace-isolation test asserts `"ws_123" !== "ws_456"`; 12 `learning-*` route tests assert their own mocks). *Verified inline; team's own A2_FAKE_TEST_INVENTORY.md admits it.*
- **[MEDIUM · TEST-03] Default `npm test` self-excludes the entire DB proof tier** (59 files `skipIf(!SHOULD_RUN_DB_TESTS)`), so a local green checkmark exercises none of the isolation/idempotency/audit proofs.
- **[MEDIUM · WRAP-01] 29 canonical-response violations** (ratcheted, not fixed).

**Key mitigating fact:** the required PR gate `ci.yml` runs `TEST_WITH_DB=true` against a real Postgres, so a genuine real-DB proof tier (RBAC route test, cross-tenant read, TOCTOU concurrency) *does* execute on PRs. The false-confidence is concentrated in local runs, the 23-file quarantine, and the 97 permanently-excluded files — not "everything is mocked."

---

## 5. What is genuinely solid (verified positives)

- `withCanonicalEnforcement` server-side workspace derivation; capability layer; login/session.
- DB-backed `assertCapability` entitlement gate (fail-closed).
- Stripe signature verification (raw body, fail-closed on bad sig / missing secret) + `stripeEventId` dedup.
- Atomic `applyTaskTransition` (mutation+audit in one tx, optimistic concurrency, SoD) — the reference pattern.
- Audit **read** path (DB-backed, workspace-scoped, capability-gated, hash-chain verifiable).
- Staff proof FSM: SYSTEM actor structurally cannot final-accept; exact-hash dedup is wired.
- Owner domain spine (owner/finance et al.) persists a real diagnose→assign→track→verify loop and renders honest "no data" states.
- `prisma validate` and `tsc --noEmit` both clean.

---

## 6. Top 10 blockers (ranked)

1. **SEC-01** always-admin `resolveServerRole` (unblocks approval + hierarchy defects).
2. **SEC-02** cross-tenant `POST /api/operator` write.
3. **IDEM-01** no-op idempotency on core mutations.
4. **AUDIT-01** fail-open audit on governed mutations.
5. **OUT-01/OUT-02** fabricated outcomes + no outcome→re-eval.
6. **SEC-04** inert DB isolation backstop (no defense-in-depth).
7. **BILL-01** client-controlled `x-tier` entitlement bypass.
8. **SCHEMA-01/02/03** missing workspaceId, destructive governed cascades, entity collapse.
9. **UI-01/UI-02** blank primary dashboard + cosmetic decision inbox.
10. **TEST-02/TEST-04** quarantined security scanners + 614 inline fakes inflating the pass count.

---

## 7. Required fixes by stage

**Before ANY real owner use (single tenant):** SEC-01, IDEM-01 (on budget/finance), AUDIT-01, OUT-01/OUT-02, UI-01/UI-02, un-quarantine + fix the 14 unwrapped routes (TEST-02).

**Before controlled pilot (>1 human):** SEC-02, SEC-03, SEC-04, APPR-01, CONC-01, DEC-01, GAME-01, EVID-01, SHOCK-01, wire the 3 missing adaptive triggers.

**Before Product Hunt / public demo:** UI-01/UI-02/UI-03, STUB-01/02, AI-01 (stop shipping canned fluff), demo-data honesty.

**Before paid SaaS:** BILL-01, BILL-02, WEBHOOK-01/02, SCHEMA-01/02/03/04, APPR-02, AI-02, TEST-01/TEST-03/TEST-04, consolidate audit (AUDIT-02) and role models (SEC-06).

**Before enterprise/public scale:** full DB-level isolation (SEC-04 real enforcement), idempotency+concurrency everywhere, durable rate limiting, branch-protection verification, delete duplicate/conflicting engines.

## 8. What NOT to build yet / what to remove or consolidate

- **Do not** add new domains/features on top of a broken auth root — fix SEC-01/02 first.
- **Remove/consolidate:** the canned `recommendation/engine.ts` vs the real consulting engine (AI-01); the 5 audit mechanisms → one; the 3 role vocabularies → one; `infra/withIdempotency` vs `services/idempotency` → one; in-memory override/rate-limit/audit-trail stores → DB; the 4 unrouted mock UI shells; the 614 inline fake tests.

## 9. Required new tests / E2E / adversarial simulations

- Cross-tenant negative tests at the **service boundary** (real fetch/mutate across two seeded workspaces) for operator, decisions, evidence, findings.
- Non-admin authorization tests proving `resolveServerRole` returns a real role and denies approve/edit.
- Idempotency + concurrency tests on budget/finance/accept (duplicate key ⇒ one row; concurrent ⇒ one winner).
- Audit-atomicity test: fail `auditEvent.create` mid-mutation ⇒ mutation must roll back.
- Outcome-grounding test: flat KPIs ⇒ accuracy≈0, value=0; regressed outcome ⇒ re-evaluation fires.
- Promote route-scanner + enforcement-scanner to blocking; add owner browser E2E to the PR-to-main gate.

---

## 10. Honest final classification

| Stage | Classification |
|---|---|
| Owner private use (1 tenant, trusting) | **OWNER_MODE_PARTIAL** |
| Controlled real-business pilot | **OWNER_MODE_NOT_READY** |
| Product Hunt / public demo | **PUBLIC_DEMO_NOT_READY** |
| Paid SaaS beta | **COMMERCIALIZATION_NOT_READY** |
| Public / enterprise SaaS | **PUBLIC_SAAS_BLOCKED** |

**Final verdict:** OpsIQ is a large, real, and in places well-engineered system whose *governance guarantees* — the entire reason it exists — are the least trustworthy part of it. The authorization root is fake (`admin` for everyone), tenant isolation has no backstop, the proof/outcome/idempotency spine is partly theatrical, and the test suite's green number is inflated by 614 self-documented fakes. None of these are cosmetic; each directly enables an owner to be misled, a tenant to be crossed, a staff member to game completion, or a paying customer to lose entitlement. The build is far enough along to be dangerous precisely because it *looks* finished. Fix the six CRITICALs and the isolation backstop before a single second party — staff, tenant, or paying customer — touches it.
