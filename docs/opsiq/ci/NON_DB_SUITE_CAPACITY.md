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
