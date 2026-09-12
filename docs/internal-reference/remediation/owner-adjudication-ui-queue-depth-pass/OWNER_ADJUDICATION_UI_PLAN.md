# Owner Adjudication UI / Queue — PLAN

## Objective
Make proof-risk review usable by the owner **in the app**, without raw API calls. The owner sees the
active findings, why each was raised, its evidence, and can pick one of the seven governed outcomes,
enter a required reason, and submit — reducing noise or keeping risk active, all audited via the
existing backend. Minimal UI, no redesign, no new business logic in the UI, no fraud/negligence labels,
no hidden score.

## Architecture (no business logic in the UI)
```
getOwnerNowView (existing service)
        │  proof-risk blocks: reusedProofFindings, topGamingSignal,
        │  topCredibilityConcern, timingEvidence, proofRiskAdjudications
        ▼
buildAdjudicationQueue (NEW pure domain)  ── flattens → AdjudicationQueueItem[] + summary
        ▼
GET /api/owner/proof-risk/queue (NEW route, OWNER_VIEW, workspace-scoped)
        ▼
/owner/adjudication page (NEW client)  ──renders──►  <AdjudicationQueue/> (NEW prop-driven component)
        │                                                     │ owner picks outcome + reason
        └──────── POST /api/proof-risk/adjudicate ◄───────────┘ (existing canonical route + service)
```
- The **flatten** (which block → which sourceType/sourceRef/proofIds) is a **pure domain function**,
  server-side and unit-tested — never in the component.
- The **component** is prop-driven: it renders items + a form and calls `onAdjudicate`; it performs no
  fetch and holds no risk logic, so it is testable in jsdom without a browser or DB.
- The **outcome effects** (clear / keep-active / inconclusive) are enforced by the existing service; the
  UI only labels them.

## Queue item content (concise, not a raw dump)
source type · finding type · plain title · severity · source completeness · owner explanation ·
supporting-proof count · a few representative refs (≤5) · actor (if known) · current adjudication
status · recommended action · missing data. BLOCKED_BY_DATA findings render but are not adjudicable.

## Outcomes (all seven, plain labels)
DISMISS_FALSE_POSITIVE / ACCEPT_AS_VALID (reduce noise) · REQUIRE_FRESH_PROOF /
CONFIRM_SUSPICIOUS_PATTERN / ESCALATE_FOR_TRAINING / ESCALATE_FOR_OWNER_REVIEW (keep active) ·
MARK_INCONCLUSIVE_NEEDS_DATA. A reason (≥3 chars) is required before submit.

## Safety / fairness
Titles use "Needs review", "Possible reused proof", "Review quality concern", "Timing concern",
"Escalation overdue". A standing note states: *"This is a review flag, not a fraud, theft, or
negligence accusation. Owner review/adjudication is required before taking any personnel action."* No
hidden staff score is surfaced.

## Now-view integration
A "Proof-risk review queue" link is added to the Owner Now View header; the queue page has a link back.

## Out of scope
UI redesign; Process Intelligence; public SaaS / billing / Product Hunt; HR discipline tooling; hidden
scores; browser E2E (kept unproven — jsdom component/page proof only).
