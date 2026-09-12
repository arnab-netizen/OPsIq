# Deferred / Broad Gaps (PASS 36)

## Delivered in PASS 36
A canonical minimum owner cockpit (`/owner/cockpit`) that exposes the **proven**
governed execution loop in the 10-section safety layout, reusing the existing
`now-view` (read) and `process-execution` (action) routes. No new backend, no
duplicate logic, no weakened guard.

## Deferred beyond PASS 36 (unchanged from PASS 35)
1. **Wire the newest proven pipeline to an owner surface.** recovery-milestone-execution,
   business-survival-recovery, owner-cockpit-decision-explanation, and public-signal-*
   still have **no served endpoint**; surfacing them needs new API routes + services,
   not a UI-only change. Out of the minimum-cockpit scope by design.
2. **Consolidate/redirect the older cockpit surfaces.** `/owner`, `/owner/now`, and
   `/owner/process-intelligence` still exist alongside the new `/owner/cockpit`. A
   follow-up can make `/owner/cockpit` the default landing and redirect/retire the
   overlaps — deliberately not a big-bang refactor in this pass.
3. **Replace prompt()-based inputs elsewhere.** PASS 36 uses labelled controls in the
   new cockpit only; `/owner/process-intelligence` still uses `prompt()`.
4. **Business selector on the cockpit.** The new page uses the workspace-default
   business (no selector), matching `/owner/now`. Multi-business selection is a follow-up.

## Explicitly out of scope (frozen — not built, not implied)
Public SaaS, billing, Product Hunt / launch readiness, live integrations/connectors,
Local Mode, enterprise/compliance, autonomous browsing/external action, LLM/NLP,
private owner shadow pilot, marketing/landing/pricing.

## Honest limitation
Browser proof runs in the `owner-pilot-e2e` CI lane (which seeds + boots the real
app); it was not executed locally this session. Browser-proven is claimed only when
that CI check is green on the PR.
