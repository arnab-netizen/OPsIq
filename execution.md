# OPSIQ EXECUTION CONTRACT
# NON-NEGOTIABLE BUILD, RECOVERY, MERGE, AND DEPLOYABILITY STANDARD

This file is the highest-priority implementation contract for OpsIQ.

Claude, Cursor, Copilot, or any coding agent working in this repo must obey this file over chat memory, assumptions, previous plans, or inferred intent.

No feature, phase, branch merge, refactor, schema change, UI change, engine, test, or migration is complete unless it satisfies this contract.

---

# 0. PRIME DIRECTIVE

OpsIQ must become a deterministic, tenant-safe, evidence-based Growth + Survival Operating System.

The system must help business operators:

1. understand real business condition,
2. detect survival risk,
3. identify growth opportunities,
4. select the safest highest-impact next action,
5. execute step-by-step,
6. measure outcomes,
7. learn only from verified results,
8. reduce operator confusion,
9. avoid unsafe or unaffordable advice,
10. avoid fake confidence,
11. remain auditable,
12. remain deployable after every completed stage.

The system must not become:

- a generic AI chatbot,
- a dashboard-only app,
- a recommendation toy,
- a non-deterministic advice engine,
- a branch pile-up,
- a duplicate architecture mess,
- an unverified codebase.

---

# 1. ABSOLUTE RULES

## 1.1 No back-and-forth implementation

Do not repeatedly rebuild the same module.

Before creating anything:

1. search current branch,
2. search main,
3. search all local branches,
4. detect existing implementation,
5. classify existing implementation,
6. reuse if valid,
7. repair if partial,
8. park if obsolete,
9. create new only if missing.

## 1.2 No skipped branch work

Before any new stage implementation, inspect all branches.

Required command group:

```bash
git branch --all
git status --short
git log --oneline --decorate --graph --all --max-count=80
```

For each branch, classify:

- MERGED_CONFIRMED
- USEFUL_UNMERGED
- DUPLICATE
- OBSOLETE
- CONFLICTING
- UNKNOWN_NEEDS_INSPECTION

No stage may start if any branch is UNKNOWN_NEEDS_INSPECTION.

## 1.3 No duplicate systems

Do not create a second version of any existing domain system.

The following domains must have one canonical owner each:

- Auth
- Workspace/Tenant isolation
- RBAC/Capabilities
- Idempotency
- Evidence
- Finding
- Recommendation
- Decision
- Action
- Business condition
- Financial constraint
- Owner constraint
- Capacity
- Audit
- Event
- Billing
- Entitlement
- Usage
- Public DTO
- Owner DTO
- Admin DTO

If duplicates exist, create/update `docs/CANONICAL_ARCHITECTURE.md`.

Each duplicate must be classified:

- ACTIVE_CANONICAL
- READ_MODEL_ONLY
- LEGACY_PARKED
- OBSOLETE_DO_NOT_USE
- DUPLICATE_RISK_NEEDS_FIX

## 1.4 No phase completion by file existence

A file existing does not mean the module is complete.

A module is complete only when:

1. domain contract exists,
2. schema/model exists if persistence is needed,
3. migration exists if schema changed,
4. validator exists,
5. service/engine exists,
6. API or internal caller is wired,
7. audit/event logging is wired if material,
8. permission/tenant enforcement exists,
9. tests exist,
10. tests pass,
11. build passes,
12. typecheck passes,
13. Prisma validates,
14. execution_state is updated,
15. proof summary is written.

## 1.5 No unsafe shortcuts

Never:

- bypass tests,
- comment out failing tests,
- mark broken tests as skipped unless explicitly recorded as environmental blocker,
- remove enforcement to make build green,
- weaken tenant isolation,
- weaken permission checks,
- bypass DTO redaction,
- add unaudited write paths,
- add public APIs before DTO safety exists,
- add billing features without entitlement enforcement exists.

---

# 2. EXECUTION STATE CONTROL

Maintain:

`.claude/execution_state.json`

Required structure:

