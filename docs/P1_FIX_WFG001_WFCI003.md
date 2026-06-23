# P1 Fix: WF-G001 + WF-CI003 — Evidence Rationale and Evidence Reference on Actions

**Version:** 1.0  
**Date:** 2026-06-23  
**Phase:** CREDIBILITY HARDENING — Phase C, Slice 1  
**Status:** IMPLEMENTED

---

## Findings Fixed

### WF-G001: No "because" statement on recommended actions

Owner sees "Preserve cash immediately" with no explanation of why. OpsIQ was recommending actions without any evidence-backed rationale visible to the owner.

### WF-CI003: No evidence reference on actions

Owner had no way to verify the action was evidence-based rather than a generic template response.

---

## Implementation

### 1. `OwnerAction` schema (`src/domain/owner-spine/contracts.ts`)

Added two optional fields:
- `evidenceRationale?: string` — a human-readable "because" statement derived from `sourceMetric`, `sourceValue`, and `threshold`
- `evidence?: string[]` — evidence items from the finding that generated the action

### 2. Finance action planner (`src/domain/owner-finance/actions.ts`)

Added `buildEvidenceRationale()` helper that constructs a sentence:
- `"Your cashRunwayDays is 12 (threshold: 30)."` — when source value and threshold both known
- `"Your netMarginPct is -0.05."` — when only value known
- `"Based on your cashOnHand."` — fallback

`recommendationToOwnerAction()` now populates `evidenceRationale` and `evidence` from the recommendation.

### 3. Command center page (`src/app/(authenticated)/owner/page.tsx`)

Added two conditional display lines under the action description:
```tsx
{next.evidenceRationale && (
  <p className="text-xs text-muted-foreground mt-1 italic">
    Why: {next.evidenceRationale}
  </p>
)}
{next.evidence && next.evidence.length > 0 && (
  <p className="text-xs text-muted-foreground mt-1">
    Based on: {next.evidence.join(" · ")}
  </p>
)}
```

---

## Acceptance Criteria

- [x] Recommended action on /owner shows "Why: [rationale]" sentence
- [x] When evidence items are present, shows "Based on: [evidence items]"
- [x] Fields are optional — no rendering when absent (other domains without data won't show null)
- [x] TypeScript compiles clean
- [x] 335/335 simulation tests pass

---

## Files Changed

- `src/domain/owner-spine/contracts.ts` — added `evidenceRationale?` and `evidence?` to `ownerActionSchema`
- `src/domain/owner-finance/actions.ts` — added `buildEvidenceRationale()` helper; populated fields in `recommendationToOwnerAction()`
- `src/app/(authenticated)/owner/page.tsx` — rendered rationale and evidence below action description
