# Test Flake Stabilization (Before Slice 5) — Report

Date: 2026-06-11
Branch: `main`
Context: Before Module 2 Slice 5 (Prisma/schema/migration), stabilize the two
parallel-load timing flakes observed during Slice 4 so the test signal is clean.
**Test-only changes; no production runtime behavior changed; no tests
skipped/deleted/weakened.**

---

## 1. Root cause of each flaky area

### A. `src/__tests__/infra/rate-limiter.test.ts` — "Bucket State Query"
The token bucket refills by **wall-clock elapsed time**: `getBucketState` and
`checkRateLimit` both call `refillTokens(bucket, config, Date.now())`, adding
`(elapsed / windowMs) * maxRequests` tokens (`src/infra/rate-limiter.ts:38-41,
64, 126`). With `windowMs: 1000, maxRequests: 5`, even ~20–200ms of real time
between consuming tokens and reading state (parallel-load/GC jitter) refills
0.1–1.0 tokens, pushing the count above the asserted bound. The failing assertion
`state?.tokens <= 2` (after consuming 3) is therefore timing-dependent. **Test
brittleness — real-time wall-clock refill; production code is correct.**

### B. `src/__tests__/phase-e/e2-replay-determinism-proof.test.ts` — "replay 1000 events with consistent performance"
The flake was `expect(duration2).toBeLessThan(duration1 * 2)` — comparing two tiny
wall-clock durations of the same in-memory replay. Under parallel CI load
`duration1` can round to `0ms` (making the bound `0`, impossible to satisfy) or the
second run can be 2–3× a sub-millisecond first run due to scheduling/GC. **Test
brittleness — relative comparison of noisy absolute timings; replay correctness is
fine.**

## 2. Whether production code or test code changed

**Test code only.** No production file was modified. Both were proven to be test
brittleness (no product bug): the rate limiter refills correctly, and replay is
deterministic.

## 3. Files changed

| File | Change |
|---|---|
| `src/__tests__/infra/rate-limiter.test.ts` | The two "Bucket State Query" token-count tests now use `vi.useFakeTimers()` (frozen clock → zero refill → exact token count), asserting the exact consumed counts (`toBe(4)` / `toBe(2)`). |
| `src/__tests__/phase-e/e2-replay-determinism-proof.test.ts` | Replaced the noisy `duration2 < duration1 * 2` with: three replays + identical-hash determinism (strengthened) + eventCount, and a single **generous absolute** performance ceiling (`totalDuration < 2000ms`). |
| `TEST_FLAKE_STABILIZATION_BEFORE_SLICE5_REPORT.md` | This report. |

## 4. Why coverage is preserved (and strengthened)

- **Rate-limiter:** still verifies the bucket exists, exposes `tokens`/`lastRefill`,
  and that consumption is reflected — now **exactly** (`toBe(4)`, `toBe(2)`) under a
  deterministic clock instead of a load-sensitive `<=` bound. Production refill
  behavior is untouched and still exercised by the time-based tests
  ("should replenish tokens over time", "should cap tokens at maxRequests"). No
  assertion was loosened; the bound became stricter.
- **Replay:** determinism coverage is **strengthened** (three replays must share one
  hash, vs two before) and eventCount is kept. The performance/scale dimension is
  retained as a defensible ceiling that still catches a real complexity blowup
  (>2s for 1000 in-memory replays) without comparing two sub-millisecond timings.

## 5. Commands run and results

| Command | Result |
|---|---|
| `npx vitest run` (both files, isolation) | 2 files, **57 passed** |
| `npx eslint` (both files) | pre-existing baseline issues only; **no new** errors from these edits |
| `npm run lint:ratchet` | LINT_RATCHET_PASS (1500; `changed_file_lint_errors: 0`) |
| `git diff --check` | clean |
| `npx prisma validate` | valid 🚀 |
| `npm run build` | Compiled successfully |
| owner-finance (metrics/diagnosis/actions) + spine + founder-recovery | 115 passed |
| `npm test` — **run 1** | 197 files passed, **0 failed**; 5550 passed |
| `npm test` — **run 2** | 197 files passed, **0 failed**; 5550 passed |

## 6. Whether full `npm test` is stable across two runs

**Yes** — two consecutive full runs both green (197 files, 0 failed, 5550 passed),
with both formerly-flaky files made deterministic (frozen clock / generous absolute
bound). Combined with the earlier telemetry + confidence-engine fixes, the known
wall-clock flakes are eliminated, not masked.

## 7. Module 2 Slice 5 remains not started

Confirmed — no Prisma schema edit, no migration, no Slice 5 work; only the two test
files + this report changed.

## 8. Public/SaaS remains frozen

Confirmed — no public/SaaS/billing/marketing files touched.