```json
{
  "current_stage": "",
  "current_phase": "",
  "completed_stages": [],
  "blocked_stages": [],
  "active_branch": "",
  "main_branch": "main",
  "branch_inventory_completed": false,
  "branch_inventory_last_updated": "",
  "canonical_architecture_locked": false,
  "last_green_commit": "",
  "commands_last_run": [],
  "failing_commands": [],
  "environment_blockers": [],
  "completed_modules": [],
  "pending_modules": [],
  "parked_modules": [],
  "known_duplicate_risks": [],
  "invariants_verified": [],
  "next_required_stage": ""
}
```

Update this file after every completed stage or failed verification.

---

# 3. BRANCH RECOVERY PROTOCOL

Before new implementation, run branch recovery.

## 3.1 Branch inventory

Run:

```bash
git fetch --all --prune
git branch --all
git status --short
git log --oneline --decorate --graph --all --max-count=120
```

Create/update:

`docs/BRANCH_INVENTORY.md`

Required table:

| Branch | Last commit | Merged into main? | Unique files | Unique modules | Status | Action |
|---|---|---|---|---|---|---|

Status must be one of:

- MERGED_CONFIRMED
- USEFUL_UNMERGED
- DUPLICATE
- OBSOLETE
- CONFLICTING
- UNKNOWN_NEEDS_INSPECTION

No branch may remain UNKNOWN.

---

# 4. DEPLOYABILITY GATE

After every stage, run:

```bash
npm run build
npx tsc --noEmit
npx prisma validate
npm test
```

No stage is complete unless verification passes or blocker is formally documented.

---

# 5. SECURITY INVARIANTS

The following must never regress:

1. unauthenticated users cannot access protected routes,
2. users cannot access another workspace's data,
3. users cannot mutate another workspace's data,
4. viewers cannot perform privileged mutations,
5. public users cannot see owner/internal fields,
6. owner/admin APIs are separated from public APIs,
7. missing entitlement fails closed,
8. missing workspace context fails closed.

Required tests:

```bash
npm test -- workspace-isolation
npm test -- permission-matrix
npm test -- dto-leakage
npm test -- entitlement
```

---

# 6. CANONICAL IMPLEMENTATION ORDER

## STAGE 0 — Freeze + Build Truth
Goal:
Prove repo can run verification.

## STAGE 1 — Branch Inventory + Recovery
Goal:
Ensure no implemented work is skipped.

## STAGE 2 — Canonical Architecture Lock
Goal:
Stop duplicate systems.

## STAGE 3 — Tenant Safety Backbone
Goal:
Make SaaS data isolation non-bypassable.

## STAGE 4 — Phase 0 System Truth Contract
Goal:
Prevent generic, unsafe, fake-confident recommendations.

## STAGE 5 — Phase 1 Reality Integrity
Goal:
Make evidence reliability, sufficiency, contradiction, and confidence gates real.

## STAGE 6 — Phase 2 Reality Backbone
Goal:
Model business maturity, owner constraints, financial constraints, capacity, customer, local market, and KPI registry.

## STAGE 7 — Minimal Event + Audit Fabric
Goal:
Create canonical event/audit trail for critical state only.

## STAGE 8 — Billing + Entitlement Enforcement
Goal:
Turn billing from tables into route-level monetization enforcement.

## STAGE 9 — Survival Intelligence
Goal:
Cash runway, financial health, debt/margin pressure, survival gating.

## STAGE 10 — Business Impact + Priority Engine
Goal:
Select one best next action using deterministic priority.

Formula:

```text
priority = impact × urgency × confidence / (effort × risk × constraint_friction)
```

## STAGE 11 — Execution Reality
Goal:
Validate whether recommended action can actually be executed.

## STAGE 12 — Experiment + Outcome Validation
Goal:
Make risky growth actions test-first and measurable.

## STAGE 13 — Growth Operating Engines
Goal:
Revenue, pricing, retention, acquisition, unit economics, sales pipeline, offer, channel engines.

## STAGE 14 — Guided Operating System
Goal:
Daily action queue, weekly review, follow-up loop, decision history.

