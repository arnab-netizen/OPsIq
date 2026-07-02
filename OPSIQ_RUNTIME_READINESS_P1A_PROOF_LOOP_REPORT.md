# OpsIQ Runtime-Readiness — P1-A Proof-Loop Enforcement Report

> First P1 slice. Closes blocker **B5**: the delegated-task / proof loop was production-inert — nothing ever CREATED a
> delegated task or a proof requirement, so `proofRequirementId` was never set, the completion gate could never demand
> proof, and `POST /api/proof/submit` returned "Task not found" for every real user. This adds the missing **create
> path** (owner/manager route → service) that writes the task + proof requirement + initial proof and wires
> `proofRequirementId`, so the EXISTING, proven FSM (`submitProof → reviewProof → completeTask`) actually enforces
> proof. No FSM change, no gate weakened, no new engine. One slice per PR.

## Branch & base
- Branch: `claude/runtime-readiness-p1a-proof-loop`
- Base HEAD: `0dbdc9d6` (main; after P0-A #78 + P0-B #79 + P0-C #80 merged).

## The gap (B5)
- `completeTask` gates on `row.proofRequirementId != null` and refuses to complete unless a fresh `ACCEPTED` proof
  clears (`task-completion.service.ts`). Sound gate.
- `submitProof` / `reviewProof` operate on a pre-existing `Proof` row (`proof.service.ts`). Sound FSM.
- **But nothing created any of those rows.** No route, service, or UI created a `DelegatedTask`, `ProofRequirement`, or
  `Proof`. So in production: every task had `proofRequirementId = null` → the gate never fired → staff could mark work
  "done" with zero evidence; and any real proof-submit hit a non-existent proof → "Task not found". The anti-gaming
  corpus was guarding a door that was never installed.

## What was implemented
- **Service** (`src/services/execution/task-assignment.service.ts`, NEW): `assignDelegatedTask(input, injected?)`.
  Creates the `DelegatedTask` (`PROOF_REQUIRED` when proof is demanded, else `ASSIGNED`; `createdByUserId = actorId`).
  When `requireProof` is present, in the **same `$transaction`** it creates the `ProofRequirement` (wired to the task)
  and an initial `Proof` at `PENDING_SUBMISSION`, then sets `task.proofRequirementId` so the completion gate fires.
  Emits `AUDIT_EVENTS.TASK_ASSIGNED`. Workspace-scoped. DI-friendly (`injected` deps) but defaults to the live Prisma
  client. Returns `{ taskId, workspaceId, status, proofRequirementId, proofId }`.
- **Route** (`src/app/api/owner/tasks/route.ts`, NEW): `POST /api/owner/tasks` under
  `withCanonicalEnforcement(..., { requireCapabilities: [OWNER_MANAGE], requireWorkspace: true })`. Zod-validated
  (`title`, optional `description`/`assignedUserId`(uuid)/`assignedRole`/`dueAt`(datetime), optional `requireProof`:
  `proofType` + optional `requiredFields`/`riskLevel`/`reviewerRole`/`ownerOverrideAllowed`). No transition/gate logic
  in the route — it only writes via the service; the proven `completeTask` FSM enforces proof.
- **Stale-comment fix** (`src/services/execution/proof.service.ts`): removed the false
  `MIGRATION_LANE_PENDING` note (the Proof/ProofRequirement tables are migrated and now exercised end-to-end); replaced
  with an accurate note pointing at the new DB test.

## Files changed
- NEW `src/services/execution/task-assignment.service.ts`
- NEW `src/app/api/owner/tasks/route.ts`
- NEW `src/__tests__/api/owner/tasks/task-assignment.db.test.ts`
- CHANGED `src/services/execution/proof.service.ts` (remove stale `MIGRATION_LANE_PENDING` comment)
- NEW `OPSIQ_RUNTIME_READINESS_P1A_PROOF_LOOP_REPORT.md`

## DB / migration changes
**None.** Uses the already-migrated `DelegatedTask`, `ProofRequirement`, `Proof` tables.

## API changes
- **NEW** `POST /api/owner/tasks` (OWNER_MANAGE, workspace-required) — assign a delegated task, optionally requiring
  proof. This is the create path that was missing.

## Tests / checks run (local, Postgres :5433, `TEST_WITH_DB=true`)
- **NEW DB test** `src/__tests__/api/owner/tasks/task-assignment.db.test.ts` — **6/6 pass**:
  1. assigning with a proof requirement wires `proofRequirementId` + a `PENDING_SUBMISSION` `Proof`;
  2. **B5 fix**: `completeTask` is BLOCKED (`TaskCompletionBlockedError`) while proof is required and not accepted;
  3. the assignee can `submitProof` against the created task (no more "Task not found") → `SUBMITTED`;
  4. the loop CLOSES: `submit → AI_PRECHECK_PASSED → ACCEPTED → completeTask` → `APPROVED_COMPLETE`;
  5. a task assigned WITHOUT a proof requirement completes freely (gate does not over-block);
  6. workspace isolation: completing under another workspace → `TaskNotFoundError`.
- `tsc --noEmit` ✓ · eslint (all changed files) 0/0 ✓ · `lint:ratchet` **PASS** (2155 = 2155 errors; warnings 1263→1261).
- No-regression: `src/__tests__/services/execution` + `src/__tests__/domain/execution` → **508/508**;
  `src/__tests__/api` + `src/__tests__/services/owner-mode` → **1521/1521**.

## Honest scope note (not overclaimed)
- This closes the **create-path** half of B5 so the proof gate is live and provable end-to-end. It is a governed
  server route + service + DB proof — **not** a full task-management UI. Owner/manager task assignment through the app
  UI and the assignee's in-app submit surface are the natural next slices (P1-B), tracked, not silently assumed done.
- No FSM/gate logic changed; the existing `completeTask` / `submitProof` / `reviewProof` remain the single source of
  transition truth. No duplicate engine, no autonomy, no gate weakened.

## Classification
**`P1_PROOF_LOOP_ENFORCED`** (DB-proven): a real task + proof requirement can now be created through a governed,
authorized, workspace-scoped path; the completion gate demonstrably blocks unproven work and clears only on an accepted
proof; the full submit→review→accept→complete loop closes; no-proof tasks are unaffected. Browser proof of the owner
assignment UI is deferred to P1-B (no UI shipped in this slice).

## Merge recommendation
Open PR; drive CI green (unit + DB lanes) before merge. This slice ships no browser spec, so there is no new
`owner-pilot-e2e` surface to observe. After merge, next is **P2 (B3 quantified upside / M3 hardcoded margin
constants)**. Public SaaS / billing / launch / integrations remain out of scope and blocked.
