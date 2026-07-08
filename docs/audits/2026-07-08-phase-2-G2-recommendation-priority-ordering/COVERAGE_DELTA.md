# G2 Coverage Delta — recommendation priority ordering (owner-journey stage 4)

| Aspect | Before | After (G2) |
|---|---|---|
| `getRecommendationsForEngagement` ordering | Lexical string (`medium > low > high`) — **defect** | Semantic rank (`high > medium > low`) |
| Highest-priority-first end-to-end assertion | Absent (Wave-3 used lexical `>=`, all-`high` recs) | **Proven** with scrambled mixed priorities |
| Determinism across reads | Not asserted | **Asserted** |
| Owner sees most-important recommendation first | **No** (high sorted last) | **Yes** |
| Lane | Wave-3 (required) but non-semantic | **Required**, semantic, mixed-priority |

Stage-4 proof state moves from `partial_gap` → covered. A genuine owner-facing ordering defect was
found and fixed (highest-priority recommendations were previously buried at the bottom of the list).