## STAGE 15 — Owner Mode Full OS
Goal:
Power-user/private owner surface.

## STAGE 16 — Public SMB Shell
Goal:
Simple sellable SMB product using safe DTOs and entitlements.

## STAGE 17 — Enterprise Hardening
Goal:
CI, deployment, observability, exports, backup/restore, rate limits, security headers.

---

# 7. TEST-SKIPPING BAN

Claude must not skip, delete, rename, or weaken tests to make verification pass.

Forbidden actions:

- converting failing tests to `.skip`,
- moving failing tests into ignored folders,
- deleting failing assertions,
- removing test files from config.

---

# 8. TENANT-SCOPING HARD RULE

Every tenant-owned model must either:

1. have direct `workspaceId`, or
2. be explicitly classified as child-scoped with enforced parent workspace lookup in every service and test.

Fetch-then-filter is forbidden.

---

# 9. DTO LEAKAGE BAN

Raw Prisma models must not be returned directly from public or owner APIs unless explicitly wrapped by a DTO serializer.

Required DTO categories:

- OwnerDTO
- PublicDTO
- AdminDTO
- InternalDTO

---

# 10. ONE-STAGE STOP RULE

Claude must stop after completing one stage.

Claude must not continue to the next stage unless explicitly prompted.

Final response must end with:

```text
NEXT_REQUIRED_STAGE: <stage name>
```

---

# 11. FINAL NON-NEGOTIABLE STANDARD

Nothing is complete unless:

1. existing branch work was checked,
2. duplicate risk was checked,
3. canonical owner was identified,
4. implementation is wired,
5. tenant safety is enforced,
6. permissions are enforced,
7. DTO safety is enforced where relevant,
8. audit/event is enforced where relevant,
9. entitlement is enforced where relevant,
10. tests exist,
11. tests pass,
12. build passes,
13. typecheck passes,
14. Prisma validates,
15. docs are updated,
16. execution_state is updated,
17. deployability verdict is explicit.

If any item is missing, the stage is not complete.


---

# NON-NEGOTIABLE COMPLETION CONTRACT

This section exists because previous work repeatedly produced partial implementations that looked complete but were not runtime-complete.

## A. ACTIVE requires runtime proof

A system may be called ACTIVE only when all are proven:

1. It is called from a real production/runtime path.
2. Its input source is identified.
3. Its output consumer is identified.
4. Its failure behavior is fail-closed.
5. Its tenant/workspace guard is enforced before state access.
6. Its audit/event behavior is proven where material.
7. Its replay/projection behavior is defined where event-driven.
8. It has at least one integration or route/service-level test.
9. It has negative-path tests.
10. It has no duplicate competing implementation.

Unit tests alone are insufficient.

Static code inspection alone is insufficient.

Compilation alone is insufficient.

## B. Runtime Proof block required for every ACTIVE system

Every ACTIVE engine/service must have a proof block in the implementation report:

```text
Runtime Proof:
- System:
- Status: ACTIVE | PARKED | REJECTED
- Caller file:
- Caller function:
- Trigger:
- Input source:
- Output consumer:
- Workspace enforcement:
- Permission/capability enforcement:
- Audit/event emitted:
- Replay/projection behavior:
- Failure behavior:
- Tests proving path:
- Commands run:
- Result:
```

If any field is unknown, status is PARKED.

## C. Phase Completion Proof required

Every phase completion report must include:

```text
Phase Completion Proof:
- Phase:
- Required objects mapped:
- Required objects implemented:
- Required objects intentionally deferred:
- Existing systems reused:
- Existing systems upgraded:
- Duplicates removed:
- Runtime wiring proofs:
- Tests added:
- Tests run:
- Static gates:
- DB gates:
- CI status:
- Environmental blockers:
- Remaining risks:
- Status:
```

Allowed status:

- COMPLETE_RUNTIME_VERIFIED
- COMPLETE_STATIC_VERIFIED
- PARTIAL_DB_BLOCKED
- PARTIAL_ENV_BLOCKED
- PARTIAL_CODE_BLOCKED
- PARKED

