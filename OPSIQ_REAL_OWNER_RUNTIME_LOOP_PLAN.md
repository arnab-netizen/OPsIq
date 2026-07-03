# OpsIQ Wave 2 — REAL_OWNER_RUNTIME_LOOP Plan

> Branch: `claude/real-owner-runtime-loop`. Base: `main @ 04bdb326` (Wave 1 merged).
> Fast-track batched wave. Plan-first: this doc is committed before any implementation.
> Migration-free. No schema change. No invented product semantics. No gate weakened. No masking.

## Why this wave is narrower than its original scope

Recon of current `main` (PRs #78–#97 all present) found that most of the originally-listed
Wave 2 surface **already shipped and is correct**:

- **#78 (P0-A)** — capacity + owner-workload **write routes + services** (`OwnerCapacitySnapshot`,
  `OwnerWorkloadSnapshot`); canonical, id-supplied, workspace/business-scoped. Not broken.
- **#79 (P0-B)** — CSV intake **materialization** into read models — **finance only** (honest `0` for others).
- **#80 (P0-C)** — owner UI + browser proof for capacity/workload ingestion.
- **#81 (P1-A)** — delegated-task proof-loop **create** path (task + `ProofRequirement` +
  `PENDING_SUBMISSION` `Proof`, wiring `proofRequirementId`); the completion gate (`completeTask`)
  reads DB proof and is enforced server-side.

So the proof loop is already *wired* and the capacity/workload write paths already exist. What remains
that is **clean, migration-free, and genuinely improves runtime usefulness / proof safety** is a tight set.
Everything requiring a new read model, a new field-mapping semantic, or a dead-table's undefined
semantics is **documented as a decision** (see `OPSIQ_REAL_OWNER_RUNTIME_LOOP_DEFERRED_DECISIONS.md`),
not guessed — consistent with Wave 1's discipline.

## Root facts (verified against schema + code)

- `OwnerStandingInstruction` — `workspaceId` column, `id @default(gen_random_uuid())`. Service
  `recordStandingInstruction` (`owner-load.service.ts:65`) is **complete and DI-ready** but has **no write
  API route** — the eval/read side (`evaluateRequestAgainstStandingInstructions` → `resolveOwnerApproval`)
  is exposed, the write side is orphaned. Owners cannot seed standing rules through the product.
