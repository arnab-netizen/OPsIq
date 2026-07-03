# OpsIQ Wave 2 — REAL_OWNER_RUNTIME_LOOP Report

> Branch: `claude/real-owner-runtime-loop`. Base: `main @ 04bdb326`.
> Classification: **REAL_OWNER_RUNTIME_LOOP_READY**.
> Migration-free. No schema change, no gate weakened, no test deleted, no masking, no invented semantics.

## What this wave is (and why it is tight)

Recon of current `main` found most of the originally-scoped Wave 2 surface **already shipped and correct**
(capacity/workload write routes #78, finance CSV materialization #79, capacity/workload owner UI #80, the
delegated-task proof-loop create path + enforced completion gate #81). The genuinely-remaining work that is
**clean, migration-free, no-invented-semantics, and improves runtime usefulness / proof safety** is two
sub-slices. Everything requiring a new read model, a new field-mapping semantic, or a dead table's undefined
semantics is documented as a decision (not guessed) — see `..._DEFERRED_DECISIONS.md`.

## S1 — Owner standing-instructions write route (completes a real governed owner loop)
`recordStandingInstruction` (`owner-load.service.ts`) was complete + audited but had **no API route**; only the
eval/read side (`evaluateRequestAgainstStandingInstructions` → `resolveOwnerApproval`) was exposed, so the
resolver always saw zero instructions and every approval fell to manual owner attention.
- **Added** `POST /api/owner/standing-instructions` (`src/app/api/owner/standing-instructions/route.ts`):
  `withCanonicalEnforcement`, `requireCapabilities:[OWNER_MANAGE]`, `requireWorkspace:true`, `canonicalJson`,
  Zod-validated body; passes `actorIsOwner:true` (the established owner-manager pattern used by
  `owner/gates/opt-out`, `owner/approvals/memory`, `owner/sop-documents`). **No service change.**
- **Value**: the owner can set standing rules in-product → the resolver can auto-allow/forbid within
  owner-set boundaries (reduces owner attention load) and the `owner_workload_memory` readiness provider sees
  a non-zero `standingCount`.

## S2 — Proof-submit contract made server-authoritative (integrity / anti-gaming)
`POST /api/proof/submit` forwarded the **client-supplied** proof contract (`proofId`, `fromStatus`,
`requirement`, `existingHashes`, `actor`) straight into `submitProof`:
- **self-certification** — a client could send a permissive `requirement` (empty `requiredFields`) or claim
  an `actor.role`, defeating `validateProofSubmission` / submission authority;
- **inert duplicate detection** — `existingHashes` was never populated, so `duplicateFlagged` was always
  written `false`.
- **Added** `src/services/execution/proof-intake.service.ts` (`intakeProofSubmission`): loads the task, the
  latest submittable `Proof` + its `ProofRequirement`, and the workspace's existing file hashes from the DB,
  and derives the actor from the verified session. Only the proof artifact (`proofType`, `fields`, `fileHash`)
  comes from the client; `submittedByUserId` is forced to the verified actor.
- **Changed** `src/app/api/proof/submit/route.ts` to a thin wrapper over the service (no business logic in the
  route — CLAUDE.md hard rule). **No FSM/gate/domain change** — `submitProof`, `planProofTransition`,
  `validateProofSubmission`, `evaluateProofClearance` are untouched. Expected domain rejections
  (validation/transition/conflict) surface as an explicit `{ ok:false, reason }`; an unexpected error
  re-throws (never swallowed).
- Note: the old generic `proofSubmitHandler` remains (still unit-tested for access control) but is no longer
  wired to a route; the single production submit path is now `intakeProofSubmission`.

## Deferred (documented, not guessed) — see OPSIQ_REAL_OWNER_RUNTIME_LOOP_DEFERRED_DECISIONS.md
Non-finance CSV materialization (operations→capacity needs an invented mapping; sales/sop/marketing have no
read model → schema); manual-entry materialization (taxonomy + mapping); `WorkOrder` create semantics (dead
table); equipment↔capacity store split; employee-workload intake route + equipment GET (no consumer / low
runtime value); orphaned parsers + unrouted intake bridges (Wave 4 cleanup).

## Proof (local, Postgres 16)
- `tsc --noEmit` ✓.
- **Governance strict**: 32 matched, **0 new**. **Auth route scanner**: all routes comply.
  `lint:ratchet` **PASS** (2088 ≤ 2155 baseline; `changed_file_lint_errors: 0`).
- **New DB proofs (9 tests, all green)**:
  - S1 (`standing-instruction-write.db.test.ts`, 4): records active + workspace-scoped; eval reads it back
    (`auto_allow`/`forbidden`, other workspace `needs_approval`); cross-workspace `businessId` rejected;
    non-owner denied.
  - S2 (`proof-intake.service.db.test.ts`, 5): valid submission → `SUBMITTED`; DB-required field enforced even
    when the client omits it (server requirement is authoritative); reused workspace file hash → `duplicateFlagged`;
    foreign-workspace task not found (isolation); non-assignee denied.
- **No-regression**: 564 passed / 37 skipped (execution + routes + owner-mode suites); DB-gated tests green
  against local Postgres.

## Classification
**`REAL_OWNER_RUNTIME_LOOP_READY`** — the two remaining clean, migration-free owner-runtime gaps (orphaned
standing-instruction write; self-certifiable proof submit) are closed and DB-proven; larger items requiring a
schema/domain decision are audited and documented; no gate weakened, no test deleted, no masking.
