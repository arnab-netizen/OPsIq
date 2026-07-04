# Module 11 (Trust, Audit & Explainability) — Slice 1: Explainability Engine — Report

Status: **BUILT + LOCALLY VERIFIED.** Pure deterministic explainability engine that
turns any proven `OwnerFinding` (+ its `OwnerAction`) into a credible, owner-readable
explanation carrying the eight §18-required fields, with the anti-hallucination rule
enforced structurally. No DB/API/UI. Module 1 + all proven modules untouched.
Public/SaaS frozen.

## 1. Why this is the correct next slice + why no migration

Per execution.md §18, Module 11 makes recommendations credible: every recommendation
must show what was detected, why it matters, the source data used, the calculation
used, the confidence level, the risk if ignored, the expected impact, and the
verification method — and the system must never invent values. This is a
cross-cutting layer over data the proven domains already persist (findings carry
sourceMetric/value/threshold/evidence/confidence; actions carry verification +
impact), so it owns no new entity and has **no migration gate**. Slice 1 is the
deterministic engine — the credibility core.

## 2. Files created

- `src/domain/owner-trust/types.ts` — `ExplanationCard` (the eight §18 fields +
  `dataGaps` + `hasInventedValues: false` invariant), `ExplanationSource`,
  `TrustLabel`.
- `src/domain/owner-trust/explainability.ts` — `buildExplanation(finding, action?)`
  + `buildExplanations(findings, actions)` (pairs by findingCode) + the
  `NEVER_INVENT` allowlist (revenue/costs/customers/staff/market/competitor/tax-legal
  /guaranteed-outcomes). Confidence + impact band labels.
- `src/domain/owner-trust/index.ts` — barrel.
- `src/__tests__/owner-trust/explainability.test.ts` — 10 tests.

## 3. Honesty / governance (the anti-hallucination rule)

- The engine reads only values present on the finding/action — it never fabricates.
- A missing source value renders `value: null` + `valueLabel: "missing"`, the
  calculation says "Not computable … no value was inferred or invented", and the
  metric is added to `dataGaps`. `hasInventedValues` is a hard-coded `false` invariant.
- A threshold-free metric is described against "the domain baseline" — no threshold
  is invented. Opportunities are framed as uncaptured upside with no downside risk.

## 4. Verification (local)

| Gate | Result |
|---|---|
| `npx vitest run src/__tests__/owner-trust/` | 10 passed |
| `npx eslint src/domain/owner-trust src/__tests__/owner-trust` | clean |
| `npm run lint:ratchet` | LINT_RATCHET_PASS (changed_file_lint_errors 0) |

## 5. Gate status

**No gate reached** (pure domain code + tests; no migration — read-only layer).
Next: **Slice 2 — API + service** (`/api/owner/trust/explanations` over a cycle's
findings/actions via the proven diagnosis reads, + an audit-trail read over the
existing audit events). Then UI, deployed runtime proof, audit. Public/SaaS stays
frozen.
