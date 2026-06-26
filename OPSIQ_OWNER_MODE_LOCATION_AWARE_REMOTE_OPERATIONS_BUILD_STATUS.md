# OpsIQ Owner Mode — Location-Aware Remote Operations Capability — Build Status

This is an **Owner Mode capability**, not a separate mode/product/engine. All remote /
multi-location outputs route through the existing Owner Mode governance (F0–F15 foundation,
collective command-and-control `runCollective`, veto matrix, harm ledger, learning
quarantine, decision journal, feasibility checker, lean filter, workspace isolation,
auth/role boundaries). Built additively under `src/domain/remote-operations/`.

## Owner Mode integration confirmation
- ✅ Remains inside Owner Mode — no parallel execution/proof/decision/learning engine.
- ✅ Reuses existing engines (see R0 audit). New primitives only where the area is
  genuinely MISSING (location/dispatch/terminal/attendance), with non-overlap proven.

## R0 — Repo audit (DONE, no code). Fail-closed: no UNKNOWN/UNSAFE/DUPLICATED area blocks.

| Area | Existing files | Status | Reuse/extend decision | Duplication risk |
|---|---|---|---|---|
| Task/Action + state machine | `src/domain/execution/action.ts` (ActionState, VALID_TRANSITIONS, canTransition/assertTransition), `job.ts` (idempotency) | COMPLETE | Reuse transition pattern; remote tasks add a richer status set (§18) that wires the same governance | none |
| Proof / evidence / verification | `src/domain/evidence/evidence.ts`, `domain-training/evidence-hierarchy.ts` (L1–L5), `founder-recovery/verification.ts` | COMPLETE | Wire evidence levels + verification; remote proof adds proof-burden/authenticity flags | none |
| Workspace isolation | `src/domain/workspace/isolation-contracts.ts` (WorkspaceRole, validateScopedQuery, canActorPerformAction) | COMPLETE | Wire; add locationId scope on top of workspaceId | none |
| Auth / roles / errors | `src/domain/constants/roles.ts`, `infra/errors.ts` (UnauthorizedError/ForbiddenError) | COMPLETE | Wire errors + role checks | none |
| F0–F15 foundation | `src/domain/domain-training/*` | COMPLETE | Wire veto/severity/feasibility/lean/harm/learning/decision-journal/unsafe | none |
| Collective arbitration | `src/domain/collective-training/collective-engine.ts` (`runCollective`) | COMPLETE | Wire — remote recommendations pass through collective arbitration | none |
| Harm ledger | `domain-training/harm-ledger.ts` (HarmType, harmfulSideEffectPreventsSuccess) | COMPLETE | Wire; add remote harm event types (§3.16) as an additive const set | none |
| Learning quarantine | `domain-training/learning-quarantine.ts` (canPromote, terminalStage) | COMPLETE | Wire — remote operational events enter the same quarantine | none |
| Location/site/unit, dispatch, terminal, supervisor, vendor, checklist, attendance, distribution | none found | MISSING | Greenfield additive primitives; non-overlap proven (no existing location/dispatch/terminal model) | none |
| DB / migrations | `prisma/schema.prisma` (4541 lines, workspaceId-scoped) | COMPLETE | This layer is PURE LOGIC (no migrations), mirroring the F0–F15/collective layers | none |
| Tests | vitest, `@/` alias, `src/__tests__/...`, `[db]`-gated | COMPLETE | Add `src/__tests__/domain/remote-operations/` pure tests | none |

**R0 verdict:** PROCEED. Governance primitives exist (wire them); location/remote primitives are
cleanly missing (build additively). No duplicate engines required.

## Slice progress
- [x] R0 — repo audit (fail-closed; no blockers)
- [ ] R1 — Owner Mode integration contract  <-- IN PROGRESS
- [ ] R2 — location + role + terminal scoping
- [ ] R3 — distribution plan model + versioning + immutable approval + idempotency
- [ ] R4 — atomic high-risk transition state machine (no skip-stage; concurrency)
- [ ] R5 — pre-dispatch feasibility + dispatch veto matrix (wires Owner Mode vetoes)
- [ ] R6 — AI-plan approval control (bulk gate + duplicate detection)
- [ ] R7..R32 — remaining slices (see prompt §101)

## Tests
- Remote-operations: 0 so far. Foundation + collective untouched (280 repo tests still green).

## Known limitations
- Pure-logic capability layer (no new Prisma migrations / UI routes), consistent with how the
  F0–F15 and collective layers were built. DB/terminal/AI surfaces are modelled as governed
  deterministic contracts (R14 deterministic reviewer interface), ready for later persistence/UI
  wiring by an authenticated Owner-Mode handler. Documented honestly here, not overclaimed.

## Classification
LOCATION_AWARE_REMOTE_OPERATIONS_IN_PROGRESS (R0 done; R1+ pending).

## Continuation
`/continue-owner-mode-location-aware-remote-operations-build`
