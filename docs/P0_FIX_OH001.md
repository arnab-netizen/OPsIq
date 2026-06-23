# P0 Fix: OH-001 — Navigation Buttons Tap Target Size

**Version:** 1.0  
**Date:** 2026-06-23  
**Phase:** HOSTILE AUDIT REMEDIATION — Phase C, Slice 5  
**Branch:** claude/cool-ptolemy-dxrpm7  
**Status:** IMPLEMENTED

---

## Finding Fixed

### OH-001: Navigation buttons — tap target failure

**File:** `src/app/(authenticated)/owner/page.tsx` (nav row, lines 73–86)

**Risk:** 12 navigation buttons in a single `flex gap-2` row compressed to ~25–30px width on a 375px mobile viewport. WCAG 2.5.5 requires 44×44px minimum tap targets. Trade owners on job sites with gloves could not reliably navigate between domains.

---

## Implementation

Two changes to the nav row:

1. **`flex-wrap`** added to the container: buttons now wrap to multiple lines on narrow viewports instead of compressing horizontally.

2. **`min-h-[44px] min-w-[44px] py-3`** applied to every `<Button>`: enforces WCAG 2.5.5 44×44px minimum tap target regardless of label length or viewport width.

---

## Acceptance Criteria

- [x] Each navigation button is ≥44px height at all viewport widths
- [x] Each navigation button is ≥44px width (enforced by `min-w-[44px]`)
- [x] Buttons wrap to next line on narrow viewports (≤375px) rather than compressing
- [x] TypeScript compiles clean

---

## Known Limitations

- This is the minimum WCAG fix. A full mobile-first improvement would move the nav to a bottom sheet or slide-out drawer on mobile (preserving above-fold real estate). That is P1 UX work.
- The `py-3` class relies on Tailwind's default spacing scale (12px top + 12px bottom = 24px padding), plus the button's default font size, to reach ≥44px total height. If the Button component has `line-height` or `font-size` changes that reduce height below 44px, an explicit `h-11` class should replace `py-3`.

---

## Files Changed

- `src/app/(authenticated)/owner/page.tsx` — nav container: `flex gap-2` → `flex flex-wrap gap-2`; each Button: added `className="min-h-[44px] min-w-[44px] py-3"`
