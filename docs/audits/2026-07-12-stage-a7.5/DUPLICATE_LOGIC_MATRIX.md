# Duplicate Logic Matrix — Invariant I6

Audit date: 2026-07-12

## Summary

2 findings: 1 FAIL, 1 WARN

No logic is literally copy-pasted. The I6 violations are **unit-system divergence** — the same business rule expressed in different measurement units across files, bridged by ad-hoc inline conversions.

## Finding I6-001 — Margin Floor Unit Inconsistency (FAIL)

**Root cause:** `DEFAULT_MARGIN_FLOOR_PCT = 15` is defined in `src/domain/owner-finance/margin-safety-gate.ts` as a **percent** (0–100 scale). `opportunity-contract-guardrails.ts` uses the floor as a **fraction** (0..1 scale). The bridge is an ad-hoc `/100` conversion at the call site.

### Files involved

| File | Symbol | Unit | Value |
|---|---|---|---|
| `src/domain/owner-finance/margin-safety-gate.ts` | `DEFAULT_MARGIN_FLOOR_PCT` | percent (0–100) | 15 |
| `src/domain/owner-mode/opportunity-contract-guardrails.ts` | `minMargin` parameter | fraction (0..1) | expects 0.15 |
| `src/services/owner-mode/opportunity-decision.service.ts` | line 87 | conversion | `DEFAULT_MARGIN_FLOOR_PCT / 100` |

### Why this is a defect

Any new caller of `screenOpportunity` that imports `DEFAULT_MARGIN_FLOOR_PCT` and passes it directly (without the `/100`) will silently use a margin floor of 15.0 instead of 0.15 — 100× too large. This cannot be caught at compile time because both are `number`.

### Canonical fix (deferred)

Pick one unit system for all margin comparisons. Recommend **fraction (0..1)** as it is the more common convention for ratios:
1. Rename constant to `DEFAULT_MARGIN_FLOOR = 0.15` in `margin-safety-gate.ts`
2. Remove the `/100` conversion in `opportunity-decision.service.ts`
3. Audit all callers of `DEFAULT_MARGIN_FLOOR_PCT` to remove implicit unit conversions

## Finding I6-002 — Net vs Gross Margin Floors (WARN)

**Root cause:** Two independent margin floor constants guard the same risk class (margin safety) but measure different margin types.

| File | Symbol | Metric | Value |
|---|---|---|---|
| `src/domain/owner-finance/margin-safety-gate.ts` | `DEFAULT_MARGIN_FLOOR_PCT` | Gross margin | 15% |
| `src/domain/owner-mode/cash-profit-protection.ts` | `NET_MARGIN_FLOOR` | Net margin | 5% |

**Why NOT a FAIL:** Net margin and gross margin are different business metrics; having separate floors for each is legitimate. The defect is the absence of cross-referencing comments. If the business changes its margin safety policy, a developer updating one constant has no signal that the other exists.

**Recommended fix (deferred):** Add a comment in each file cross-referencing the other. If these floors are intended to be derived from each other (e.g., net = gross × 0.33), encode that relationship explicitly instead of having two magic numbers.
