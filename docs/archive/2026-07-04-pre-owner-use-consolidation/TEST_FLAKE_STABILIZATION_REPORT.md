# Test Flake Stabilization Report

Date: 2026-06-11
Branch: `main`
Context: Two tests intermittently failed under full-suite parallel load during the
Module 2 planning commit. This stabilizes both **without weakening coverage** and
**without skipping/deleting tests**. One was test brittleness; the other was a **real
product bug** surfaced by the test (not hidden).

---

## 1. Root cause of each flaky test

### A. `src/__tests__/phase-c/canonical-telemetry-lifecycle.test.ts`
**"Timing Information > Start time and end time track request duration"**
- Brittle assertion: after `await new Promise(r => setTimeout(r, 10))` it asserted
  `endTime - startTime >= 10`.
- `CanonicalTelemetryLifecycle` records `startTime`/`endTime` via **integer
  `Date.now()`** (`src/lib/canonical-telemetry-lifecycle.ts:112,324`). `setTimeout(10)`
  guarantees *"at least 10ms of event-loop time,"* but under parallel load the
  integer wall-clock delta can read **9** (timer/scheduler jitter + ms truncation).
- This tested **Node's timer precision**, not the product. Classification: **test
  brittleness (timing-dependent, real timers, wall-clock threshold).**

### B. `src/__tests__/domain/decision-confidence/confidence-engine.test.ts`
**"Comprehensive Integration > should execute full decision confidence workflow"**
- The test feeds **randomized** inputs (`generateMock*()` use `Math.random()`) into
  `generateDecisionConfidenceScore(...)` and asserts the result passes
  `DecisionConfidenceScoreSchema.safeParse(...)`.
- Brute-force diagnostic (200k runs) isolated the exact failure:
  `executionCertaintyScore :: too_big :: expected <= 100` — **459 / 200,000 ≈ 0.23%**
  of inputs. The `confidenceLevel` assertion never failed (`failLevel=0`).
- **This is a real product bug, not timing.** `calculateExecutionCertaintyScore`
  clamped only the lower bound (`Math.max(0, Math.round(score))`). Its raw score is
  `ownerCapability (<=100) + resourceAvailability boost (<=+10) - penalties`, so it
  can reach ~110 — violating the engine's own Zod schema
  (`executionCertaintyScore: z.number().min(0).max(100)`). The sibling
  `calculateOverallConfidence` already clamps **both** ends; this function was missing
  the upper clamp. Classification: **real product invariant bug (uncapped sub-score).**

## 2. Whether production code or test code changed

- **B → production code changed** (the proven bug): clamp `executionCertaintyScore`
  to `[0,100]`, matching `calculateOverallConfidence` and the schema. The flaky test
  is **unchanged** — it now passes deterministically because the invariant holds.
- **A → test code changed only** (no product bug): made the duration measurement
  deterministic with fake timers. No runtime behavior changed.

## 3. Files changed

| File | Type | Change |
|---|---|---|
| `src/domain/decision-confidence/confidence-engine.ts` | product | `calculateExecutionCertaintyScore` now returns `Math.max(0, Math.min(100, Math.round(score)))` (added upper clamp) |
| `src/__tests__/phase-c/canonical-telemetry-lifecycle.test.ts` | test | duration test uses `vi.useFakeTimers()` + `vi.advanceTimersByTime(10)`; asserts exact `end - start === 10` |
| `TEST_FLAKE_STABILIZATION_REPORT.md` | doc | this report |

## 4. Why coverage is preserved (and improved)

- **A:** intent preserved and **strengthened** — still verifies start tracked, end
  tracked, and a non-negative duration, now asserting the **exact** elapsed time
  (`=== 10`) deterministically instead of a load-sensitive `>= 10`. No assertion was
  loosened into meaninglessness; it became stricter.
- **B:** the test is **unchanged** and still validates the full workflow + schema. The
  fix removes a genuine defect rather than masking it. Proven across **500,000**
  random runs post-fix: `failParse=0`, `maxExecutionCertaintyScore=100`. No test was
  skipped, quarantined, or weakened.
- No product behavior changed except enforcing an invariant the schema already
  declared (a certainty score can never exceed 100%).

## 5. Commands run and results

| Command | Result |
|---|---|
| Brute force (pre-fix, 200k random) | `failParse=459` — all `executionCertaintyScore > 100` |
| Brute force (post-fix, 500k random) | `failParse=0`, `failLevel=0`, `maxExecutionCertaintyScore=100` |
| `vitest run` both files (isolation) | 2 files, **78 passed** |
| `git diff --check` | clean |
| `npm run lint:ratchet` | LINT_RATCHET_PASS (1500 — no increase) |
| `npx prisma validate` | valid 🚀 |
| `npm run build` | Compiled successfully |
| `npx vitest run src/__tests__/founder-recovery/` | 38 passed, 8 skipped |
| `npm test` — **run 1** | 193 files passed, **0 failed**; 5473 passed |
| `npm test` — **run 2** | 193 files passed, **0 failed**; 5473 passed |

## 6. Whether full `npm test` is stable

**Yes** — two consecutive full runs both green (5473 passed, 0 failed), plus a 500k
randomized brute-force proving the confidence-engine invariant holds and a
fake-timer-deterministic telemetry duration test. The two former flake sources are
eliminated, not masked.

## 7. Module 2 remains not started

Confirmed — no Module 2 implementation; only a flake-stabilization product fix +
test fix + this report. Module 2 planning docs untouched.

## 8. Public/SaaS remains frozen

Confirmed — no public/SaaS/billing/marketing files touched.
