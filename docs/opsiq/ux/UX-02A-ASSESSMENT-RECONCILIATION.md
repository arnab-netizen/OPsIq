# UX-02A — Canonical Owner Assessment Reconciliation

Documents current behavior only. No roadmap, no speculative future state.

## Purpose

OpsIQ computes several signals an engineer could mistakenly call "the assessment."
This module (`src/domain/owner-guidance/owner-assessment-reconciliation.ts`) does not
compute a new verdict. It reconciles the existing `OwnerNowView` fields (the canonical
owner-assessment core) with the existing `derivedBusinessCondition` detail into one
`CanonicalOwnerAssessment` structured-truth contract, and encodes the one rule not
already explicit anywhere: missing/unknown data reduces certainty (readiness); it never
by itself worsens reported health or condition detail.

## Source matrix

| Record | ROLE | PURPOSE | CAN IT OVERRIDE OVERALL HEALTH | CURRENT SOURCE FILE |
|---|---|---|---|---|
| OwnerNowView | canonical | The real-time 360° owner-guidance loop's output: classification, businessHealth, confidence, top actions, urgent risks, per-area statuses. This is the canonical owner-assessment core UX-02A reconciles. | yes (it *is* the overall assessment) | `src/domain/owner-guidance/guidance-orchestrator.ts` (`buildOwnerNowView`), assembled with live context in `src/services/owner-guidance/owner-now-view.service.ts` |
| derivedBusinessCondition | supporting | 11-dimension explanatory detail (cash/margin pressure, dependency risks, maturity levels, resilience, growth readiness), derived purely from the same live snapshot scalars `OwnerNowView` already uses. Unknown signals stay `"unknown"`, never fabricated. | no | `src/services/business-condition/business-condition-profile.service.ts` (`deriveBusinessConditionSignals`), called inline at `src/services/owner-guidance/owner-now-view.service.ts:2420` |
| Domain diagnoses (Finance/Cashflow/Operations/Sales/Marketing/etc) | supporting | Domain-specific diagnosis and action generation feeding into the guidance context's issues; legitimate detail and domain actions. | no | e.g. `src/services/owner-finance/diagnosis.service.ts`, `src/services/owner-cashflow/diagnosis.service.ts`, `src/services/diagnosis.ts` (manual-entry diagnosis) |
| financeTopPriority | supporting | An existing priority/action input surfaced alongside `OwnerNowView` on the cockpit API response; not a second overall-health computation. | no | `src/services/owner-guidance/cockpit-finance-priority.service.ts` (`getCockpitFinancePriority`), attached in `src/app/api/owner/now-view/route.ts` |
| Recovery status | supporting | Owner-recovery-mode context; contextual/supporting surface. | no | `src/services/owner-mode/owner-recovery-status.service.ts` |
| Public signals | excluded-from-owner-overall-assessment | External/public-facing business signals (e.g. the public SMB DTO); not part of the owner's internal assessment loop. | no | `src/domain/public/smb-dto.ts` |
| Business Operating System (BOS) | supporting | A contextual operating-system-level view (`BusinessOperatingSystemView`) assembled alongside `OwnerNowView`; supporting surface, not the verdict. | no | `src/services/owner-guidance/owner-now-view.service.ts` (`BusinessOperatingSystemView` interface + assembly) |
| Legacy persisted BusinessConditionProfile | excluded-from-owner-overall-assessment | Consultant/engagement-side persisted condition record (CRUD: `createBusinessConditionProfile`, `updateBusinessConditionProfile`, `getEffectiveBusinessConditionProfile`). The owner cockpit's condition detail does **not** read this persisted record — it is derived fresh from live snapshot data via the pure `deriveBusinessConditionSignals` function in the same file. The consultant/engagement-keyed write path (`assessCondition`, keyed by `engagementId`) lives separately. Its name sounds authoritative but it must not silently become the self-serve owner's canonical assessment. | no | `src/services/business-condition/business-condition-profile.service.ts` (persistence + `deriveBusinessConditionSignals`); consultant/engagement path in `src/services/business-condition.ts` (`assessCondition`) |

## Critical semantic rule

Missing data is not a negative business verdict. Missing data reduces **certainty**
(readiness), not **condition** (health/status). Likewise, the absence of a detected
problem is not proof of health when evidence is insufficient — `OwnerNowView`'s
per-area status logic can naturally produce `"OK"` when no issue was found; under
genuinely insufficient evidence, `CanonicalOwnerAssessment` reports `health: null`
rather than reinterpreting "no detected issue" as "healthy."

## Readiness rule (implemented exactly, see module for the precise boolean logic)

- **INSUFFICIENT** — confidence is `INSUFFICIENT`, zero condition dimensions are known,
  and there is no issue evidence (`topOwnerActions` and `urgentRisks` both empty).
- **LIMITED** — otherwise, if confidence is capped, there is any missing-data request,
  or any condition dimension is unknown.
- **AVAILABLE** — otherwise.

## Health rule

- `readiness === "INSUFFICIENT"` → `health: null` and every `areaStatus` field `null`.
- `readiness` is `LIMITED` or `AVAILABLE` → `health` is exactly `OwnerNowView.businessHealth`
  (and each `areaStatus` field is exactly its corresponding `OwnerNowView` status).
  No recalculation, no averaging, no worst-dimension override.

## Boundary for UX-02B

UX-02B must consume `CanonicalOwnerAssessment` and must not reimplement its readiness
or health reconciliation rules inside a React component. All owner-facing prose
("Your business is...") is out of scope for UX-02A.