---

# EXECUTION.MD IMMUTABILITY AND CONTRACT DRIFT CONTROL

## Rule

`execution.md` is the governing contract. It must not drift silently.

## Required controls

1. Any change to execution.md must be intentional.
2. Any change must include a version bump.
3. Any change must include a short amendment reason.
4. CI must detect unintended execution.md drift where possible.
5. Claude must read the current execution.md from repo, not rely on chat memory.
6. Claude must not replace execution.md with a shorter version unless explicitly instructed.
7. Claude must not delete roadmap phases, gate rules, proof rules, or safety rules.
8. Any branch that changes execution.md must state whether it changes execution rules or only documentation.
9. Main must always contain the latest accepted execution.md.
10. If a PR excludes execution.md hardening, the missing hardening must be backported separately.

## Contract Drift Check

Before claiming a branch ready:

```bash
git diff -- execution.md
grep -n "EXECUTION.MD v" execution.md
grep -n "NON-NEGOTIABLE COMPLETION CONTRACT" execution.md
grep -n "PHASE 0 — SYSTEM TRUTH CONTRACT" execution.md
grep -n "PHASE 13 — ENTERPRISE HARDENING" execution.md
grep -n "REQUIRED END-OF-PHASE REPORT" execution.md
```

Fail if:

- phase list is missing,
- proof rules are missing,
- gate rules are missing,
- branch rules are missing,
- security invariants are missing,
- runtime proof format is missing,
- completion contract is missing.

---

# CI ENFORCEMENT CONTRACT

CI must protect main from false green states.

## Required CI gate categories

1. Branch/status gate.
2. Dependency install gate.
3. Prisma schema validation.
4. Migration deploy or replay gate when database is available.
5. TypeScript strict compilation.
6. Build gate.
7. Lint gate.
8. Unit test gate.
9. Integration test gate when dependencies exist.
10. Tenant isolation gate.
11. Permission/capability matrix gate.
12. DTO leakage gate.
13. Audit event gate.
14. Event append-only gate.
15. Replay side-effect suppression gate.
16. Parked-system unwired gate.
17. execution.md honesty gate.
18. Quarantined test exclusion gate.
19. Readiness summary gate.

## CI result classification

- GREEN: all required gates pass.
- STATIC_GREEN_DB_UNVERIFIED: build/type/schema pass, DB unavailable.
- ENV_BLOCKED: missing external service/secret/database only.
- CODE_BLOCKED: TypeScript/build/lint/test failure.
- MIGRATION_BLOCKED: migration ordering/schema drift failure.
- WORKFLOW_BLOCKED: CI script/check itself is broken.
- CREDENTIAL_BLOCKED: git/remote/secret authorization failure.

## CI failure response

First failing gate owns the next fix.

Do not fix later gates until the first failing gate is resolved or classified as environmental.

---

# CANONICAL CALLER REDIRECTION RULE

When replacing, parking, or consolidating engines, callers must be redirected deliberately.

Before deleting or parking any engine:

1. Search all imports.
2. Search dynamic imports.
3. Search string references if CI uses grep.
4. Search tests.
5. Search routes.
6. Search jobs.
7. Search scripts.
8. Search docs only after code references are fixed.

For each caller:

- redirect to canonical service,
- fail closed,
- or explicitly park the caller.

Do not leave orphaned callers.

Do not leave runtime imports to PARKED systems.

Do not keep comments that trip CI grep gates if the gate is string-based.

---

# ARCHITECTURE REGRESSION LOCK

The following regressions are forbidden:

