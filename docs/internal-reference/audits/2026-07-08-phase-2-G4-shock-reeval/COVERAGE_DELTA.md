# G4 Coverage Delta — shock event adaptive re-eval (owner-journey stage 11)

| Aspect | Before (Wave 8) | After (G4) |
|---|---|---|
| Shock event → governed re-evaluation binding | Not proven (shock test mocks re-eval + detection) | **Proven** via `createShockEvent` (un-mocked) |
| Shock detection actually runs | **Broken** (`conditionProfiles` relation bug → 500) | **Fixed** + proven (`detectionConfirmed`) |
| BusinessConditionProfile re-evaluated | Not proven | **Proven** (`critical` rating) |
| Intervention mode re-evaluated | Not proven | **Proven** (`recovery`) |
| Intervention phase re-evaluated **and persisted** | Not proven | **Proven** (`growth` → re-evaluated + version bump) |
| Recommendation + action priority re-evaluated | Not proven | **Proven** (both `escalate`) |
| Review cadence re-evaluated | Not proven | **Proven** (3 days / critical) |
| Health status re-evaluated | Not proven | **Proven** (valid status + auditEventId) |
| Full target map for shock | Not asserted | **All seven targets `true`** (contrast with G3's KPI path) |
| Lane | Non-required / mocked | **Required** maintained vitest suite, un-mocked |

Stage-11 proof state moves from `partial_gap` → covered. A shock event now provably binds to the
governed adaptive re-evaluation of every mandated dimension, and a latent shock-detection defect that
made `createShockEvent` throw on every call was found and fixed.
