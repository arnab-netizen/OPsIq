# Owner Next-Best-Action / Action-Priority Quarantine Inventory — Phase 1 Wave 6

- Branch: `claude/phase-1-wave-6-owner-next-best-action-proof` · Base: `origin/main` (post-Wave-5, `c13a0ca3`)
- Date: 2026-07-08
- Quarantined before Wave 6: 88 (post-Wave-5) · Reactivated: 1 · Remaining: 87.

## Candidate map

| # | Path | Source targeted | DB | Real DB? | Status / action |
|---|---|---|---|---|---|
| 1 | `services/execution-drift/next-action.service.test.ts` | `mapDriftToRequiredAction` (pure), `deriveCommitmentStatus` (mocked `db.action.findFirst`) | mocked (commitment) / none (mapping) | no | **REACTIVATED** — deterministic owner next-best-action selection + commitment status |
| 2 | `services/action.integration.test.ts` | `createAction` / `updateActionStatus` state machine | mocked (`vi.mock(@/lib/db)`) | no | defer — action lifecycle/state-transition, not next-best-action priority selection |
| 3 | `services/evidence-action-lifecycle.integration.test.ts` | evidence→action lifecycle | mixed | mixed | defer — evidence lifecycle scope |
| 4 | `app/api/operator/__tests__/queue.test.ts` | operator queue API route | mixed | mixed | defer — route/API layer, separate scope |
| 5 | `action-center.test.tsx` | action-center UI | none | no | defer — UI wave |
| 6 | `services/__tests__/recommendation.priority.test.ts` | `createRecommendation` priority (stale mocks) | mocked (partial) | no | defer — carried from Wave 4 (broad mock repair pending) |

## Why #1 selected (smallest meaningful owner next-best-action proof)
`mapDriftToRequiredAction(drift)` is the owner **next-best-action selector**: it scores every drift
condition across categories (overdue critical actions, blockers, health crisis, execution-certainty,
unresolved findings/recommendations, inactivity) and returns the single **highest-priority** required
action deterministically. This is exactly the Wave-6 dimension "highest-priority action selected
deterministically; high-risk / cash-critical outranks; low-signal demoted."

The reactivated test proves, against the current source:
- **deterministic highest-priority selection** — overdue critical actions (score 95) outrank a critical
  blocker / critical-health (85), which outrank critically-low execution certainty (80), low certainty /
  critical findings (70–75), at-risk health (65), and inactivity (50); when multiple conditions are
  present the highest score wins (overdue `action` with its `entityId` is chosen over health/blocker);
- **urgency mapping** — critical vs high per category matches the source;
- **case-insensitive reason matching** and **no-drift → null** (fail-closed: no drift ⇒ no fabricated action);
- **commitment status** (`deriveCommitmentStatus`) — completed/verified → completed, in_progress →
  in_progress, pending/blocked → pending, DB error → pending (fail-safe), and the lookup is
  **workspace-scoped** (`where: { id, engagement: { workspaceId } }`); non-action types short-circuit to pending.

## Labelling (honest proof classification)
- `mapDriftToRequiredAction` assertions exercise **pure deterministic logic** (no DB, no mocks) — this is
  genuine priority-selection proof.
- `deriveCommitmentStatus` assertions mock `db.action.findFirst` — labelled **SERVICE_LOGIC_ONLY**; the
  mocked DB calls are **NOT** counted as real-DB proof (real-DB action persistence is out of this wave's
  scope; a later wave can prove it end-to-end).

## API-drift note
The test is **current-API** — `mapDriftToRequiredAction(drift)` and
`deriveCommitmentStatus(action, workspaceId)` match the current exported signatures in
`src/services/execution-drift/next-action.service.ts`, and every asserted `type`/`urgency`/score-ordering
matches `scoreDriftConditions`. No assertion changed; the only edit is the relative-import path fix forced
by moving the file into a `__tests__/` subdirectory (`./` → `../`).

## Rules honored
- No quarantined test deleted (reactivation is `git mv`; history preserved). No assertion weakened.
- Mocked `db.action.findFirst` in the commitment block is **not** counted as DB proof (SERVICE_LOGIC_ONLY).
- Pure priority-mapping runs in every lane; no DB gate needed (no real DB dependency).
- 87 tests remain quarantined, each with a documented action. Broad scenario/UI/API suites explicitly NOT
  reactivated in this wave.