1. Reintroducing header-based fake auth as authoritative identity.
2. Reintroducing workspace from request body as trusted tenant source.
3. Reintroducing fetch-then-filter tenancy.
4. Reintroducing unscoped Prisma queries.
5. Reintroducing recommendation creation without truth contract validation.
6. Reintroducing decision/action creation without audit.
7. Reintroducing material state mutation without idempotency where applicable.
8. Reintroducing replay that emits side effects.
9. Reintroducing public DTOs with owner/internal fields.
10. Reintroducing AI direct canonical mutation.
11. Reintroducing migration order that references tables before creation.
12. Reintroducing readiness scripts with contradictory verdict and exit code.
13. Reintroducing duplicate event/replay/projection engines without classification.
14. Reintroducing placeholder tests into active CI scope.
15. Reintroducing hardcoded tenant/workspace IDs except in tests.

Every future PR must be reviewed against this list.

---

# FULL-PROOF VERIFICATION COMMAND SET

When local machine/database is available, run:

```bash
npm ci
npx prisma validate
npx prisma generate
npx tsc --noEmit
npm run build
npm test
```

When PostgreSQL is available, also run:

```bash
npx prisma migrate reset --force
npx prisma migrate deploy
npm run test:db
npm run test:mvp
```

When scripts exist, also run:

```bash
bash scripts/mvp-readiness-check.sh
bash scripts/audit-migration-replay.sh
```

If any command does not exist, report:

```text
MISSING_GATE:
- command:
- expected purpose:
- safe to create now: yes/no
- reason:
```

Do not claim "all gates passed" if a gate does not exist.

---

# STATE MACHINE ENFORCEMENT RULE

Any domain object with lifecycle must define legal transitions.

Required:

- initial state,
- allowed transitions,
- forbidden transitions,
- actor/capability required,
- event emitted,
- audit emitted,
- idempotency behavior,
- stale-version behavior,
- rollback/compensation if applicable.

Applies to:

- Recommendation
- Decision
- Action
- Experiment
- Outcome
- Subscription
- WorkspaceMembership
- Notification
- ExportPacket
- Job
- AIProposal

No direct status update may bypass state machine rules once a state machine exists.

---

# FAILURE-MODE TESTING RULE

Every critical system must include failure-mode tests.

Required failure modes:

1. missing workspaceId,
2. mismatched workspaceId,
3. unauthorized actor,
4. missing capability,
5. stale version,
6. duplicate idempotency key,
7. missing evidence,
8. contradictory evidence,
9. stale projection,
10. replay corruption,
11. migration missing referenced table,
12. external service unavailable,
13. quota exhausted,
14. export redaction failure,
15. notification duplicate suppression.

A happy-path test without negative tests is not enough.

---

# COMPLEXITY AND PERFORMANCE GUARDRAIL

OPSIQ must remain usable by a non-technical operator.

Internal sophistication is allowed only if externally compressed.

## Performance controls

- Tier 0 must never wait for Tier 2 analysis.
- Projection rebuilds must not block core actions.
- Replay must have boundaries.
- Snapshots must have cadence.
- Causal graph depth max is 5.
- Expensive recompute must be queued.
- Per-workspace resource budgets must apply.
- Background failure must degrade mode, not corrupt canonical state.

## Complexity controls

Reject or park any system that:

- adds a new concept without runtime caller,
- duplicates an existing engine,
- requires users to understand internals,
- increases onboarding burden without a 10-minute value path,
- adds dashboards without action compression,
- creates ambiguous competing recommendations,
- adds AI output without truth gating.

---

# PR #4 / PHASE 0–3 RECOVERY RECORD

This section preserves the operational history from the recovery work so it is not lost again.

## Known recovery issues encountered

1. Git push failed with HTTP 403 because proxy credentials had read access but not write access.
2. GitHub web/mobile was used as an alternative.
3. PR #4 / recovery branch contained some valid fixes and some polluted conflict-resolution attempts.
4. Migration deploy failed when a migration referenced `workspaces` before the table existed.
5. Readiness script had contradictory exit-code semantics.
6. Gate 9 failed because raw grep detected `EventReplayEngine` in production files.
7. Manual conflict resolution on `recommendation.ts` created repeated conflicts and TypeScript errors.
8. A later clean recovery branch recovered only valid changes.
9. The clean recovery branch was merged to main.
10. The clean recovery branch did not include the latest execution.md hardening and required separate backport.

## Valid recovered changes from clean recovery

