# UX-02B — Owner-Facing Assessment Composer

## 1. Purpose

UX-02B converts `CanonicalOwnerAssessment` (UX-02A) into deterministic
owner-facing copy, answering exactly four questions in plain business
language:

1. How is my business doing?
2. What is the main issue, if one exists?
3. How confident is OpsIQ in that assessment?
4. If the evidence is incomplete, what specific data should I provide next?

The composer (`src/domain/owner-guidance/owner-assessment-composer.ts`,
`composeOwnerAssessment`) is a pure mapping function: no fetch, no Prisma, no
`Date`/`Date.now`, no `Math.random`, no environment access, no React. It does
not decide anything UX-02A has not already decided.

## 2. Dependency rule

```
existing evidence/diagnosis
        ↓
OwnerNowView
        ↓
UX-02A CanonicalOwnerAssessment
        ↓
UX-02B owner-facing narrative (this module)
        ↓
UX-03 Home presentation
```

UX-02B consumes `CanonicalOwnerAssessment` only. It does not read
`OwnerNowView`, `derivedBusinessCondition`, domain diagnoses,
`financeTopPriority`, Recovery state, public signals, or the legacy
persisted `BusinessConditionProfile` directly — those were already
reconciled by UX-02A.

## 3. Headline matrix (exact strings)

| readiness | health | headline |
|---|---|---|
| `INSUFFICIENT` | (ignored) | "There isn't enough evidence to assess this business yet." |
| `AVAILABLE` / `LIMITED` | `OK` | "No major problem is showing in the current evidence." |
| `AVAILABLE` / `LIMITED` | `WATCH` | "There are areas of the business to watch." |
| `AVAILABLE` / `LIMITED` | `DANGER` | "The business needs attention." |
| `AVAILABLE` / `LIMITED` | `CRITICAL` | "The business needs urgent attention." |
| `AVAILABLE` / `LIMITED` | `null` (defensive, should not occur under the UX-02A contract) | falls back to the `INSUFFICIENT` headline; never throws |

The headline is determined only by `readiness` and, when `readiness !==
"INSUFFICIENT"`, by `health`. It never inspects `conditionDimensions`,
`missingData`, `confidence`, `confidenceCapped`, or `urgentRisks`.

## 4. Primary-concern category mapping (exact strings)

`primaryConcern` is `null` when `assessment.primaryIssue` is `null`.
Otherwise it maps `primaryIssue.category` (never reranked, never replaced
by `urgentRisks[0]`, never selected from `conditionDimensions`):

| `IssueCategory` | primaryConcern |
|---|---|
| `CASH_DANGER` | "Cash flow is the first issue to address." |
| `CUSTOMER_SERVICE_FAILURE` | "Customer service or quality is the first issue to address." |
| `OVERLOAD` | "Staff or owner workload is the first issue to address." |
| `PROFIT_LEAK` | "Profitability is the first issue to address." |
| `CAPACITY_BOTTLENECK` | "Capacity or supply constraints are the first issue to address." |
| `COMPLIANCE_SAFETY_RISK` | "Compliance or safety is the first issue to address." |
| `BLOCKED_EXECUTION` | "Work that cannot move forward is the first issue to address." |
| `PENDING_PROOF_OUTCOME` | "Missing proof or an outcome check is the first issue to address." |
| `GROWTH_OPPORTUNITY` | "Growth is the first opportunity to consider." |
| `PROCESS_IMPROVEMENT` | "Process improvement is the first opportunity to consider." |

`primaryIssue.id` and `primaryIssue.headline` are never rendered — the raw
headline can legitimately contain internal/implementation-derived language,
and the id is an internal identifier. This is a deliberate owner-safe
boundary; the upstream headlines are not modified by this mission.

## 5. Confidence copy rules

`confidenceLabel` — readiness takes precedence over the raw confidence enum:

- `INSUFFICIENT` → "Not enough evidence"
- `LIMITED` → "Limited confidence"
- `AVAILABLE` → maps `assessment.confidence`: `VERIFIED` → "Verified
  evidence", `STRONG` → "Strong evidence", `MODERATE` → "Moderate
  evidence", `WEAK` → "Limited evidence", `INSUFFICIENT` → "Limited
  evidence" (defensive fallback for inconsistent upstream input; never
  changes readiness).

`confidenceMessage`:

- `INSUFFICIENT` → "More current business data is needed before OpsIQ can
  make a reliable assessment."
- `LIMITED` with `missingData.length > 0` → "Some important data is
  missing, so this assessment is provisional."
- `LIMITED` with no missing data and `unknownConditionDimensionCount > 0`
  → "Some business signals are still unknown, so this assessment is
  provisional."
- `LIMITED` otherwise → "The available evidence limits how certain this
  assessment can be."
- `AVAILABLE` → "The assessment is supported by the available evidence."

No raw confidence enum value is ever rendered verbatim.

## 6. Missing-data next-step rule

`assessment.missingData` is already ordered smallest-useful-first by
UX-02A; the composer never sorts it and uses only `missingData[0]`.

- If `missingData.length > 0`: trim trailing whitespace and trailing
  period characters from the first item, then append a single final
  period — `` `Add or update ${item}.` ``.
- Else if `readiness === "INSUFFICIENT"`: "Add recent operating data for
  this business."
- Else: `null` (no missing data is never fabricated).

## 7. Missing data reduces certainty, not condition.

Missing data and unknown condition dimensions can only change
`confidenceLabel`/`confidenceMessage`. They never change `headline` or
`primaryConcern`. A `CRITICAL` value inside `conditionDimensions` cannot
override `health === "OK"` — that reconciliation decision belongs to
UX-02A and is not reopened here.

## 8. UX-02B does not compute, rank, score, or diagnose.

The composer never: calculates a score, averages or ranks `areaStatus`,
ranks `conditionDimensions`, ranks or resorts `urgentRisks`, changes
`primaryIssue`, `health`, `readiness`, `confidence`, `confidenceCapped`,
or the order of `missingData`. It is purely
`CanonicalOwnerAssessment → OwnerAssessmentNarrative`.

## 9. UX-02B does not use the legacy `BusinessConditionProfile`.

The composer's only input type is `CanonicalOwnerAssessment`. It has no
import path to `BusinessConditionProfile`, Prisma, or any database read.

## 10. Boundary for UX-03

UX-03 may render `OwnerAssessmentNarrative` fields on Home (headline,
primaryConcern, confidenceLabel, confidenceMessage, nextDataStep), but it
must not reimplement any of the mappings in this document inside React —
it calls `composeOwnerAssessment(reconcileOwnerAssessment(...))` and
renders the result verbatim.
