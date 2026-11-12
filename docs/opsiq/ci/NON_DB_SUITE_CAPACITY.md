# Non-DB suite capacity — `NON_DB_SUITE_TIMEOUT_HEADROOM_EXHAUSTED`

Status: **timeout headroom restored; underlying inefficiency deferred.**

## The defect

`.github/workflows/ci.yml` → job `build-and-test` → step *Run non-DB test suite*
carried a fixed 20-minute cap while the suite grew to roughly 28,460 tests across
1,009 files. The cap was reached, and PRs began failing with **zero test
failures**.

Reproduced on PR #279 at commit `bd9dc6bd52b75cb64c755e61912ef51fafc70f39`,
workflow run `30845807196`:

| Attempt | Test files | vitest `Duration` | vs 1200s | Test failures | Step outcome |
|---|---|---|---|---|---|
| 1 | 1007 passed, 2 skipped | 1207.10s | −7.1s | 0 | timed out |
| 2 | 1007 passed, 2 skipped | 1199.66s | +0.34s | 0 | timed out |

Preceding runs of the same step, for margin context:

| Run | Tests | Duration | Margin |
|---|---|---|---|
| 30836628931 | 28436 | 1176.49s | +23.5s |
| 30839370755 | 28452 | 1172.90s | +27.1s |
| 30845807196 (1) | 28457 | 1207.10s | −7.1s |

Run-to-run variance is roughly 30 seconds — several times the overrun. The suite
had been passing on luck.

**Attempt 2 is the load-bearing observation.** vitest reported 1199.66s, *inside*
the 1200-second cap, and the step was killed regardless. The step's budget also
covers the quarantine-list `node -e` prelude, `npx` startup and reporter
teardown, none of which appear in vitest's self-reported figure. The time
actually available to the suite was therefore already negative.

## What was changed

Two values, both in `.github/workflows/ci.yml`:

| Setting | Before | After | Why |
|---|---|---|---|
| step *Run non-DB test suite* `timeout-minutes` | 20 | **30** | restores headroom |
| job `build-and-test` `timeout-minutes` | 25 | **40** | a step cap is unreachable if the job dies first |

The job cap matters and is easy to miss: raising only the step to 30 would have
changed nothing, because the 25-minute job cap would have killed the job first
and the step would never have reported its own timeout. Observed setup-to-step-start
cost is about 2 minutes, so 40 leaves genuine room above 30.

Nothing about what CI asserts changed — same command, same test selection, same
blocking behaviour, same exit-code handling, same branch-protection dependency.
The tests were already passing; they were being denied the time to say so.

## What this does not fix

Roughly **63% of the runtime is test-environment instantiation, not test
execution** (760s of 1207s in attempt 1; `tests` itself was only ~124s). Raising a
cap buys time; it does not make the suite cheaper, and the same wall will be hit
again as the suite grows.

Deferred package, not yet scheduled:

1. **Split the suite** into independently-scheduled lanes.
2. **Reduce jsdom setup** — most files do not need a browser environment.
3. **Separate Node-only from browser-environment tests** so each runs under the
   cheapest environment that is correct for it.
4. **Shard** across runners.
5. **Reuse environments** where isolation is provably not compromised.

Item 3 is the highest value per unit of effort: environment cost is paid per file,
so moving Node-only files off jsdom reduces the dominant term directly.

## Guardrails

`src/__tests__/ci-cd/non-db-suite-capacity.test.ts` fails if the cap is lowered
below 30, if the job cap stops exceeding the step cap, if the step stops being
blocking, if `continue-on-error` is introduced, if the test command is narrowed,
or if `branch-protection` stops depending on `build-and-test`.

## 2026-11 addendum — 30 → 45 minute step cap, 40 → 55 minute job cap

Status: **headroom restored a second time; underlying inefficiency still deferred** (the
`NON_DB_SUITE_TIMEOUT_HEADROOM_EXHAUSTED` class recurred, as the section above predicted).

### Evidence

| Source | Suite step / duration | vs 1800s cap |
|---|---|---|
| PR #658 run 43212944581 (passed) | step 11:58:20 → 12:28:02 = **1782s** | **+18s** |
| local run, identical suite on PR #647 head (`3e867e7f`), no cap | vitest `Duration` **1858.30s** (environment 972s, tests 434s) | −58s (would have been killed on CI) |
| PR #657 run 43203570990, PR #642 run 43205174093 | killed at 1800s, **zero test failures** | — |
| fast-mode runs of the same suite | ~1415–1441s | +360s |

The suite is now ~37,142 tests / 1,488 files. Runner speed is bimodal (fast ≈1415–1441s,
slow ≈1771–1782s); ~53% of the time is environment instantiation. The old cap sat ~1% above the
slow mode, so passing runs were being killed on runner luck.

### Job timing (run 43212944581, `build-and-test`)

| Phase | Seconds |
|---|---|
| job start → suite step start (npm ci 31, tsc 51, lint 101, build 91, gates) | 306 |
| suite step | 1782 |
| post steps | ~3 |
| job total | 2151 (of the 2400 cap) |

At a 45-minute step cap the worst case is 306 + 2700 + 3 = **3009s ≈ 50.2 min**, so the job cap is
**55 minutes** (≈4.8 min margin). Setup is ~5.1 min, not the ~2 min recorded above.

### What changed

| Setting | Before | After |
|---|---|---|
| step *Run non-DB test suite* `timeout-minutes` | 30 | **45** |
| job `build-and-test` `timeout-minutes` | 40 | **55** |

Plus diagnostics only: a *Record job step start time* step, a *Record non-DB suite start time* step
and an `always()` *Non-DB suite timing diagnostics* step that prints
`NON_DB_SUITE_TIMING setup_s= suite_s= total_s= step_cap_s= suite_headroom_s=` and a job summary
table (also on timeout). They never fail the job and do not touch the suite command, selection,
`continue-on-error: false`, exit handling or the `branch-protection` dependency. No test, assertion
or governance check was removed or narrowed.

### Cost note

A hung suite can now consume up to 55 runner-minutes instead of 40 (+15). Healthy runs are unchanged
in duration. The deferred package above (Node-only environment, sharding, environment reuse) remains
the actual fix; revisit when `suite_headroom_s` in the new diagnostics drops below ~300s.
