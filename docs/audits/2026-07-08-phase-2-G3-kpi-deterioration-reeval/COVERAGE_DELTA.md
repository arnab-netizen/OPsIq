# G3 Coverage Delta — weekly KPI-deterioration adaptive re-eval (owner-journey stage 10)

| Aspect | Before (Wave 8) | After (G3) |
|---|---|---|
| KPI deterioration → governed re-evaluation routing | Not proven (escalation tests quarantined) | **Proven** via `detectKPIDeteriorationPattern` (un-mocked) |
| Condition re-evaluated on KPI deterioration | Not proven | **Proven** (`kpi_deterioration` factor → critical rating) |
| Intervention mode re-evaluated | Not proven | **Proven** (`recovery`) |
| Recommendation + action priority re-evaluated | Not proven | **Proven** (both `escalate`) |
| Review cadence re-evaluated | Not proven | **Proven** (3 days / critical) |
| Health status re-evaluated | Not proven | **Proven** (valid status + auditEventId) |
| Intervention phase for KPI path | Ambiguous in gap text | **Clarified**: intentionally excluded (`targets.interventionPhase === false`) |
| Lane | Non-required / mocked | **Required** maintained vitest suite, un-mocked |

Stage-10 proof state moves from `partial_gap` → covered for the adaptive-re-evaluation assertion. The
CLAUDE.md mandatory adaptive rule (significant change → governed re-evaluation of condition / mode /
priority / cadence / health) is now proven end-to-end for the KPI-deterioration trigger.
