# G5 Coverage Delta — required-lane owner-journey smoke (owner-journey stage 12)

| Aspect | Before (Wave 8) | After (G5) |
|---|---|---|
| Consolidated owner-journey smoke | Only in the non-required, OOM-prone browser lane | **Promoted** into the required maintained vitest lane |
| Memory stability | `next build` + browser packs (heap-OOM-prone) | **Memory-stable** (no browser, no `next build`) |
| Intake → diagnosis → recommendations → adaptive chain | Not proven end-to-end in a required lane | **Proven** in one required-lane walk |
| `OWNER_JOURNEY_STAGES` seam | Inert (no consumer) | **Consumed** (first consumer; dimension + stage coverage asserted) |
| Owner-journey regressions block merges | No | **Yes** (required gate) |

Stage-12 proof state moves from `planned_gap` → covered. The owner journey's core end-to-end chain
now has a required, memory-stable smoke, and the Wave-8 journey manifest seam has its first consumer.
