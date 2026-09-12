# FINAL — Owner Cockpit Surface Consolidation / Route Hygiene (PASS 38)

**Date:** 2026-07-07 · **Branch:** `claude/owner-cockpit-surface-consolidation-route-hygiene`
**Base main:** `9d3d7245` (contains PR #165–#169)
**Classification:** `OWNER_COCKPIT_ROUTE_CONSOLIDATION_PROVEN` (subject to required CI green)

## Objective
Reduce owner confusion by making `/owner/cockpit` the canonical owner surface and
safely handling the older owner routes — **without** deleting functionality, breaking
workflows, exposing frozen capabilities, hiding safety gates, or doing a broad redesign.

## The problem found (evidence)
The **only** owner entry in the sidebar nav was **"Owner Recovery" → `/owner/recovery`**
(the older recovery-cycle CRUD engine). There was **no** nav entry for the canonical
`/owner/cockpit` built in PASS 36 — the daily decision surface was effectively hidden,
and multiple owner surfaces (`/owner`, `/owner/now`, `/owner/process-intelligence`,
`/owner/recovery`) competed with no obvious front door.

## Route decisions
| Route | Decision | Change |
|-------|----------|--------|
| `/owner/cockpit` | **KEEP_AS_CANONICAL** | Primary owner sidebar entry now points here. |
| `/owner` | KEEP_AS_DEEP_LINK | + CanonicalCockpitLink banner → cockpit. |
| `/owner/now` | KEEP_AS_DEEP_LINK | + CanonicalCockpitLink banner → cockpit. |
| `/owner/process-intelligence` | KEEP_AS_DEEP_LINK ("full detail") | + CanonicalCockpitLink banner → cockpit. |
| `/owner/recovery` | KEEP_READ_ONLY_LEGACY | Dropped from primary nav; still reachable via `/owner` + `/owner/home` deep-links (not orphaned). |

## What changed
- **`sidebar-nav.tsx`** — primary owner entry retargeted: *"Owner Recovery" → `/owner/recovery`*
  becomes *"Owner Cockpit" → `/owner/cockpit`* (kept OWNER_VIEW-gated).
- **`CanonicalCockpitLink.tsx`** (new) — a one-line, low-load banner linking to
  `/owner/cockpit`; added to `/owner`, `/owner/now`, `/owner/process-intelligence`.
- No page/component deleted; no backend logic added; no safety gate touched.

## Owner-load impact
- Duplicate-cockpit risk: MEDIUM → LOW. Route confusion: HIGH → LOW. Hidden-capability
  risk (cockpit had no nav entry): MEDIUM → LOW. Stale-page risk: MEDIUM → LOW.
- The banner is functional (no marketing/pricing/guarantee copy — asserted by test).

## Tests
- **Component:** `owner-canonical-navigation.test.tsx` — 5/5 (primary nav → `/owner/cockpit`;
  old "Owner Recovery" label gone; OWNER_VIEW-gated; banner → `/owner/cockpit`; no
  forbidden/marketing copy). Existing cockpit + PI-page tests still green (40 total).
- **Browser:** `46-owner-cockpit.spec.ts` extended — primary owner nav shows a link to
  `/owner/cockpit`; `/owner/now` shows the canonical banner and still renders (nothing
  deleted). Runs in `owner-pilot-e2e`.

## Gates run (local)
prisma validate ✓ · tsc ✓ · governance:scan (0 new) ✓ · governance:scan:strict (no new in
changed files) ✓ · lint:ratchet (0 new) ✓ · component/page tests 40 ✓ · `next build` ✓
(`/owner/cockpit` + `/owner/now` + `/owner/process-intelligence` present).

## Classification justification
`/owner/cockpit` is canonical; every old owner route is classified and handled; owner
navigation is clear (one obvious daily entry + banners back to it); duplicate/conflicting
cockpit risk reduced; safety gates unchanged; no frozen capability exposed; component +
browser proof pass; required CI must be green. → `OWNER_COCKPIT_ROUTE_CONSOLIDATION_PROVEN`.

## Deferred (honest)
Remaining `prompt()` on `/owner/process-intelligence`; hard redirect of `/owner/now`;
unifying the two recovery engines; trimming `/owner` command-center overlap. See
DEFERRED_BROAD_GAPS.md.
