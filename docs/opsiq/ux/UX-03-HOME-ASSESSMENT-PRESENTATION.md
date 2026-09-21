# UX-03 — Home Canonical Assessment Presentation

Documents current implemented behavior only. No speculative roadmap.

## 1. Purpose

`/owner/cockpit` (Home) plainly answers, near the top of the page:

1. How is my business doing?
2. What is the main issue, if one exists?
3. How confident is OpsIQ?
4. If evidence is incomplete, what specific data should I provide next?

UX-03 is presentation only. It adds no assessment logic — the decision chain
was already complete before this phase.

## 2. Canonical data flow

```
existing evidence / diagnosis
        ↓
OwnerNowView                              (GET /api/owner/now-view -> data.view)
        ↓
reconcileOwnerAssessment(...)             (UX-02A)
        ↓
CanonicalOwnerAssessment
        ↓
composeOwnerAssessment(...)               (UX-02B)
        ↓
OwnerAssessmentNarrative
        ↓
<OwnerAssessmentSummary narrative={...} />  (UX-03, this phase)
```

`src/app/(authenticated)/owner/cockpit/page.tsx`'s `load()` builds the
canonical assessment from the CURRENT now-view response's `data.view`
(`OwnerNowView`) and `data.derivedBusinessCondition`, inside the existing
`loadGenerationRef` stale-response guard (see §9). `view.businessId` — never
`activeBusinessId` — is the canonical assessment's business identity, since
`OwnerNowView` is itself already scoped to the requested business.

## 3. Exact Home placement

Within the page's returned JSX, in this order:

```
PageHeader
cockpit action/result message, when present
{assessmentNarrative && <OwnerAssessmentSummary narrative={assessmentNarrative} />}
StartHereContinuationCard
loading skeleton | error/Retry | MinimumOwnerCockpit
```

`OwnerAssessmentSummary` is a plain conditional (`&&`) at a fixed JSX
position alongside `StartHereContinuationCard` — it does not wrap or
restructure `StartHereContinuationCard`, so `StartHereContinuationCard`'s
own mount stability (documented in its file) is unaffected.

## 4. Exact rendered fields

`OwnerAssessmentSummary` (`src/components/owner/OwnerAssessmentSummary.tsx`)
renders, verbatim, only the fields already computed by `composeOwnerAssessment`:

- A fixed eyebrow label: "Business assessment".
- `narrative.headline` — the dominant text in the block.
- `narrative.primaryConcern` — only when non-null (see §5).
- `narrative.confidenceLabel` and `narrative.confidenceMessage`, together.
- `narrative.nextDataStep`, under a fixed "Next data step" label — only when
  non-null (see §6).

The component takes no other inputs and computes nothing: no fetch, no
`useActiveBusiness`, no Prisma, no service import, no `OwnerNowView` import,
no reconciliation, no health calculation, no category mapping, no
confidence mapping.

## 5. Conditional `primaryConcern` behavior

Rendered only when `narrative.primaryConcern !== null`. No placeholder text
("No concern", "Everything looks fine", "No issues") is ever substituted
when it is null — the block is simply omitted.

## 6. Conditional `nextDataStep` behavior

Rendered only when `narrative.nextDataStep !== null`, under the "Next data
step" label, together with the secondary action described in §7. When null,
neither the label, the text, nor the CTA is rendered.

## 7. `/owner/data` CTA behavior

When `nextDataStep` is present, a single secondary action, "Update business
data", links to `/owner/data`. It never appears when `nextDataStep` is null.

## 8. Loading / error / zero-business rules

Unchanged from the existing page behavior:

- **Zero business**: the existing "Set up your business to get your first
  assessment" empty state (with its `/owner/data` action) renders instead of
  any assessment. No assessment is ever manufactured without a business.
- **Loading**: `assessmentNarrative` is cleared to `null` at the very start
  of every `load()` call (before the network awaits), so no old business's
  assessment can render while a new business's request is in flight.
- **Fatal now-view error**: the existing governed error/Retry state renders;
  `assessmentNarrative` stays `null` (it was cleared at the start of the
  failed `load()` and is only set on the success path), so no assessment
  ever renders alongside the error.

## 9. Stale-response / business-switch protection

The assessment participates in the exact same `loadGenerationRef` guard
already protecting every other piece of `load()`'s state — no second race-
control mechanism was added. `reconcileOwnerAssessment`/
`composeOwnerAssessment` are only called, and `setAssessmentNarrative` is
only invoked, after the existing `if (loadGenerationRef.current !== generation)
return;` check inside `load()`. A late response for a business the owner has
since switched away from can therefore never overwrite the current
business's assessment — proven by a dedicated out-of-order test (see §13).

## 10. `MinimumOwnerCockpit` is unchanged

`src/components/owner/MinimumOwnerCockpit.tsx` was not modified. The
canonical assessment is added ABOVE it; all of its existing detailed/
supporting condition information remains available below, unchanged. This
is progressive disclosure, not feature replacement.

## 11. No new assessment logic

`OwnerAssessmentSummary` and the page's construction of the canonical
assessment contain no scoring, ranking, averaging, reranking, or
recalculation of readiness, health, confidence, or issue priority. The page
calls `reconcileOwnerAssessment` then `composeOwnerAssessment` and renders
the result verbatim.

## 12. Forbidden alternative assessment sources

The following are never read to determine or override the rendered
assessment: Finance diagnosis, Recovery status, public signals, and the
legacy persisted `BusinessConditionProfile`. The sole assessment pipeline is
the one in §2.

## 13. Test evidence

- `src/__tests__/components/owner-assessment-summary.test.tsx` — 10 tests,
  component-level proof (headline/primaryConcern/confidence/nextDataStep
  verbatim rendering, no fabricated placeholder, next-data block/CTA hidden
  when null, no businessId or raw enum leakage).
- `src/__tests__/components/owner-cockpit-assessment-presentation.test.tsx`
  — 7 scenarios (A–G) through the real page and `ActiveBusinessProvider`:
  AVAILABLE+OK, LIMITED+DANGER+CASH_DANGER+missing data, INSUFFICIENT,
  limited-confidence-does-not-worsen-health, condition-detail-cannot-
  override-health, primary-issue-not-reranked, and an out-of-order
  business-switch stale-response proof.
- Existing cockpit regression suites (business-switch race, business-switch
  modal reset, record-outcome businessId, request-reassessment businessId,
  `MinimumOwnerCockpit`, canonical navigation) were re-run unmodified and
  continue to pass — none of their now-view fixtures include `view`, so the
  new assessment block simply does not render in those tests (no assertion
  conflict).

## 14. Boundary for the next UX phase

Any future phase that changes how the assessment is visually
presented (styling, layout, additional Home sections) must continue to
consume `OwnerAssessmentNarrative` from `composeOwnerAssessment(
reconcileOwnerAssessment(...))` verbatim. It must not reimplement headline,
primary-concern, confidence, or next-data-step logic inside a React
component.
