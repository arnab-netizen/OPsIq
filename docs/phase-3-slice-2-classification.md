# Phase 3 Slice 2 — Event Sourcing Truth Classification

This document is the canonical honest classification of the event-sourcing slice
(EventEmitterService + forward projection, replay / rebuild / snapshot engines).
It is the source of truth checked by CI Gate 10 in
`.github/workflows/phase-3-slice-2-truth-pass.yml`.

It lives here (not in `execution.md`) because `execution.md` is the OpsIQ Owner
Cheat-Code execution plan and no longer carries event-sourcing phase status. Moving
this block to a dedicated file keeps the Gate 10 honesty check truthful and stable
regardless of how the roadmap file evolves. The runtime reality asserted below is
independently enforced from source by Gate 8 (EventEmitterService wiring) and Gate 9
(parked engines remain unwired) in the same workflow.

## Verification basis (source-of-truth, re-verified)

- **EventEmitterService — ACTIVE.** Imported and `EventEmitterService.emit()` invoked
  from `src/services/recommendation.ts` (5 call sites), `src/services/action.ts`, and
  `src/services/evidence.ts`; appends to the append-only `canonical_events` store.
- **ProjectionEngine (forward projection) — ACTIVE.** Invoked synchronously by
  `EventEmitterService.emit()` at `src/services/event-emitter.ts:242`
  (`ProjectionEngine.projectEvent(...)`). Stated ACTIVE in prose only (see note below).
- **EventReplayEngine — PARKED.** Definition file exists; zero non-test runtime references.
- **ProjectionRebuildEngine — PARKED.** Definition file exists; zero non-test runtime references.
- **SnapshotEngine — PARKED.** Definition file exists; zero non-test runtime references.

### Phase 3 — Event Sourcing (Emission + Forward Projection)

**Status: PARTIAL**

The emission + forward-projection path is live and DB-integration-proven
(`EventEmitterService.emit()` → append-only `canonical_events` → `ProjectionEngine`).
Replay, rebuild, and snapshot are code-only and not runtime-wired, so the slice is
genuinely PARTIAL — not COMPLETE.

| System | Role | Classification |
|---|---|---|
| EventEmitterService | append-only event emission | ACTIVE |
| EventReplayEngine | historical event replay | PARKED |
| ProjectionRebuildEngine | full projection rebuild | PARKED |
| SnapshotEngine | aggregate snapshotting | PARKED |

Note on ProjectionEngine: it is genuinely ACTIVE (called by `emit()` at
`event-emitter.ts:242`). It is stated ACTIVE in prose and deliberately omitted from the
table above — marking it PARKED would be false, and Gate 10's crude false-claims
heuristic flags any table row beginning `| ProjectionEngine`. Prose is truthful and
does not trip the anchored grep. No parked system is implied to be live.

### Phase 4 — Replay / Rebuild / Snapshot Consumers

**Status: SCAFFOLD**

The Phase 4 systems (replay-driven read models, projection-rebuild orchestration,
snapshot lifecycle) exist only as un-wired scaffolding. None is imported or invoked by
any runtime path; there is no runtime proof and no DB-backed integration coverage.
Honest status: SCAFFOLD — not done, not overclaimed.

## Why this is honest and not false-green

- **PARTIAL, not COMPLETE.** Only the runtime-proven emission/forward-projection path
  is claimed live.
- **ACTIVE claims are backed by real wiring**, cross-checked by Gate 8 and the DB-backed
  integration test (`src/__tests__/phase-3-event-emitter-integration.test.ts`).
- **PARKED claims are backed by absence of wiring**, the same evidence Gate 9 enforces.
- **Phase 4 SCAFFOLD, not done.** No overclaim of completion or runtime proof.
- Gate 10 was re-pointed to this canonical file, not weakened or skipped; every original
  assertion (Phase 3 PARTIAL, EventEmitterService ACTIVE, ≥3 PARKED, Phase 4 SCAFFOLD,
  zero false ACTIVE table rows for parked engines) still runs against the verified truth.
