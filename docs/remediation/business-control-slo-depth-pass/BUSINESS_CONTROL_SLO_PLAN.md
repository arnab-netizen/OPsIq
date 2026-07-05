# Business-Control SLOs — Plan

**Branch:** `claude/business-control-slo-depth-pass` · **Base/main:** `6a840314`.

## Goal (one depth capability)
Measure whether OpsIQ's own control loop is reliable — PASS/WARN/FAIL/NOT_MEASURABLE SLIs, owner-visible,
honest about what cannot be measured, no fake/always-green metrics.

## Approach (mirrors the proven engine pattern)
1. Pure `evaluateBusinessControlSLOs(input)` grading 15 SLIs deterministically.
2. Graded from the now-view's existing signals + proof counts (no new data path).
3. `getBusinessControlHealth` service = owner-callable entry point (wraps the now-view).
4. Surface `businessControlHealth` (+ top control risk) via `/api/owner/now-view`.
5. NOT_MEASURABLE with exact missing source where no persisted signal exists; link the related engines.
6. Unit tests per SLI + DB simulation (PASS/WARN/FAIL/NOT_MEASURABLE mix) + isolation.

## Out of scope
Process Intelligence, public SaaS, billing, report cleanup.
