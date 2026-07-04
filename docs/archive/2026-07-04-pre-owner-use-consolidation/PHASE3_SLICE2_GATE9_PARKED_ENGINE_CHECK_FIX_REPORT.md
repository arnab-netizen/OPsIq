# Phase 3 Slice 2 — Gate 9 Parked-Engine Check Fix Report

Date: 2026-06-11
Branch: `claude/vibrant-ramanujan-mdqej8`
PR: #31 (head was `37ed342` before this change)

## 1. Root cause

Gate 9 ("Verify PARKED systems remain unwired") used an over-broad grep:

```bash
grep -r "EventReplayEngine" src/services/*.ts src/app/**/*.ts | grep -v "test\|__tests__" | wc -l   # fail if > 0
# ... same for ProjectionEngine, SnapshotEngine
```

Two distinct defects:

1. **It matched the engines' own definition files** (and sibling parked-engine
   definitions). `EventReplayEngine` matches only in `event-replay-engine.ts`
   (its own definition), `projection-rebuild-engine.ts`, and `snapshot-engine.ts`
   — all parked engine definitions, none of which is "runtime wiring."
   `SnapshotEngine` matches only in `snapshot-engine.ts` (its own definition).
   So the gate flagged definitions as "wired" → false failure.

2. **It checked the wrong projection engine.** The gate greps `ProjectionEngine`,
   but `ProjectionEngine` (`src/services/projection-engine.ts`) is **intentionally
   ACTIVE** — `EventEmitterService.emit()` calls `ProjectionEngine.projectEvent()`
   (the forward-projection on event emit; pre-existing on `main` at line 242, and
   Gate 8 verifies EventEmitterService is ACTIVE). The genuinely **parked**
   projection engine is `ProjectionRebuildEngine`
   (`src/services/projection-rebuild-engine.ts`) — the heavy rebuild engine. The
   task itself lists `projection-rebuild-engine.ts` as the parked definition file.

## 2. Why Gate 9 was falsely failing

It had never run in CI before (Gate 2 failed first, then Gate 6 excluded the phase
test). Once those were fixed and Gate 9 finally executed, its over-broad grep
immediately flagged `EventReplayEngine` because it appears in parked-engine
definition files — and it would also have flagged the active `ProjectionEngine`
(legitimately called by `emit()`). Neither is a real "unexpected wiring."

## 3. Whether actual runtime wiring was found

- `EventReplayEngine` — **no** real runtime wiring. Excluding tests + the three
  parked definition files yields **0** references → truly parked.
- `ProjectionRebuildEngine` — **no** real runtime wiring → truly parked.
- `SnapshotEngine` — **no** real runtime wiring → truly parked.
- `ProjectionEngine` (active) — referenced by `event-emitter.ts` (`emit()` calls
  `projectEvent`), which is **intentional and pre-existing on main**, not a
  regression. It is correctly NOT a parked engine, so it was removed from the
  parked checklist (replaced by `ProjectionRebuildEngine`).

No product code was changed (no actual mis-wiring of a parked engine exists).

## 4. Workflow file changed

`.github/workflows/phase-3-slice-2-truth-pass.yml` — Gate 9 step only.

## 5. Exact fix

- Exclude the parked-engine **definition files** (and tests) from the grep so the
  check flags only imports/calls from OTHER runtime files:
  `PARKED_DEFS="event-replay-engine.ts|projection-rebuild-engine.ts|snapshot-engine.ts"`,
  added as `| grep -vE "$PARKED_DEFS"` to each check.
- Check the genuinely-parked `ProjectionRebuildEngine` instead of the active
  `ProjectionEngine`.
- Kept the three separate engine checks and the `exit 1`-on-match behavior.

## 6. Why the gate remains meaningful (not a no-op, not weakened)

The gate still fails if any of `EventReplayEngine` / `ProjectionRebuildEngine` /
`SnapshotEngine` is imported or called from a **non-parked, non-test runtime file**.
Verified with a negative control: adding a fake non-parked file that imports
`EventReplayEngine` makes the check report `count=1` → fail. Only the engines' own
definitions (and sibling parked definitions) are excluded — exactly the false
positives. The check was neither removed nor turned into a no-op.

## 7. Commands run and results

| Command | Result |
|---|---|
| Gate 9 shell logic (local dry-run) | EventReplayEngine ✓, ProjectionRebuildEngine ✓, SnapshotEngine ✓ all PARKED; negative control correctly FAILS |
| YAML parse (`yaml.safe_load`) | YAML OK |
| `git diff --check` | clean (exit 0) |
| `npm run lint:ratchet` | LINT_RATCHET_PASS (1500 errors) |
| `npx prisma validate` | valid 🚀 |
| `npx vitest run src/__tests__/founder-recovery/` | 38 passed, 8 skipped |
| `npm test` | 193 files passed, 0 failed; 5473 tests passed |
| `npm run build` | Compiled successfully |

No real migration was run; no DB connection from this environment.

## 8. No secrets printed or committed

Confirmed — workflow change references no URLs/credentials; staged-diff secret scan
performed.

## 9. No `.env*` files modified

Confirmed.

## 10. No migration run manually

Confirmed — no `prisma migrate deploy`/`reset`/`db push`.

## 11. Owner Recovery Module 1 unaffected

Confirmed — no Module 1 code/schema/migration/routes/tests changed; founder-recovery
green; build green.

## 12. Module 2 remains blocked

Confirmed.

## 13. Public/SaaS remains frozen

Confirmed.