The following categories are valid and should remain unless later proof contradicts them:

1. Workspace foundation migration before FK references.
2. Phase 0–3 schema alignment after workspace foundation.
3. MVP readiness script exit-code correction.
4. TypeScript strict-mode fixes in recommendation-related files.
5. Recommendation truth contract parameter fix.

## Excluded polluted changes

The following must not be reintroduced blindly:

1. Hybrid conflict-marker code.
2. Blind "accept both changes" output.
3. Broken `recommendation.ts` conflict-resolution attempts.
4. Runtime-isolation edits that only satisfy grep by breaking functionality.
5. `<logger.info>` malformed syntax.
6. Duplicate interface declarations.
7. `any` parameters where strict mode requires explicit typing.
8. Direct `EventReplayEngine` references in production files if Gate 9 still forbids them.

## Current safe interpretation

If latest main passes static gates after the clean recovery merge:

```text
MAIN_STATUS = STATIC_GREEN
DB_STATUS = DB_UNVERIFIED unless migrate deploy/test DB passes
PHASE_0_3_STATUS = PARTIAL_STATIC_VERIFIED
```

Do not claim `PHASE_0_3_COMPLETE_RUNTIME_VERIFIED` until database-backed tests pass.

---

# GITHUB MOBILE / WEB UI OPERATING PROCEDURE

Use this when Claude cannot push due to credential or proxy failure.

## File edit procedure

1. Open repo on GitHub mobile browser.
2. Confirm branch target.
3. Open exact file path.
4. Edit file.
5. Replace full file only when instructed.
6. Commit one logical file at a time.
7. Use clear commit message.
8. Wait for checks.
9. Do not merge if checks fail, unless failure is formally classified environmental and risk is accepted.

## Conflict resolution procedure

If GitHub shows conflict markers:

1. Do not click random accept options.
2. If only one conflict file exists and a full corrected file is available, replace the entire file.
3. If full corrected file is not available, stop and generate complete file first.
4. After replacement, search within file for:
   - `<<<<<<<`
   - `=======`
   - `>>>>>>>`
5. Mark as resolved only after markers are absent.
6. Commit resolution.
7. Re-run CI.

## Branch choice rule

- Fix PR branch if the PR is still open and clean.
- Fix main only for:
  - documentation-only backport,
  - emergency hotfix,
  - already-merged accidental issue.
- Do not paste the same file into both main and branch unless explicitly required by merge strategy.

---

# DATABASE RECOVERY AND MIGRATION ORDERING CONTRACT

## Workspace foundation

If `workspaces` is referenced by FK migrations, the `workspaces` table must exist in an earlier migration.

Minimum foundation migration must ensure:

```sql
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE TABLE IF NOT EXISTS "workspaces" (...);
CREATE TABLE IF NOT EXISTS "workspace_memberships" (...);
CREATE UNIQUE INDEX IF NOT EXISTS "workspaces_slug_key" ON "workspaces"("slug");
```

## FK alignment migration

Any later migration may add:

- recommendation workspace columns,
- engagement workspace columns,
- snapshot_data table,
- foreign keys to workspaces,
- foreign keys to users,

only after foundation table exists.

## Migration verification

Required:

```bash
npx prisma validate
npx prisma migrate deploy
```

When possible:

```bash
npx prisma migrate reset --force
```

If deploy fails with `relation "workspaces" does not exist`, do not patch dependent migration first. Fix migration order.

---

# READINESS SCRIPT CONTRACT

`scripts/mvp-readiness-check.sh` must obey:

1. Static failures exit non-zero.
2. DB migration failures exit non-zero only when DB is configured and reachable.
3. Missing DB without DATABASE_URL may produce STATIC_READY, not DB_READY.
4. DB_READY requires successful connection and migration deploy.
5. The printed verdict and exit code must agree.
6. Warnings must not increment failure count unless they invalidate declared readiness.
7. CI summary must not report DB_READY if DB gates did not run.

---

# EVENT REPLAY / GATE 9 CONTRACT

