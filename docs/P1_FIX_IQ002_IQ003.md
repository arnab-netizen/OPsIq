# P1 Fix: IQ-002 + IQ-003 — Evidence Quality Tier and Staleness Warning

**Version:** 1.0  
**Date:** 2026-06-23  
**Phase:** CREDIBILITY HARDENING — Phase C, Slice 2  
**Status:** IMPLEMENTED

---

## Findings Fixed

### IQ-002: No evidence quality tier shown for intake source

Intake data arrives from sources of wildly different reliability (accounting exports vs. manual forms). OpsIQ was treating all sources as equally trustworthy with no quality signal shown to the owner.

### IQ-003: Staleness not surfaced on command center

Finance snapshots older than 45 days are penalized in confidence scoring (via `isStaleSnapshot()`), but that signal was invisible to the owner. The command center showed no staleness indicator — diagnosis could be built on months-old data with no warning.

---

## Implementation

### 1. Evidence quality tier (`src/domain/owner-intake/types.ts`)

Added:
- `IntakeQualityTier = "Strong" | "Moderate" | "Weak" | "Assumed"` type
- `sourceQualityTier(source: IntakeSource): IntakeQualityTier` — deterministic pure function
- Tier mapping:
  - **Strong**: `accounting_export`, `bank_statement`, `pos_order_upload` — direct system exports
  - **Moderate**: `csv_upload`, `google_sheets` — structured but manually prepared
  - **Weak**: `manual_form`, `email_import` — manually entered
  - **Assumed**: `lead_import` — external/indirect

### 2. Intake page (`src/app/(authenticated)/owner/intake/page.tsx`)

- Imported `sourceQualityTier` and `IntakeSource` from the domain
- Added `Evidence quality: [tier]` badge to `IntakeCandidate` component below the source/row-count line
- Added the same tier badge to each intake history row

### 3. Staleness computation (`src/services/owner-condition/business-condition.service.ts`)

Added `isStaleData: boolean` and `dataAgeDays: number | null` to `BusinessConditionResult` interface.

In `getBusinessCondition()`:
- After fetching `latestFinanceSnapshot`, computes `ageDays = (now - periodEnd) / 86400000`
- Sets `isStaleData = ageDays > 45` (matching the 45-day threshold used in `computeDataConfidence()`)
- Passes both fields through all return paths (no-business, no-data, and profile-ready)

### 4. Staleness warning on command center (`src/app/(authenticated)/owner/page.tsx`)

Added conditional banner above missing-data notice:
```tsx
{data.isStaleData && (
  <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-sm flex items-center justify-between">
    <span>
      <strong>Stale data:</strong> Your finance data is {data.dataAgeDays} day(s) old — diagnosis may not reflect current conditions.
    </span>
    <Link href="/owner/intake" className="ml-4 underline whitespace-nowrap">Update now →</Link>
  </div>
)}
```

---

## Acceptance Criteria

- [x] `sourceQualityTier()` returns deterministic tier for all 8 intake sources
- [x] Intake candidate review shows "Evidence quality: [tier]" badge
- [x] Intake history shows tier badge per row
- [x] `getBusinessCondition()` computes `isStaleData` from `periodEnd` vs now (threshold: 45 days)
- [x] `BusinessConditionResult` declares `isStaleData` and `dataAgeDays`
- [x] Command center shows stale-data warning with age in days and link to intake when stale
- [x] No warning shown when data is fresh or no snapshot exists
- [x] TypeScript compiles clean
- [x] 54/54 simulation tests pass

---

## Files Changed

- `src/domain/owner-intake/types.ts` — added `IntakeQualityTier`, `sourceQualityTier()`
- `src/app/(authenticated)/owner/intake/page.tsx` — rendered quality tier badge in candidate preview and history
- `src/services/owner-condition/business-condition.service.ts` — added `isStaleData`/`dataAgeDays` to `BusinessConditionResult` and `getBusinessCondition()`
- `src/app/(authenticated)/owner/page.tsx` — rendered staleness warning banner
