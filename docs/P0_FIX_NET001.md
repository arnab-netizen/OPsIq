# P0 Fix: NET-001 — Fetch Timeout and Retry (Minimum Offline Capability)

**Version:** 1.0  
**Date:** 2026-06-23  
**Phase:** HOSTILE AUDIT REMEDIATION — Phase C, Slice 6  
**Branch:** claude/cool-ptolemy-dxrpm7  
**Status:** IMPLEMENTED (minimum fix)

---

## Finding Fixed

### NET-001: No offline capability

**Risk:** Owner on a vessel or job site with poor network sees a blank loading state indefinitely. No timeout, no retry mechanism, no cached state. Owner cannot access their P1 action when they need it most.

---

## Implementation

**File:** `src/app/(authenticated)/owner/page.tsx`

### 1. Fetch timeout (10 seconds)

The `api()` function now wraps every fetch with an `AbortController` that fires after 10,000ms:

```typescript
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
// ...
if (e.name === "AbortError") throw new Error("Request timed out after 10 seconds...");
```

The timeout constant `FETCH_TIMEOUT_MS = 10_000` is module-level for easy tuning.

If the request times out, an `AbortError` is caught and surfaced as a human-readable message with guidance ("Check your connection and try again.").

### 2. Retry button on initial load failure

When the command center fails to load (no existing data to display), the error state now renders:
- Error description
- A "Retry" button that calls `load()` again

This gives the owner a clear recovery path without requiring a full page reload.

---

## Minimum vs Complete Fix

| Level | What it provides | Status |
|-------|-----------------|--------|
| Minimum (this fix) | 10s timeout + retry button | IMPLEMENTED |
| Complete | Service worker / PWA with offline cache | P1 — infrastructure decision; not in this slice |

The complete PWA fix requires `next-pwa` or `workbox` integration and a caching strategy decision (stale-while-revalidate vs cache-first). That is a separate infrastructure slice.

---

## Acceptance Criteria

- [x] Fetch on `/api/owner/command-center` times out after 10 seconds when network is unavailable
- [x] Timeout surfaces as a human-readable error (not a generic "Failed to load")
- [x] Error state on initial load shows a "Retry" button that re-triggers `load()`
- [x] Retry button meets WCAG 2.5.5 `min-h-[44px]`
- [x] When data is already loaded, subsequent fetch errors show in the existing inline error banner (not the full-page error state)
- [x] TypeScript compiles clean

---

## Files Changed

- `src/app/(authenticated)/owner/page.tsx` — `api()` function: `AbortController` with 10s timeout; full-page error state with retry button when initial load fails