## Current Status: EventReplayEngine is PARKED (Phase 3)

`EventReplayEngine` exists in codebase but is PARKED (not wired into production paths):
- Imported by `ProjectionRebuildEngine` (internal use only)
- Imported by `SnapshotEngine` (internal use only)
- NOT called from critical mutation paths (recommendation.ts, action.ts, evidence.ts)

Gate 9 applies: EventReplayEngine must remain PARKED until production wiring is implemented.

## Legacy Rule (if EventReplayEngine were PARKED):

If in future a system is PARKED for active runtime:

1. It must not be directly imported by production services.
2. It must not appear in production code if CI raw grep forbids the string.
3. Tests may reference it if excluded by CI filter.
4. Runtime callers must either:
   - use canonical event emitter/projection services,
   - fail closed,
   - or be classified PARKED.
5. Comments containing the exact forbidden symbol may fail grep and must be avoided.
6. Dynamic imports still count if grep checks raw text.
7. Do not break business functionality merely to remove a string.
8. Prefer improving the gate from raw grep to import-aware detection when feasible.

---

# RECOMMENDATION SERVICE STABILITY CONTRACT

`src/services/recommendation.ts` is high-risk because it combines:

- recommendation creation,
- truth/evidence logic,
- KPI assessment,
- event emission,
- audit trail,
- state verification,
- scoring,
- intervention conversion,
- access control.

Rules:

1. Avoid broad manual conflict resolution.
2. Avoid duplicate interface declarations.
3. Avoid implicit `any`.
4. Avoid stale references to removed fields.
5. Avoid direct references to parked replay systems if Gate 9 forbids them.
6. Keep recommendation creation idempotent.
7. Keep audit/event emission on material creation/update.
8. Keep workspace scoping on all queries.
9. Keep access check before engagement recommendation reads.
10. Keep approval fail-closed when verification fails.
11. If replay verification is unavailable, approval must not silently become unsafe.
12. If audit trail replay is unavailable, fallback to canonical events only when tenant-scoped.

---

# VALIDATION CONTRACTS DIRECTORY RULE

Validation contracts under `src/services/validation-contracts/` must:

- have explicit parameter types,
- avoid implicit any,
- avoid importing runtime-only heavy systems unless needed,
- fail closed,
- be covered by tests where active,
- not duplicate rules already present in canonical truth contracts.

---

# NEXT STEP AFTER MAIN STATIC GREEN

Once main is static green:

1. Do not keep repairing obsolete failed PR checks.
2. Confirm whether failing checks belong to an old PR commit or latest main.
3. If latest main is green, close obsolete PRs.
4. If latest main DB gates are unverified, prioritize DB-backed validation when computer/internet/database access is available.
5. If DB is unavailable, continue with backend slices that do not add risky schema drift.
6. Next phase work must start from latest main in a new branch.

---

# MONETIZATION-FIRST PRIORITY RULE

The build objective is not theoretical completeness. The objective is fastest path to monetizable, enterprise-credible real use.

When choosing next work, prioritize in order:

1. Main stability.
2. Auth/RBAC/tenant isolation.
3. Billing/entitlement/quota enforcement.
4. Onboarding to first value.
5. Business Impact Engine / Decision Confidence / Financial Normalization.
6. Exportable proof and audit trail.
7. Admin/support controls.
8. Owner Mode value surface.
9. Public SMB simplified extraction.

Reject work that does not move toward real adoption, revenue, or enterprise buyer trust.

---

# HOSTILE AUDIT MODE REQUIREMENT

Claude must periodically audit as a hostile enterprise buyer and hostile operator.

Audit questions:

1. Would a skeptical buyer trust this output enough to pay?
2. What proof would they demand?
3. What could leak tenant data?
4. What could produce fake confidence?
5. What would fail under low bandwidth/mobile use?
6. What would break under partial DB/service outage?
7. What would make a user churn in week one?
8. What would make legal/security reject it?
9. What is the smallest fix that increases monetizable trust?

---

# END OF EXECUTION.MD v3.3-HARDENED