- Proof models (`Proof`, `ProofRequirement`, `DelegatedTask`) — `id @db.Uuid` with **no DB default**
  (creates supply `id`; #81 already does). `POST /api/proof/submit` loads only the task, then forwards the
  **client-supplied** `command` (`proofId`, `fromStatus`, `requirement`, `existingHashes`, `actor`) straight
  into `submitProof`. Consequences:
  - **Self-certification** — a client can send a permissive `requirement` (empty `requiredFields`) or claim
    `actor.role`, defeating `validateProofSubmission` / submission authority.
  - **Inert duplicate detection** — `existingHashes` is never populated, so `duplicateFlagged` is always
    written `false`; the anti-gaming duplicate guard never bites at submit time.
  The `updateMany` guard on `{id, workspaceId, status: fromStatus}` keeps it workspace/state-safe, but the
  proof *contract* is not server-authoritative.

## Sub-slices (each a commit with local targeted tests; all migration-free)

### S1 — Owner standing-instructions write route (completes a real governed owner loop)
- **Add** `POST /api/owner/standing-instructions` (`src/app/api/owner/standing-instructions/route.ts`):
  `withCanonicalEnforcement`, `requireCapabilities: [OWNER_MANAGE]`, `requireWorkspace: true`,
  `canonicalJson`, Zod-validated body (`scope`, `allowedActionTypes`, `forbiddenActionTypes`, `maxAmount?`,
  `riskClass`, `validUntil?`, `businessId?`). Calls `recordStandingInstruction` with server-derived
  `workspaceId`/`actorId` and `actorIsOwner: true` (same pattern as `owner/gates/opt-out`,
  `owner/approvals/memory`, `owner/sop-documents` — OWNER_MANAGE ⇒ owner-manager).
- **No service change** — the write path already exists and is audited.
- **Value**: the owner can set standing instructions in-product → `resolveOwnerApproval` can auto-resolve
  within owner-set boundaries (reduces owner attention load) and the `owner_workload_memory` readiness
  provider sees a non-zero `standingCount`. Directly improves decision quality + reduces owner workload.

### S2 — Proof-submit authoritative server-side loading (closes self-certification + inert dup-detection)
- **Change** `src/app/api/proof/submit/route.ts` to build the `SubmitProofCommand` **server-side**:
  1. Load the latest submittable `Proof` for the task, workspace-scoped
     (`status ∈ {PENDING_SUBMISSION, RESUBMISSION_REQUIRED}`, newest by `createdAt`) → authoritative
     `proofId` + `fromStatus` + `proofRequirementId`. None found → `{ ok:false, reason }` (no 500).
  2. Load that `ProofRequirement` → authoritative `requirement` (`proofType`, `requiredFields`, `riskLevel`).
  3. Load workspace `existingHashes` = fileHashes of all other proofs in the workspace with a non-null hash →
     real duplicate detection.
  4. Derive `actor` server-side: `role: EMPLOYEE`, `isAssignee = task.assignedUserId === actorId` (this route
     is the employee-submit surface; on-behalf manager submit is a documented deferral, not silently enabled).
  5. Take **only** `submission` (`proofType`, `fields`, `fileHash`) from the client; force
     `submittedByUserId = verified actorId`.
- Only the actual proof artifact/fields come from the client; the proof *contract* is DB-authoritative.
- **No FSM/gate/domain change** — `submitProof`, `planProofTransition`, `validateProofSubmission`,
  `evaluateProofClearance` are untouched. This is purely stopping the route from trusting client input.

## Deferred (documented, not guessed) — see OPSIQ_REAL_OWNER_RUNTIME_LOOP_DEFERRED_DECISIONS.md
- Non-finance CSV materialization (`operations→OwnerCapacitySnapshot` needs an invented resource/utilization
  mapping; `sales`/`sop`/`marketing` have **no** snapshot read model → schema) — DOMAIN/SCHEMA decision.
- Manual-entry materialization (20 categories dead-end at `OwnerDataIntake`; taxonomy mismatch vs the
  materializer's `finance`) — DOMAIN decision.
- `WorkOrder` create path (model/table exist, `workOrderId` never populated, no defined semantics) — DOMAIN.
- Equipment↔capacity store split (`POST /api/owner/equipment` writes `OwnerEquipment` but the
  `equipment_capacity` readiness gate reads `OwnerCapacitySnapshot`) — data-model decision.
- Employee-workload intake route + equipment GET/list — no readiness consumer / read-back only (low runtime
  value; would add surface without improving decision quality) — deferred pending a consumer decision.
- Orphaned CSV parsers + unrouted `persistFileIntake` / `submitStructuredImport` / `import-persistence` /
  `intake-adapter` — cleanup/routing (Wave 4 governance-hardening territory).

## Required Wave 2 tests (local, Postgres 16; `describe.skipIf(!SHOULD_RUN_DB_TESTS)`)
S1:
1. Route/service create persists an active, workspace-scoped standing instruction.
2. `evaluateRequestAgainstStandingInstructions` reads the written instruction back (loop closes).
3. A `businessId` from another workspace is rejected (cross-workspace isolation).
4. A non-owner (`actorIsOwner:false` at the service) is denied (`StandingInstructionUnauthorizedError`).

S2:
5. A valid submission (server-loaded requirement satisfied) transitions the real proof
   `PENDING_SUBMISSION → SUBMITTED`.
6. A client-supplied **permissive** requirement is **ignored** — the server-loaded requirement's missing
   required field still rejects the submission (`ProofValidationError`).
7. A `fileHash` already present on another workspace proof sets `duplicateFlagged = true` (dup-detection live).
8. A task in another workspace 404s (isolation); a non-assignee employee is denied submission authority.

## Classification gate
- Open PR only at ≥ `PROOF_LOOP_WIRED` (S2 landed + DB-proven). Prefer `REAL_OWNER_RUNTIME_LOOP_READY`
  (S1 + S2 landed, DB-proven, deferred set documented, no-regression + gates green).

## Trigger map / adaptive note
Neither sub-slice adds or weakens a governed re-evaluation trigger. S1 makes owner standing instructions
reachable (an input to approval resolution, not a state transition). S2 hardens an existing write path's
input authority without changing proof/task state semantics. No `BusinessConditionProfile` / `InterventionMode`
/ `InterventionPhase` recomputation path is altered.
