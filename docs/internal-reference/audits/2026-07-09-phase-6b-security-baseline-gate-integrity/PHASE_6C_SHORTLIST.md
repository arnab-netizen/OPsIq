# Phase 6C — placebo-test conversion shortlist (PREPARATION ONLY)

**Status:** working notes prepared during Phase 6B CI wait. **No test files modified. No Phase 6C branch
created.** Phase 6C starts only on new owner instruction.

## What a placebo test looks like here

Confirmed signature (e.g. `src/__tests__/api/execution-certainty.test.ts`):

```ts
it("should require ENGAGEMENT_VIEW capability", () => {
  expect(true).toBe(true); // Capability checked in withAuth
  // TODO_A2_FAKE_TEST_QUARANTINED: DELEGATED_TO_SERVICE
});
```

The test **name** describes a real behavior (auth, capability, UUID validation, engagement access,
state transition) but the **body asserts nothing** — `expect(true).toBe(true)` with a comment. These pass
unconditionally and provide zero coverage.

## Population (searchable)

- **751** occurrences of `TODO_A2_FAKE_TEST_QUARANTINED` across `src/**/*.test.ts`.
- **939** trivial `expect(<literal>).toBe(...)` assertions total (superset; includes some legitimate literal
  checks — must be filtered per-file, not blanket-converted).

## Prioritized clusters (highest placebo density first)

| Rank | Cluster / file | Placebo markers | Real surface to assert against |
|---|---|---|---|
| 1 | `api/operator-queue.test.ts` | 112 | operator-queue route: auth, capability, workspace scoping, queue ordering/claims |
| 2 | `api/execution-certainty.test.ts` | 111 | execution-certainty route: engagement access, feasibility calc from findings/actions/health |
| 3 | `api/constraint-checks.test.ts` | 108 | constraint-checks route: validation + governed evaluation |
| 4 | `api/escalation-checks.test.ts` | 91 | escalation route: threshold/adaptive-rule enforcement |
| 5 | `api/review-cycles.test.ts` | 88 | review-cycle route: cadence/state transitions |
| 6 | `api/actions.test.ts` | 74 | action route: create/transition, capability, idempotency |
| 7 | `api/experiments.test.ts` | 69 | experiments route |
| 8 | `api/health.test.ts` | 38 | health/status route |
| 9 | `api/decisions.test.ts` | 37 | decision route: create/transition, authorization |
| 10 | `services/action.test.ts` | 23 | action service (governed wrapper / state machine) |

Named clusters from the brief, mapped:
- **findings/API route tests** — findings endpoints already have REAL DB coverage from Phase 6A
  (`findings-invalid-select.db.test.ts`); check `api/findings*` for residual placebos before converting.
- **hostile-auth / governed wrappers** — `engagements/intervention-route.rbac.test.ts`,
  `owner-mode/fake-proof-anti-gaming*.test.ts`, and `withAuth`/governed-wrapper tests; convert to assert
  real 401/403/capability outcomes via the canonical enforcement layer.
- **decision/action tests** — ranks 6, 9, 10 above.
- **operator queue** — rank 1.
- **execution-certainty** — rank 2.

## Conversion approach (for the future phase, not now)

- Convert per-cluster, one PR per small cluster (mirror Phase 6A: real behavior, no mocks where DB proof is
  required, required-lane `[db]` tests gated by `TEST_WITH_DB`).
- Replace `expect(true).toBe(true)` with real assertions that exercise the route/service (status codes,
  authorization outcomes, governed state transitions, tenant isolation), seeding real rows like the Phase 6A
  DB tests.
- Do **not** blanket-delete or blanket-skip; each converted test must assert real behavior or be removed with
  justification. Do not count the 751 markers as coverage until converted.
- Filter the 939 trivial-assertion superset per file — some literal `expect(x).toBe(1)` are legitimate.

## Guardrail idea (optional, future)

Add a ratchet that fails CI if the `TODO_A2_FAKE_TEST_QUARANTINED` count **increases**, so the placebo
population can only shrink.
