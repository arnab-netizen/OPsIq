# G1 Coverage Delta — diagnosis fail-closed (owner-journey stage 3)

| Aspect | Before (Wave 8) | After (G1) |
|---|---|---|
| `isDataSufficient` primitive | Unit-proven in isolation (Wave 7) | Unchanged |
| End-to-end block via `generateRecommendation` | **Not proven** | **Proven** (blocked=true, confidence 0, no action) |
| End-to-end block via `generateMultipleRecommendations` | **Not proven** | **Proven** (whole set blocked) |
| "blocked" vs "merely low / unmet quality" distinction | Not asserted | **Asserted** (contrasted directly) |
| Confident-recommendation path still works (not always-block) | Not asserted here | **Asserted** |
| Lane | n/a | **Required** maintained vitest suite |

Stage-3 proof state moves from `partial_gap` → covered for the fail-closed assertion. The remaining
`diagnosis-confidence` surface (onboarding low-confidence + missing-data) was already covered by
existing specs; G1 closes the specifically-owed "blocked, not merely low" end-to-end assertion.
