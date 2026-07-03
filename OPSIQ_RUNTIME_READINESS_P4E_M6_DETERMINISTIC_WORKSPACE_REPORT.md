# OpsIQ Runtime-Readiness — P4-E (M6) Deterministic Multi-Workspace Resolution Report

> Fixes **M6**: a user with more than one active `WorkspaceMembership` was resolved to a
> **non-deterministic** workspace, and — worse — the canonical wrapper's per-request workspace derivation
> could disagree with the workspace `getPolicyContext` resolved the user's capabilities for. All membership
> resolvers now order identically, so resolution is deterministic and cross-surface consistent. No schema
> change; no gate weakened; no test deleted.

## The gap (M6)
`getPolicyContext` (`services/auth.ts`) already resolved the "current" workspace with
`orderBy: { addedAt: "asc" }` (earliest membership). But the **canonical route wrapper's** workspace
derivation (`canonical-route-enforcement.ts` STEP 1.5) used `findFirst({ where: { userId, isActive: true } })`
with **no order**, and `services/workspace/activation-context.ts` likewise. For a multi-membership user:
- the wrapper could scope a request to a **different** workspace than the one whose roles/capabilities were
  loaded into the policy context — a real authorization-consistency hazard, not just cosmetic non-determinism;
- repeated requests could resolve to different workspaces.

## The fix (deterministic + consistent order at every resolver)
All three membership resolvers now use the **identical** order
`orderBy: [{ addedAt: "asc" }, { workspaceId: "asc" }]` — earliest-joined membership, with `workspaceId` as a
stable tiebreaker for same-`addedAt` ties:
- `src/lib/canonical-route-enforcement.ts` (STEP 1.5 — the per-request authority): added the order.
- `src/services/auth.ts` (`getPolicyContext`): extended its existing `addedAt` order with the `workspaceId`
  tiebreaker so a same-instant tie resolves to the same workspace the wrapper picks.
- `src/services/workspace/activation-context.ts` (`requireWorkspaceContext`): added the order.

The audit's M6 scope is exactly "deterministic orderBy now; workspace switcher later" — this is the
deterministic-order half; no switcher/UI is introduced.

## Files changed
- CHANGED `src/lib/canonical-route-enforcement.ts` (STEP 1.5 orderBy)
- CHANGED `src/services/auth.ts` (getPolicyContext orderBy tiebreaker)
- CHANGED `src/services/workspace/activation-context.ts` (requireWorkspaceContext orderBy)
- CHANGED `.claude/governance-baseline.json` (re-keyed 4 frozen findings shifted +6 by the wrapper insertion: 351→357, 675→681, 692→698, 758→764)
- NEW `src/__tests__/workspace/deterministic-workspace-resolution.db.test.ts` (2 DB proofs)
- NEW `OPSIQ_RUNTIME_READINESS_P4E_M6_DETERMINISTIC_WORKSPACE_REPORT.md`

## DB / migration changes
**None.** Pure query-order determinism. **API:** for a single-workspace user (the common case) behaviour is
unchanged. For a multi-workspace user the resolved workspace is now the earliest-joined one, deterministically,
and consistent between the wrapper and the policy context. **UI:** none.

## Tests / checks run (local, Postgres 16)
- `tsc --noEmit` ✓.
- `lint:ratchet` **PASS** — errors unchanged at **2086**; `changed_file_lint_errors: 0` (the pre-existing
  `any`/unused findings in the touched files are untouched, baseline-frozen).
- **Governance scan**: after re-keying the 4 shifted findings, **0 new** (frozen findings preserved).
- **Auth route scanner**: "All routes comply".
- **New DB proof (2 tests)** exercising the real `requireWorkspaceContext` (only the session boundary mocked):
  1. earliest-joined workspace is resolved, **consistently across 8 concurrent calls** (later membership
     inserted first, so insertion order ≠ resolution order);
  2. same-`addedAt` tie resolves deterministically to the lower `workspaceId` across 8 calls.
- **No-regression: 60 passed** — `g6r-auth-bridge` + `policy-wrapper-enforcement` + `intervention-route.rbac`
  + `working-capital-route.rbac` (the wrapper touches every canonical route) + the new proof.

## Blast-radius assessment
The change only **adds ordering** to `findFirst` queries — it cannot change results for a single-membership
user (the overwhelmingly common case) and cannot break correctness; it only makes a previously-undefined
choice defined. Aligning the wrapper's order with `getPolicyContext`'s removes a latent
workspace/capability mismatch. The route/auth no-regression suites confirm no behavioural change.

## Honest scope
- Fixes only the deterministic-resolution half of M6. A user-facing **workspace switcher** (letting a
  multi-workspace user choose a workspace other than their earliest) is explicitly out of scope and deferred.
- Does not touch the discovered broken CRUD services (`client-contact`/`user`/`lead`), which still need a
  schema decision.

## Classification
**`P4_M6_DETERMINISTIC_WORKSPACE_RESOLVED`** (tsc + governance + ratchet + 2 DB proofs + 60 no-regression):
multi-workspace membership resolution is deterministic and consistent across the wrapper, policy context, and
activation context; single-workspace behaviour unchanged.

## Merge recommendation
Open PR; drive CI green. Public SaaS / billing / launch / integrations remain out of scope and blocked. The
remaining runtime-readiness work: the three broken CRUD services + their B4 route migrations (pending the
schema decision), and majors M1 / M2 / M4.
